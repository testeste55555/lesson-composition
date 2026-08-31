#!/usr/bin/env python3
"""Build the static Collocation Human Gate V1.1 browser data package."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path


GENERATION_VERSION = "collocation-v1.1-2026-08-31"


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: build-collocation-human-gate-data.py TERMS.csv CANDIDATES.csv OUTPUT.js")
    term_path, candidate_path, output_path = map(Path, sys.argv[1:])
    terms = read_csv(term_path)
    candidates = read_csv(candidate_path)

    expected_ids = [f"TC{i:03d}" for i in range(1, 74)]
    if [row["term_id"] for row in terms] != expected_ids:
        raise SystemExit("term master must contain locked TC001-TC073 in canonical order")
    if len(candidates) != 422:
        raise SystemExit(f"expected 422 active candidates, got {len(candidates)}")
    if len({row["collocation_id"] for row in candidates}) != len(candidates):
        raise SystemExit("duplicate collocation_id")
    if {row["term_id"] for row in candidates} != set(expected_ids):
        raise SystemExit("candidate term coverage mismatch")
    if any(row["generation_version"] != GENERATION_VERSION for row in candidates):
        raise SystemExit("generation version mismatch")
    if any(row["is_active"] != "TRUE" for row in candidates):
        raise SystemExit("inactive candidate found in active package")

    term_fields = ["term_id", "term", "category", "term_type", "generation_type", "safety_flag", "is_active"]
    candidate_fields = [
        "collocation_id", "term_id", "term", "category", "term_type", "generation_type",
        "candidate_class", "collocation_text", "predicate_lemma", "relation_type", "scope",
        "occupation_id", "safety_flag", "evidence_level", "source_basis", "source_ref",
        "evidence_note", "generation_version", "red_team_status", "red_team_flags", "is_active",
    ]
    payload = {
        "schemaVersion": 1,
        "generationVersion": GENERATION_VERSION,
        "sourceSha256": hashlib.sha256(candidate_path.read_bytes()).hexdigest(),
        "terms": [{field: row.get(field, "") for field in term_fields} for row in terms],
        "candidates": [{field: row.get(field, "") for field in candidate_fields} for row in candidates],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        "window.COLLOCATION_HG_DATA=Object.freeze(" +
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) +
        ");\n",
        encoding="utf-8",
    )
    print(f"wrote {output_path}: {len(terms)} terms, {len(candidates)} candidates")


if __name__ == "__main__":
    main()
