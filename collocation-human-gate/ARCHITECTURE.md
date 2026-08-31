# Collocation Human Gate V1.1 architecture

## Fixed candidate input

`data/candidates.js` is a static browser payload generated from the approved V1.1 CSV files. It contains exactly 73 active terms (`TC001`–`TC073`) and 422 active candidates at generation version `collocation-v1.1-2026-08-31`.

Run the deterministic import when, and only when, an approved candidate artifact changes:

```bash
python scripts/build-collocation-human-gate-data.py \
  collocation_term_master_v1_1_73.csv \
  collocation_candidates_v1_1.csv \
  collocation-human-gate/data/candidates.js
```

The importer rejects a changed term-ID sequence, candidate count, duplicate candidate IDs, inactive rows, or a different generation version. Candidate rows are never written to Firestore.

## Review identity and storage

The authenticated Firebase UID is the canonical reviewer ID. Each review document uses:

`{collocation_id}__{firebase_uid}`

in the dedicated `collocationHumanGateReviewsV1_1` collection. This keeps each teacher's review independent. Names and email addresses are not included in review documents or CSV exports; email is shown only from the current Authentication session in the page header.

The browser writes locally first:

- shared cache: `collocation_human_gate_v1_1_shared_cache`
- pending writes: `collocation_human_gate_v1_1_pending_writes`

Pending writes are retried after authentication, on reload, when the browser becomes online, and with the manual retry button. Firestore `onSnapshot()` supplies the canonical initial review set and realtime changes. A pending local review overlays its remote copy until the write succeeds.

The former local-only key `collocation_human_gate_v1_1_reviews` is detection-only. Its contents are never migrated automatically; the UI reports `LOCAL_REVIEW_MIGRATION_REQUIRED` with the detected count.

## Team resolution

- no review: `UNREVIEWED`
- one or more identical reviews: `RESOLVED`
- differing action, or differing text between `EDIT` reviews: `CONFLICT`

One teacher's review is sufficient to resolve a candidate. A second teacher may review the same candidate without overwriting the first document. A conflict clears automatically if the teachers later submit matching reviews. Conflict candidates never enter the accepted export.

Term completion is calculated from team candidate states. A conflict blocks both `DONE` and `REGENERATE_REQUIRED`. Category progress counts completed terms, not individual candidates.

## UI boundary

The visible hierarchy remains category → term → all candidates for that term. `candidate_class` and `generation_type` remain internal candidate metadata and are not used for tabs, sections, colors, or teacher-facing labels.

## Security boundary

`firebase/firestore.rules` remains the canonical ruleset. The pre-existing `humanGateMembers` and `humanGateReviews` matches are preserved. The new collection requires membership, a UID-bound document ID, exact allowed fields, the fixed generation version, valid action/edit combinations, server time, and immutable reviewer/collocation identity. Deletes are denied.
