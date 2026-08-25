#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "UI Smoke: $*" >&2; exit 1; }
need_file(){ [ -f "$1" ] || fail "missing $1"; }
need_text(){ grep -Fq -- "$2" "$1" || fail "$1 missing: $2"; }
reject_text(){ if grep -Fq -- "$2" "$1"; then fail "$1 contains forbidden regression: $2"; fi; }

# Required public entry points and shared runtime.
for f in index.html pc/index.html mobile/index.html assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js mobile/sw.js mobile/register-sw.js mobile/manifest.webmanifest; do
  need_file "$f"
done

# Root must route to both device variants.
need_text index.html 'href="pc/"'
need_text index.html 'href="mobile/"'

# PC and mobile must load the same decision layers in the same order.
for f in pc/index.html mobile/index.html; do
  need_text "$f" '../assets/v2.js'
  need_text "$f" '../assets/v2-patch.js'
  need_text "$f" '../assets/v2-acceptance.js'
  need_text "$f" '../assets/v2-redteam.js'
  need_text "$f" 'Content-Security-Policy'
done

# Mobile-only PWA wiring.
need_text mobile/index.html 'manifest.webmanifest'
need_text mobile/index.html './register-sw.js'
need_text mobile/sw.js '../assets/v2-acceptance.js'
need_text mobile/sw.js '../assets/v2-redteam.js'
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

# Genericity RED TEAM layer must remain active in production.
need_text assets/v2-redteam.js '_inferFeaturesBeforeRedTeam'
need_text assets/v2-redteam.js "f.delete('cur_audio')"

# Syntax smoke. Node is available on GitHub-hosted runners.
for f in assets/v2.js assets/v2-patch.js assets/v2-acceptance.js assets/v2-redteam.js mobile/sw.js mobile/register-sw.js; do
  node --check "$f" >/dev/null || fail "JavaScript syntax error in $f"
done

echo 'UI Smoke: PASS'
