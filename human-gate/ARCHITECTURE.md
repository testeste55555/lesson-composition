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

Review records use the sync-ready fields:

- `candidate_id`
- `term`
- `category`
- `action`
- `revised_text`
- `reviewer_id`
- `reviewed_at`

`reviewer_id` is reserved for the later shared-backend phase.

## Current storage

The current version stores progress in browser `localStorage` under schema version 2. This is temporary. Before two teachers begin large-scale production review, the storage adapter will be replaced with authenticated Firebase / Firestore synchronization.

Prototype v1 local progress is intentionally not auto-migrated because the prototype candidate ordering and canonical candidate IDs were not fully aligned. This prevents an old trial judgement from being attached to the wrong sentence.

## Privacy and network

The current structural version performs no external API calls and keeps `connect-src 'none'`. Firebase is not enabled yet.
