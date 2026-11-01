#!/bin/sh
# Make the plugin bundle a release carries: promptpipe-plugins-<version>.zip
# (bundle.json + one folder per plugin). The app downloads it from the latest
# release; people can also install it by hand with "Install from a file".
# Run it in the public repo, so private site plugins never get in.
# Usage: sh scripts/plugin-bundle.sh 0.5.9 [out-dir]
set -e
v="$1"
[ -n "$v" ] || { echo "usage: sh scripts/plugin-bundle.sh <version> [out-dir]"; exit 1; }
out=$(cd "${2:-.}" && pwd)
cd "$(dirname "$0")/../app/src/main/assets/plugins"
for p in qwen-chat deepseek; do
  [ -d "$p" ] && { echo "private site plugin '$p' is here: run this in the public repo"; exit 1; }
done
ids=$(for d in */; do [ -f "$d/plugin.json" ] && printf '"%s",' "${d%/}"; done)
printf '{ "bundle": "promptpipe-plugins", "version": "%s", "plugins": [%s] }\n' "$v" "${ids%,}" > bundle.json
rm -f "$out/promptpipe-plugins-$v.zip"
zip -qr "$out/promptpipe-plugins-$v.zip" bundle.json */
rm bundle.json
echo "made $out/promptpipe-plugins-$v.zip"
