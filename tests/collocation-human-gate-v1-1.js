const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const read=path=>fs.readFileSync(path,'utf8');
const loadBrowserScript=path=>{
  const context={window:{}};
  vm.createContext(context);
  vm.runInContext(read(path),context,{filename:path});
  return context.window;
};

const dataWindow=loadBrowserScript('collocation-human-gate/data/candidates.js');
const modelWindow=loadBrowserScript('collocation-human-gate/model.js');
const data=dataWindow.COLLOCATION_HG_DATA;
const model=modelWindow.COLLOCATION_HG_MODEL;
const terms=data.terms;
const candidates=data.candidates;

assert.strictEqual(data.schemaVersion,1);
assert.strictEqual(data.generationVersion,'collocation-v1.1-2026-08-31');
assert.strictEqual(data.sourceSha256,'76f14a7111cc19482805c464beb65abfa17da36324eebbf93c1fed5281a0d034');
assert.strictEqual(terms.length,73,'the locked term master must contain 73 terms');
assert.deepStrictEqual(
  Array.from(terms,row=>row.term_id),
  Array.from({length:73},(_,index)=>`TC${String(index+1).padStart(3,'0')}`),
  'TC001-TC073 must remain stable and ordered'
);
assert.strictEqual(candidates.length,422,'the approved V1.1 candidate set must remain unchanged');
assert.strictEqual(new Set(candidates.map(row=>row.collocation_id)).size,422,'collocation IDs must be unique');
assert.ok(candidates.every(row=>row.is_active==='TRUE'));
assert.ok(candidates.every(row=>row.generation_version===data.generationVersion));
assert.ok(candidates.every(row=>terms.some(term=>term.term_id===row.term_id)));

const candidate=candidates[0];
const review=(uid,action='HEART',revised='')=>({
  schema_version:1,
  review_id:`${candidate.collocation_id}__${uid}`,
  collocation_id:candidate.collocation_id,
  term_id:candidate.term_id,
  generation_version:data.generationVersion,
  reviewer_id:uid,
  review_action:action,
  revised_collocation_text:action==='EDIT'?revised:'',
  notes:'',
  client_reviewed_at:'2026-08-31T00:00:00.000Z'
});

assert.strictEqual(model.candidateState(candidate,{}).status,'UNREVIEWED');
assert.strictEqual(model.candidateState(candidate,{one:review('uid-a')}).status,'RESOLVED','one teacher resolves a candidate');
assert.strictEqual(model.candidateState(candidate,{one:review('uid-a'),two:review('uid-b')}).status,'RESOLVED','matching teacher reviews agree');
assert.strictEqual(model.candidateState(candidate,{one:review('uid-a','HEART'),two:review('uid-b','REJECT')}).status,'CONFLICT','different actions conflict');
assert.strictEqual(model.candidateState(candidate,{one:review('uid-a','EDIT','修正A'),two:review('uid-b','EDIT','修正B')}).status,'CONFLICT','different edits conflict');
assert.strictEqual(model.candidateState(candidate,{one:review('uid-a','EDIT','同じ修正'),two:review('uid-b','EDIT','同じ修正')}).status,'RESOLVED','matching edits resolve a conflict');

const termCandidates=candidates.filter(row=>row.term_id===candidate.term_id);
const splitReviews={};
termCandidates.forEach((row,index)=>{
  const uid=index%2?'uid-b':'uid-a';
  splitReviews[`${row.collocation_id}__${uid}`]={...review(uid),review_id:`${row.collocation_id}__${uid}`,collocation_id:row.collocation_id,term_id:row.term_id};
});
assert.strictEqual(model.termState(candidate.term_id,candidates,splitReviews).status,'DONE','team work split across UIDs must complete the term');

const rejected={};
termCandidates.forEach(row=>{
  rejected[`${row.collocation_id}__uid-a`]={...review('uid-a','REJECT'),review_id:`${row.collocation_id}__uid-a`,collocation_id:row.collocation_id,term_id:row.term_id};
});
assert.strictEqual(model.termState(candidate.term_id,candidates,rejected).status,'REGENERATE_REQUIRED');
assert.ok(model.regenerationRows(terms,candidates,rejected).some(row=>row.term_id===candidate.term_id));

