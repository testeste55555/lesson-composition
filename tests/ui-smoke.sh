#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "UI Smoke: $*" >&2; exit 1; }
need_file(){ [ -f "$1" ] || fail "missing $1"; }
need_text(){ grep -Fq -- "$2" "$1" || fail "$1 missing: $2"; }
reject_text(){ if grep -Fq -- "$2" "$1"; then fail "$1 contains forbidden regression: $2"; fi; }

# Required public entry points and shared runtime.
for f in index.html pc/index.html mobile/index.html assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js assets/v2-quality.js assets/v2-result-ui.js assets/result-ui.css mobile/sw.js mobile/register-sw.js mobile/manifest.webmanifest; do
  need_file "$f"
done

# Root must route to both device variants.
need_text index.html 'href="pc/"'
need_text index.html 'href="mobile/"'

# PC and mobile must load the same decision layers.
for f in pc/index.html mobile/index.html; do
  need_text "$f" '../assets/v2.js'
  need_text "$f" '../assets/v2-patch.js'
  need_text "$f" '../assets/v2-acceptance.js'
  need_text "$f" '../assets/v2-redteam.js'
  need_text "$f" '../assets/v2-quality.js'
  need_text "$f" '../assets/v2-result-ui.js'
  need_text "$f" '../assets/result-ui.css'
  need_text "$f" 'Content-Security-Policy'
done

# Result presentation must load after quality guardrails.
for f in pc/index.html mobile/index.html; do
  quality_line="$(grep -n '../assets/v2-quality.js' "$f" | cut -d: -f1)"
  result_line="$(grep -n '../assets/v2-result-ui.js' "$f" | cut -d: -f1)"
  [ "$result_line" -gt "$quality_line" ] || fail "$f result UI must load after quality layer"
done

# Mobile-only PWA wiring.
need_text mobile/index.html 'manifest.webmanifest'
need_text mobile/index.html './register-sw.js'
need_text mobile/sw.js '../assets/v2-acceptance.js'
need_text mobile/sw.js '../assets/v2-redteam.js'
need_text mobile/sw.js '../assets/v2-quality.js'
need_text mobile/sw.js '../assets/v2-result-ui.js'
need_text mobile/sw.js '../assets/result-ui.css'
need_text mobile/sw.js "url.origin!==self.location.origin"

# Two-mode product contract.
need_text assets/v2.js 'data-mode="existing"'
need_text assets/v2.js 'data-mode="new"'
need_text assets/v2.js 'id="lessonFiles"'
need_text assets/v2.js '既存授業を見直す'
need_text assets/v2.js 'これから授業を作る'

# File-analysis Human Gate contract: suggestions are advisory until teacher approval.
need_text assets/v2-acceptance.js 'ファイルから推定した候補'
need_text assets/v2-acceptance.js 'まだ判定には入りません'
need_text assets/v2-acceptance.js 'data-suggest='
need_text assets/v2-acceptance.js '活動ブロック候補も説明用で、得点には直接入りません。'
reject_text assets/v2-acceptance.js 'fileAnalysis.features.forEach(k=>state.add(k))'

# Genericity and result-quality layers must remain active in production.
need_text assets/v2-redteam.js '_inferFeaturesBeforeRedTeam'
need_text assets/v2-redteam.js "f.delete('cur_audio')"
need_text assets/v2-quality.js 'RESULT_QUALITY_THRESHOLDS'
need_text assets/v2-quality.js '追加機能なしでも可'
need_text assets/v2-quality.js '未確定（活動・教室条件から選択）'

# Decision-first result-screen contract.
need_text assets/v2-result-ui.js 'この授業はこう組み直す'
need_text assets/v2-result-ui.js 'まず何を残し、何を変えるか'
need_text assets/v2-result-ui.js '媒体の使い分け'
need_text assets/v2-result-ui.js '5軸の詳しい判定を見る'
need_text assets/v2-result-ui.js '1つの媒体に統一する必要はありません'

# Syntax smoke. Node is available on GitHub-hosted runners.
for f in assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js assets/v2-quality.js assets/v2-result-ui.js mobile/sw.js mobile/register-sw.js; do
  node --check "$f" >/dev/null || fail "JavaScript syntax error in $f"
done

echo 'UI Smoke: PASS'
