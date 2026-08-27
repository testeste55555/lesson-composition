const fs=require('fs');
const assert=require('assert');

const read=p=>fs.readFileSync(p,'utf8');
const config=read('human-gate/firebase-config.js');
const sync=read('human-gate/sync.js');
const app=read('human-gate/app.js');
const html=read('human-gate/index.html');
const rules=read('firebase/firestore.rules');
const privacy=read('PRIVACY.md');

assert.match(config,/enabled:true/,'Firebase shared sync must be enabled');
assert.match(config,/apiKey:"AIza[0-9A-Za-z_-]+"/,'Firebase Web API key is missing');
assert.match(config,/projectId:"lesson-composition-human-gate"/,'Firebase project id is incorrect');
assert.match(sync,/signInWithPassword/,'Email/password Firebase Auth REST flow is missing');
assert.match(sync,/securetoken\.googleapis\.com/,'Token refresh endpoint is missing');
assert.match(sync,/firestore\.googleapis\.com/,'Firestore REST endpoint is missing');
assert.match(sync,/sessionStorage/,'Auth session must not be persisted in localStorage');
assert.match(app,/human_gate_shared_cache_v1/,'Shared mode needs a separate local cache');
assert.match(app,/sync_queue/,'Offline retry queue is missing');
assert.match(app,/reviewer_id:reviewerId/,'Shared review must carry authenticated reviewer id');
assert.match(html,/identitytoolkit\.googleapis\.com/,'CSP must allow Firebase Auth');
assert.match(html,/securetoken\.googleapis\.com/,'CSP must allow Firebase token refresh');
assert.match(html,/firestore\.googleapis\.com/,'CSP must allow Firestore');
assert.ok(!/script src="https?:\/\//.test(html),'External scripts/CDN are not allowed');
assert.match(rules,/humanGateMembers/,'Membership gate is missing');
assert.match(rules,/request\.resource\.data\.reviewer_id == request\.auth\.uid/,'Reviewer UID write rule is missing');
assert.match(rules,/allow delete: if false/,'Review deletion must remain disabled');
assert.match(privacy,/Human Gate共有同期の限定例外/,'Privacy policy must document shared sync');

console.log('Firebase sync enabled configuration: PASS');
