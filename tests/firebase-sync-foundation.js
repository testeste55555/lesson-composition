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
assert.doesNotMatch(config,/pollIntervalMs/,'Polling interval must be removed from Firebase config');

assert.match(sync,/firebasejs\/12\.18\.0\/firebase-app\.js/,'Pinned Firebase App SDK is missing');
assert.match(sync,/firebasejs\/12\.18\.0\/firebase-auth\.js/,'Pinned Firebase Auth SDK is missing');
assert.match(sync,/firebasejs\/12\.18\.0\/firebase-firestore\.js/,'Pinned Firebase Firestore SDK is missing');
assert.match(sync,/browserSessionPersistence/,'Firebase Auth must use session-scoped persistence');
assert.match(sync,/signInWithEmailAndPassword/,'Firebase Auth email/password sign-in is missing');
assert.match(sync,/onSnapshot/,'Firestore realtime listener is missing');
assert.match(sync,/docChanges\(\)/,'Realtime updates must consume document changes after the initial snapshot');
assert.match(sync,/setDoc/,'Firestore SDK review write is missing');
assert.doesNotMatch(sync,/setInterval/,'Full-collection polling must not remain');
assert.doesNotMatch(sync,/POLL_MS/,'Polling state must not remain');

assert.match(app,/human_gate_shared_cache_v1/,'Shared mode needs a separate local cache');
assert.match(app,/sync_queue/,'Offline retry queue is missing');
assert.match(app,/reviewer_id:reviewerId/,'Shared review must carry authenticated reviewer id');
assert.match(app,/await SYNC\.ready\(\)/,'App must wait for Firebase Auth session restoration');
assert.doesNotMatch(app,/SYNC\.fetchAllReviews\(\)/,'App must not do a separate full fetch before realtime listening');

assert.match(html,/script-src 'self' https:\/\/www\.gstatic\.com/,'CSP must allow only the official Firebase SDK script host in addition to self');
assert.match(html,/identitytoolkit\.googleapis\.com/,'CSP must allow Firebase Auth');
assert.match(html,/securetoken\.googleapis\.com/,'CSP must allow Firebase token refresh');
assert.match(html,/firestore\.googleapis\.com/,'CSP must allow Firestore');
assert.ok(!/script src="https?:\/\//.test(html),'HTML must not load arbitrary external script tags');

assert.match(rules,/humanGateMembers/,'Membership gate is missing');
assert.match(rules,/request\.resource\.data\.reviewer_id == request\.auth\.uid/,'Reviewer UID write rule is missing');
assert.match(rules,/allow delete: if false/,'Review deletion must remain disabled');
assert.match(privacy,/Human Gate共有同期の限定例外/,'Privacy policy must document shared sync');
assert.match(privacy,/12\.18\.0/,'Privacy policy must document the pinned Firebase SDK version');
assert.match(privacy,/Analytics、Messaging、Storage、AI\/Gemini等のSDKは読み込みません/,'Privacy policy must exclude unnecessary Firebase products');

console.log('Firebase realtime sync configuration: PASS');
