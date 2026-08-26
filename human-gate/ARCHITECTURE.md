# Human Gate architecture

## Teacher-facing model

Teachers do not work with batch numbers. The visible flow is:

`職種共通 → カテゴリー → 語彙 → 候補文 Human Gate`

Visible vocabulary states are:

- `○ 未着手`
- `◐ 途中`
- `✓ 完了`

A vocabulary item is complete only when all of its candidate sentences have been reviewed, regardless of whether each result is 採用 / 修正して採用 / 不採用.

## Internal data model

Candidate packages may be created in internal batches, but batch labels are not shown in the teacher UI or exported result schema. Runtime candidate IDs are normalized to stable `Cxxxx` identifiers.

Review records use these fields:

- `candidate_id`
- `term`
- `category`
- `action`
- `revised_text`
- `reviewer_id`
- `reviewed_at`

`reviewer_id` is null in local-only mode. In shared mode it is the authenticated Firebase UID; teacher names and email addresses are not written into review records.

## Storage modes

### Local-only mode

Default configuration. Progress is stored in browser `localStorage` under schema version 2. No Firebase requests are made.

### Shared mode

Shared mode is enabled only when `human-gate/firebase-config.js` has `enabled:true` and valid Firebase web configuration.

- Firebase Authentication requires teacher sign-in.
- Firestore stores one document per candidate review.
- Firestore access is restricted to authenticated UIDs that have a `humanGateMembers/{uid}` membership document.
- Local-first writes keep the interface responsive and queue temporary network failures.
- Remote progress is refreshed approximately every 15 seconds.
- Shared mode uses a separate local cache key, so old prototype/local review data is not silently migrated into the shared workspace.
- CSV export uses the merged shared/local cache.

The shared backend is the production path for two-teacher Human Gate. Do not begin large-scale two-person review until Firebase membership and Security Rules are configured and sync has been verified on both devices.

## Conflict behavior

If both teachers review the same candidate before the next synchronization, both local devices may temporarily show different results. After Firestore synchronization, the review with the later `reviewed_at` timestamp becomes the visible result. Category and vocabulary progress should be used to reduce duplicate work.

## Privacy and network

No CDN or external script is used. Firebase REST calls are made only when shared mode is enabled, and only to:

- `identitytoolkit.googleapis.com`
- `securetoken.googleapis.com`
- `firestore.googleapis.com`

Only Human Gate review metadata is synchronized. Student data, lesson files, attendance, scores, health information, teacher names, and teacher email addresses are not stored in Firestore review documents.

See `docs/FIREBASE_SYNC_SETUP.md` and `firebase/firestore.rules` before enabling shared mode.
