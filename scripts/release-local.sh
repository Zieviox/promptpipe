#!/bin/sh
# Publish the APK that build-local.sh made as a GitHub release, so the app (and
# other phones) can find it. Needs gh signed in with push rights.
# Usage, after: sh scripts/build-local.sh 0.7.0-alpha10-local 20
#   sh scripts/release-local.sh 0.7.0-alpha10-local
# Marked as a pre-release; the same version can be re-published (it is replaced).
set -e
cd "$(dirname "$0")/.."
V="$1"
[ -n "$V" ] || { echo "usage: sh scripts/release-local.sh <versionName>   (the one you built)"; exit 1; }
APK="build/promptpipe-$V.apk"
[ -f "$APK" ] || { echo "No $APK. Build it first with scripts/build-local.sh $V <code>."; exit 1; }
command -v gh >/dev/null || { echo "gh isn't installed here."; exit 1; }
REPO=${REPO:-Zieviox/promptpipe}
TAG="v$V"
BUNDLE=build/promptpipe-plugins-$V.zip
mkdir -p build
sh scripts/plugin-bundle.sh "$V" build >/dev/null
FILES="$APK $BUNDLE"
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG exists: replacing its files."
  gh release upload "$TAG" $FILES --clobber --repo "$REPO"
else
  gh release create "$TAG" $FILES --repo "$REPO" --target "$(git rev-parse HEAD)" --prerelease \
    --title "promptpipe $V" --notes "Local build $V ($(git rev-parse --short HEAD))."
fi
# The app's update check only sees non-pre-releases (GitHub's "latest"), so make this one the latest.
# PRERELEASE=1 keeps it a pre-release.
if [ -n "$PRERELEASE" ]; then
  gh release edit "$TAG" --prerelease --repo "$REPO"
else
  gh release edit "$TAG" --prerelease=false --latest --repo "$REPO"
fi
echo "Published: https://github.com/$REPO/releases/tag/$TAG"
