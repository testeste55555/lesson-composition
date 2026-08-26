#!/usr/bin/env python3
import argparse, csv, json
from collections import Counter
from pathlib import Path

CATEGORIES = ["道具・もの","動作・操作","点検・確認・手順","状態・異常","安全・環境","場所・仕事"]
CROSSCUT_TYPES = {"SAFETY","SIGN_DISPLAY","WORK_BEHAVIOR","TIME_POSITION","COMMUNICATION"}

KEYWORDS = {
    "安全・環境": ["安全","危険","注意","禁止","火事","事故","けが","非常","保護","換気","高温","低温","マスク","耳栓"],
    "状態・異常": ["故障","壊","異常","不足","汚","割れ","傷","ずれ","漏れ","停止","詰まり","変形"],
    "点検・確認・手順": ["点検","検査","確認","手順","順番","準備","片付","清掃","掃除","保全","測定","計測"],
}

def category_for(row):
    term = row["display_term"]
    t = row["term_type"]
    for cat, words in KEYWORDS.items():
        if any(w in term for w in words): return cat, "KEYWORD"
    if t in {"TOOL_EQUIPMENT","MATERIAL"}: return "道具・もの", "TERM_TYPE"
    if t == "ACTION": return "動作・操作", "TERM_TYPE"
    if t in {"STATE","QUALITY"}: return "状態・異常", "TERM_TYPE"
    if t in {"SAFETY","SIGN_DISPLAY"}: return "安全・環境", "TERM_TYPE"
    if t in {"WORK_BEHAVIOR"}: return "点検・確認・手順", "TERM_TYPE"
    return "場所・仕事", "FALLBACK"

def common_status(row):
    sectors = int(row["source_sector_count"] or 0)
    if sectors >= 2:
        return "COMMON_CANDIDATE", "MULTI_SECTOR"
    if row["term_type"] in CROSSCUT_TYPES:
        return "COMMON_CANDIDATE_REVIEW", "CROSSCUT_TYPE_SINGLE_SECTOR"
    return "JOB_SPECIFIC_CANDIDATE", "SINGLE_SECTOR_SPECIALIZED"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--expected-approved", type=int, default=1856)
    ap.add_argument("--source-commit", default="")
    args = ap.parse_args()

    out = Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    with open(args.source, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    approved = [r for r in rows if r.get("app_use_status") == "APPROVED"]
    if len(approved) != args.expected_approved:
        raise SystemExit(f"APPROVED count mismatch: {len(approved)} != {args.expected_approved}")

    result = []
    for r in approved:
        status, basis = common_status(r)
        cat, cat_basis = category_for(r)
        result.append({
            "concept_term_id": r["concept_term_id"],
            "display_term": r["display_term"],
            "reading": r["reading"],
            "term_type": r["term_type"],
            "source_sector_count": r["source_sector_count"],
            "commonality": r["commonality"],
            "source_lessons": r["source_lessons"],
            "candidate_status": status,
            "candidate_basis": basis,
            "category": cat,
            "category_basis": cat_basis,
        })

    fields = list(result[0].keys())
    with open(out/"common_vocabulary_catalog.csv","w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(result)
    common = [r for r in result if r["candidate_status"].startswith("COMMON_CANDIDATE")]
    with open(out/"common_vocabulary_candidates.csv","w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(common)

    summary = {
        "source_repo":"testeste55555/sample-sentences-selection",
        "source_path":"data/master/otit_vocabulary_master.csv",
        "source_commit":args.source_commit,
        "approved_total":len(approved),
        "common_candidate_total":len(common),
        "status_counts":Counter(r["candidate_status"] for r in result),
        "category_counts":Counter(r["category"] for r in common),
        "category_review_counts":Counter(r["category"] for r in common if r["category_basis"]=="FALLBACK"),
        "categories":CATEGORIES,
    }
    summary["status_counts"] = dict(summary["status_counts"])
    summary["category_counts"] = dict(summary["category_counts"])
    summary["category_review_counts"] = dict(summary["category_review_counts"])
    (out/"common_vocabulary_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

if __name__ == "__main__": main()
