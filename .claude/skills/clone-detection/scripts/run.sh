#!/bin/sh
# Runs the two automatic clone detection passes over promptpipe and promptpipe-plugins and
# writes the results to OUT (default: a temp folder). Read-only on both repos.
#
#   sh .claude/skills/clone-detection/scripts/run.sh [OUT]
#
# PP_PLUGINS=<folder>: the plugins checkout (default: ../promptpipe-plugins next to this repo).
# JSCPD_DIR=<folder>: where jscpd is installed (default: OUT/jscpd-install). Never inside a repo.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
APP=$(cd "$HERE/../../../.." && pwd)
PLUGINS=$(cd "${PP_PLUGINS:-$APP/../promptpipe-plugins}" && pwd)
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd)
JSCPD="${JSCPD_DIR:-$OUT/jscpd-install}"
cd "$APP/.."
A=$(basename "$APP"); P=$(basename "$PLUGINS")
ROOTS="$A/core $A/app/src/main/java $A/app/src/main/assets/ui $A/app/src/main/assets/ppext $A/scripts $P"

echo "== 1/2 token-based (jscpd: exact token runs, Types 1-2 without renaming)"
if [ ! -x "$JSCPD/node_modules/.bin/jscpd" ]; then
  mkdir -p "$JSCPD" && (cd "$JSCPD" && npm init -y >/dev/null && npm install jscpd@4.0.5 --no-audit --no-fund >/dev/null)
fi
# --formats-exts replaces jscpd's defaults, so every format is listed; Odin is read as Go (closest syntax).
"$JSCPD/node_modules/.bin/jscpd" $ROOTS \
  --ignore "**/node_modules/**,**/.git/**,**/assets/plugins/**,**/build/**,**/vendor/**,**/test/**,**/catalogue.json" \
  --formats-exts "go:odin;javascript:js;kotlin:kt;python:py;bash:sh;css:css;c:c" \
  --min-tokens 30 --min-lines 3 --reporters json --output "$OUT/jscpd" --silent >/dev/null
python3 "$HERE/show-jscpd.py" "$OUT/jscpd/jscpd-report.json" | tee "$OUT/1-jscpd.txt" | head -60

echo; echo "== 2/2 token-bag (SourcererCC style: Type 3)"
python3 "$HERE/tokenbag.py" --threshold 0.7 --min-tokens 40 $ROOTS > "$OUT/2-tokenbag.txt"
python3 "$HERE/tokenbag.py" --threshold 0.85 --min-tokens 40 --normalize $ROOTS > "$OUT/2-tokenbag-normalized.txt"
head -1 "$OUT/2-tokenbag.txt"; head -1 "$OUT/2-tokenbag-normalized.txt"

echo; echo "Results in $OUT. Next: the responsibility inventory (SKILL.md, pass 3), by hand."
