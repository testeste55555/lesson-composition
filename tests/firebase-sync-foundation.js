const fs=require('fs');
const assert=require('assert');

const read=p=>fs.readFileSync(p,'utf8');
const config=read('human-gate/firebase-config.js');
const sync=read('human-gate/sync.js');
const app=read('human-gate/app.js');
const html=read('human-gate/index.html');
const rules=read('firebase/firestore.rules');
const privacy=read('PRIVACY.md');

assert.match(config,/enabled:false/,'Firebase must remain disabled by default');
assert.match(config,/apiKey:""/,'No Firebase API key should be committed in the foundation PR');
assert.match(config,/projectId:""/,'No Firebase project id should be committed in the foundation PR');
assert.match(sync,/signInWithPassword/,'Email/password Firebase Auth REST flow is missing');
assert.match(sync,/securetoken\.googleapis\.com/,'Token refresh endpoint is missing');
assert.match(sync,/firestore\.googleapis\.com/,'Firestore REST endpoint is missing');
assert.match(sync,/sessionStorage/,'Auth session must not be persisted in localStorage');
assert.match(app,/human_gate_shared_cache_v1/,'Shared mode needs a separate local cache');
assert.match(app,/sync_queue/,'Offline retry queue is missing');
assert.match(app,/reviewer_id:reviewerId/,'Shared review must carry authenticated reviewer id');
assert.match(html,/identitytoolkit\.googleapis\.com/,'CSP must allow Firebase Auth only when enabled');
assert.match(html,/securetoken\.googleapis\.com/,'CSP must allow Firebase token refresh');
assert.match(html,/firestore\.googleapis\.com/,'CSP must allow Firestore');
assert.ok(!/script src="https?:\/\//.test(html),'External scripts/CDN are not allowed');
assert.match(rules,/humanGateMembers/,'Membership gate is missing');
assert.match(rules,/request\.resource\.data\.reviewer_id == request\.auth\.uid/,'Reviewer UID write rule is missing');
assert.match(rules,/allow delete: if false/,'Review deletion must remain disabled');
assert.match(privacy,/Human Gate共有同期の限定例外/,'Privacy policy must document shared sync');
assert.ok(!/(BEGIN PRIVATE KEY|service_account|refresh_token\s*[:=]\s*["'][^"']+)/i.test(config+sync+app),'Secret-like material detected');

console.log('Firebase sync foundation: PASS');