const conflictReviews={
  first:review('uid-a','HEART'),
  second:review('uid-b','REJECT')
};
assert.ok(!model.acceptedRows(candidates,conflictReviews).some(row=>row.collocation_id===candidate.collocation_id),'conflicts must not enter accepted CSV');
assert.strictEqual(model.conflictRows(candidates,conflictReviews).length,1);
const allRows=model.allReviewRows(candidates,conflictReviews);
assert.strictEqual(allRows.length,2,'all-review export must keep one row per teacher review');
assert.ok(allRows.every(row=>!('email' in row)&&!('name' in row)),'exports must not contain names or email fields');

const config=read('collocation-human-gate/firebase-config.js');
const sync=read('collocation-human-gate/sync.js');
const app=read('collocation-human-gate/app.js');
const html=read('collocation-human-gate/index.html');
const rules=read('firebase/firestore.rules');
const architecture=read('collocation-human-gate/ARCHITECTURE.md');

assert.match(config,/projectId:"lesson-composition-human-gate"/);
assert.match(config,/reviewCollection:"collocationHumanGateReviewsV1_1"/);
assert.match(config,/generationVersion:"collocation-v1\.1-2026-08-31"/);
assert.match(sync,/browserLocalPersistence/);
assert.match(sync,/`\$\{collocationId\}__\$\{uid\}`/,'document ID must bind candidate and UID');
assert.match(sync,/onSnapshot/);
assert.match(sync,/docChanges\(\)/);
assert.match(sync,/serverTimestamp\(\)/);
assert.match(sync,/throw new Error\("REVIEWER_MISMATCH"\)/,'one account must never upload another account\'s pending review');
assert.doesNotMatch(sync,/setInterval|POLL_MS/);

assert.match(app,/collocation_human_gate_v1_1_shared_cache/);
assert.match(app,/collocation_human_gate_v1_1_pending_writes/);
assert.match(app,/collocation_human_gate_v1_1_reviews/);
assert.match(app,/LOCAL_REVIEW_MIGRATION_REQUIRED/);
assert.match(app,/Object\.keys\(parsed\.reviews\)\.length/,'legacy V1.1 review count must inspect the nested reviews map');
assert.doesNotMatch(app,/removeItem\(LOCAL_ONLY_KEY\)/,'legacy local-only reviews must not be deleted or auto-migrated');
assert.match(app,/window\.addEventListener\("online",flushPending\)/);
assert.match(app,/filter\(row=>row\.reviewer_id===uid\)/,'retry must flush only the current UID\'s pending reviews');
assert.match(app,/saveObject\(CACHE_KEY,reviews\);saveObject\(PENDING_KEY,pending\);[\s\S]*await flushPending\(\)/,'save flow must be local-first');
assert.match(app,/他の判定あり/);
assert.match(app,/⚠ 判定不一致/);
assert.match(html,/data-export="reviews"/);
assert.match(html,/data-export="accepted"/);
assert.match(html,/data-export="regeneration"/);
assert.match(html,/data-export="conflicts"/);
assert.doesNotMatch(html,/candidate_class|generation_type/,'internal generation metadata must not appear in UI HTML');

assert.match(rules,/match \/humanGateReviews\/\{candidateId\}/,'legacy review rules must remain');
assert.match(rules,/match \/collocationHumanGateReviewsV1_1\/\{reviewId\}/);
assert.match(rules,/reviewId == request\.resource\.data\.collocation_id \+ '__' \+ request\.auth\.uid/);
assert.match(rules,/generation_version == 'collocation-v1\.1-2026-08-31'/);
assert.match(rules,/request\.resource\.data\.updated_at == request\.time/);
assert.match(rules,/request\.resource\.data\.reviewer_id == resource\.data\.reviewer_id/);
assert.match(rules,/request\.resource\.data\.collocation_id == resource\.data\.collocation_id/);
assert.match(rules,/allow delete: if false/);
assert.match(architecture,/Candidate rows are never written to Firestore/);
assert.match(architecture,/candidate_class.*generation_type.*remain internal/s);

console.log('Collocation Human Gate V1.1 data, team model, sync contract, export, and rules: PASS');
