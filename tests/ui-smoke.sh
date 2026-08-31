#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "UI Smoke: $*" >&2; exit 1; }
need_file(){ [ -f "$1" ] || fail "missing $1"; }
need_text(){ grep -Fq -- "$2" "$1" || fail "$1 missing: $2"; }
reject_text(){ if grep -Fq -- "$2" "$1"; then fail "$1 contains forbidden regression: $2"; fi; }

for f in index.html pc/index.html mobile/index.html assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js assets/v2-file-evidence.js assets/v2-quality.js assets/v2-result-ui.js assets/result-ui.css assets/file-evidence.css mobile/sw.js mobile/register-sw.js mobile/manifest.webmanifest; do
  need_file "$f"
done

need_text index.html 'href="pc/"'
need_text index.html 'href="mobile/"'

for f in pc/index.html mobile/index.html; do
  need_text "$f" '../assets/v2.js'
  need_text "$f" '../assets/v2-patch.js'
  need_text "$f" '../assets/v2-acceptance.js'
  need_text "$f" '../assets/v2-redteam.js'
  need_text "$f" '../assets/v2-file-evidence.js'
  need_text "$f" '../assets/v2-quality.js'
  need_text "$f" '../assets/v2-result-ui.js'
  need_text "$f" '../assets/result-ui.css'
  need_text "$f" '../assets/file-evidence.css'
  need_text "$f" 'Content-Security-Policy'
done

for f in pc/index.html mobile/index.html; do
  evidence_line="$(grep -n '../assets/v2-file-evidence.js' "$f" | cut -d: -f1)"
  quality_line="$(grep -n '../assets/v2-quality.js' "$f" | cut -d: -f1)"
  result_line="$(grep -n '../assets/v2-result-ui.js' "$f" | cut -d: -f1)"
  [ "$evidence_line" -lt "$quality_line" ] || fail "$f file evidence must load before quality layer"
  [ "$result_line" -gt "$quality_line" ] || fail "$f result UI must load after quality layer"
done

need_text mobile/index.html 'manifest.webmanifest'
need_text mobile/index.html './register-sw.js'
need_text mobile/sw.js '../assets/v2-file-evidence.js'
need_text mobile/sw.js '../assets/file-evidence.css'
need_text mobile/sw.js "url.origin!==self.location.origin"

need_text assets/v2.js 'data-mode="existing"'
need_text assets/v2.js 'data-mode="new"'
need_text assets/v2.js 'id="lessonFiles"'
need_text assets/v2.js '既存授業を見直す'
need_text assets/v2.js 'これから授業を作る'

# File evidence contract.
need_text assets/v2-file-evidence.js 'ファイルで確認できたもの'
need_text assets/v2-file-evidence.js '教師確認が必要な候補'
need_text assets/v2-file-evidence.js 'ファイルだけでは判定しないもの'
need_text assets/v2-file-evidence.js "state.add(k)"
need_text assets/v2-file-evidence.js 'candidateFeatures=inferred.filter'
need_text assets/v2-file-evidence.js "out.add('cur_visual')"
need_text assets/v2-file-evidence.js "out.add('cur_audio')"
need_text assets/v2-file-evidence.js "confirmedFeatures.push('cur_multilang')"
reject_text assets/v2-file-evidence.js "candidateFeatures.forEach(k=>state.add(k))"

need_text assets/v2-redteam.js '_inferFeaturesBeforeRedTeam'
need_text assets/v2-redteam.js "f.delete('cur_audio')"
need_text assets/v2-quality.js 'RESULT_QUALITY_THRESHOLDS'
need_text assets/v2-result-ui.js 'この授業はこう組み直す'
need_text assets/v2-result-ui.js '媒体の使い分け'
need_text assets/v2-result-ui.js '5軸の詳しい判定を見る'

for f in assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js assets/v2-file-evidence.js assets/v2-quality.js assets/v2-result-ui.js mobile/sw.js mobile/register-sw.js; do
  node --check "$f" >/dev/null || fail "JavaScript syntax error in $f"
done

echo 'UI Smoke: PASS'
