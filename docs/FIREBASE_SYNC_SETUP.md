# Firebase sync setup for Human Gate

Human Gate uses Firebase Authentication and Cloud Firestore only after the project, Authentication users, Firestore membership documents, and Security Rules are ready.

## 1. Create the Firebase project

Create one Firebase project on the Spark plan. Do not enable paid billing for this Human Gate use case unless it becomes necessary later.

Google Analytics and Gemini integrations are not required for this application.

## 2. Enable Authentication

Enable Email/Password sign-in.

Create exactly the teacher accounts that should use Human Gate. A two-teacher Collocation Human Gate test requires two distinct Firebase Authentication UIDs; do not share one account. Do not commit teacher email addresses or passwords to this repository.

## 3. Create Firestore

Create the default Cloud Firestore database.

For each authorized teacher, create this document manually in the Firebase console:

`humanGateMembers/{firebase_auth_uid}`

The document may contain only a non-personal marker such as:

```json
{"active": true}
```

The application does not read names or email addresses from Firestore. The membership document ID is the Firebase Authentication UID.

Create a membership document for each of the two Collocation Human Gate test accounts before testing realtime behavior.

## 4. Apply Security Rules

Use `firebase/firestore.rules` as the canonical ruleset.

The rules:

- require Firebase Authentication,
- require a matching `humanGateMembers/{uid}` document,
- allow review reads only to members,
- allow review writes only when `reviewer_id` equals the authenticated UID,
- reject extra review fields,
- reject review deletion.

The same ruleset also protects `collocationHumanGateReviewsV1_1`. Its document ID is `{collocation_id}__{firebase_uid}`, so the two teachers retain separate documents. Deploy with:

```bash
firebase deploy --only firestore:rules --project lesson-composition-human-gate
```

Do not test by temporarily opening the database. If deployment access is unavailable, keep the restrictive rules in the repository and report `RULES_DEPLOY_REQUIRED`.

## 5. Configure the web client

Edit `human-gate/firebase-config.js` only after steps 1–4 are complete.

Set:

```js
window.HG_FIREBASE_CONFIG=Object.freeze({
  enabled:true,
  apiKey:"<Firebase Web API key>",
  projectId:"<Firebase project id>",
  reviewCollection:"humanGateReviews"
});
```

Collocation Human Gate V1.1 uses `collocation-human-gate/firebase-config.js` with the same project and public Web API key, but its collection is fixed to `collocationHumanGateReviewsV1_1` and its generation version is fixed to `collocation-v1.1-2026-08-31`.

The Firebase Web API key is a public client identifier in a browser app, not a service-account secret. Restrict the key to the intended Firebase/Google APIs and to the GitHub Pages referrer where practical. Never commit service-account JSON, Admin SDK keys, passwords, refresh tokens, or access tokens.

## 6. Realtime shared-review behavior

When synchronization is enabled:

- teachers must sign in,
- Firebase Authentication uses `browserLocalPersistence`, so the signed-in state normally survives closing and reopening the browser on that device,
- the password itself is not stored by the Human Gate application,
- selecting the Human Gate logout button clears the Firebase signed-in state,
- on a 共有端末 / shared PC or tablet, teachers must log out after use,
- local trial data is not automatically migrated into the shared workspace,
- the shared cache uses a different localStorage key,
- review writes are saved locally first and then sent to Firestore,
- temporary network failures stay in a local retry queue,
- Firestore `onSnapshot()` performs the initial review read once and then receives document changes in realtime,
- there is no fixed 15-second full-collection polling,
- CSV export works from the merged local/shared state.

The original Human Gate retains its existing shared-record behavior. Collocation Human Gate V1.1 instead stores one document per candidate and UID. It preserves both teachers' reviews and marks differing actions or differing EDIT text as `CONFLICT`; it does not collapse them with last-write-wins.

Collocation Human Gate V1.1 uses these separate local keys:

- `collocation_human_gate_v1_1_shared_cache`
- `collocation_human_gate_v1_1_pending_writes`

The old local-only key `collocation_human_gate_v1_1_reviews` is never auto-migrated. If detected, the app reports `LOCAL_REVIEW_MIGRATION_REQUIRED`.

## 7. Firebase Web SDK loading

The Human Gate page loads only these pinned Firebase JavaScript SDK browser modules from Google's official `www.gstatic.com` host:

- `firebase-app.js`
- `firebase-auth.js`
- `firebase-firestore.js`

The version is fixed in `human-gate/sync.js` rather than using an unpinned/latest URL. Analytics, Messaging, Storage, AI/Gemini SDKs, and other Firebase products are not loaded.

Content Security Policy permits `www.gstatic.com` only for these Firebase browser modules and keeps Firebase network endpoints restricted to the Authentication/token/Firestore hosts required by the app.

## 8. Privacy boundary

Only Human Gate review metadata is synchronized: candidate ID, term, category, action, revised text, pseudonymous Firebase UID, and review timestamp.

For Collocation Human Gate V1.1, terms, categories, candidates, internal generation types, and candidate classes remain in the static application payload. Firestore receives only the review schema described in `collocation-human-gate/ARCHITECTURE.md`.

Do not put student names, teacher names, email addresses, lesson files, attendance, scores, health information, company-private information, or other personal data into review text or Firestore documents.
