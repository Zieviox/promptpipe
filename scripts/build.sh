#!/bin/sh
# Builds the app on an arm64 phone (Termux + proot) or a PC: the built-in plugins from the
# promptpipe-plugins checkout next to this one, the Odin core linked against the NDK's sysroot,
# then the APK. Usage: sh scripts/build.sh <versionName> <versionCode> [release]
# A release build is signed with the key scripts/keys_make.sh made (~/.promptpipe/release.properties).
# Needs: odin, clang and lld, JDK 17, Gradle, ANDROID_HOME (or sdk.dir in local.properties) with
# an NDK, and debug.keystore next to settings.gradle.kts so each APK installs over the last.
set -e
cd "$(dirname "$0")/.."
NAME="${1:?versionName}"
CODE="${2:?versionCode (never lower than the last one, B2)}"
TYPE="${3:-debug}"
if [ "$TYPE" = release ] && [ ! -f "$HOME/.promptpipe/release.properties" ]; then
    echo "No release key: run sh scripts/keys_make.sh first."; exit 1
fi
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' local.properties 2>/dev/null)}"
[ -d "$SDK" ] || { echo "Set ANDROID_HOME, or sdk.dir in local.properties."; exit 1; }
[ -f local.properties ] || echo "sdk.dir=$SDK" > local.properties
NDK="${ANDROID_NDK_HOME:-$(ls -d "$SDK"/ndk/* | sort | tail -1)}"
TOOLCHAIN=$(ls -d "$NDK"/toolchains/llvm/prebuilt/* | head -1)
GRADLE=$(command -v gradle || ls -d /root/gradle-*/bin/gradle 2>/dev/null | sort | tail -1)
[ -x "$GRADLE" ] || { echo "Gradle not found."; exit 1; }
command -v ld.lld >/dev/null || { echo "lld is missing (Arch: pacman -S lld)."; exit 1; }
[ -f debug.keystore ] || echo "Note: no debug.keystore here, so a test build won't install over the old app."
# GeckoView, version 160 or newer (double-tap to select a word in a text box came in 160; long
# press in a text box's empty part was fixed in 162). The newest one Gradle already downloaded
# (~100 MB) when it's new enough, else Mozilla's newest: release, else beta, else nightly, the
# first that is 160+. GECKOVIEW=<version> picks one (GECKOVIEW_ARTIFACT=geckoview-beta or
# geckoview-nightly with it); GECKOVIEW=latest always asks Mozilla.
GV_MIN=160
GVCACHES="${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2/files-2.1/org.mozilla.geckoview"
GV="$GECKOVIEW"
GVA="${GECKOVIEW_ARTIFACT:-geckoview}"
major() { echo "${1%%.*}"; }
if [ -z "$GV" ]; then
    for a in geckoview geckoview-beta geckoview-nightly; do
        [ -d "$GVCACHES/$a" ] || continue
        v=$(ls "$GVCACHES/$a" | sort -V | tail -1)
        if [ -n "$v" ] && [ "$(major "$v")" -ge "$GV_MIN" ] && { [ -z "$GV" ] || [ "$(printf '%s\n%s\n' "$GV" "$v" | sort -V | tail -1)" = "$v" ]; }; then
            GV="$v"; GVA="$a"
        fi
    done
fi
if [ -z "$GV" ] || [ "$GV" = latest ]; then
    GV=""
    for a in geckoview geckoview-beta geckoview-nightly; do
        v=$(curl -fsSL "https://maven.mozilla.org/maven2/org/mozilla/geckoview/$a/maven-metadata.xml" \
            | sed -n 's:.*<release>\(.*\)</release>.*:\1:p')
        if [ -n "$v" ] && [ "$(major "$v")" -ge "$GV_MIN" ]; then GV="$v"; GVA="$a"; break; fi
        [ -z "$GV" ] && [ -n "$v" ] && echo "  $a's newest is $v (older than $GV_MIN)"
    done
fi
[ -n "$GV" ] || { echo "Couldn't find a GeckoView $GV_MIN or newer; set GECKOVIEW=<version> (and GECKOVIEW_ARTIFACT)."; exit 1; }
echo "geckoview $GV ($GVA)"

echo "== 1/4 built-in plugins"
python3 scripts/plugins_copy.py

echo "== 2/4 the core (Odin, android arm64)"
mkdir -p build app/src/main/jniLibs/arm64-v8a
export ODIN_ANDROID_NDK="$NDK"
odin build core -target:linux_arm64 -subtarget:android -build-mode:object -no-entry-point -out:build/ppcore.o -o:speed
# The object is linked here, not by Odin, so the system libraries Odin's bindings name
# (`foreign import ... "system:<name>"`) are added by hand: android (core:os reads /android_asset
# through it since Odin 2026-11) and log. To see what else a new Odin needs:
# llvm-nm -u build/ppcore.o, and look each name up in Odin's core/sys/android.
OUT=app/src/main/jniLibs/arm64-v8a/libppcore.so
clang --target=aarch64-linux-android29 --sysroot="$TOOLCHAIN/sysroot" \
    -resource-dir="$(ls -d "$TOOLCHAIN"/lib/clang/* | head -1)" --rtlib=compiler-rt --unwindlib=none \
    -fuse-ld=lld -fno-emulated-tls -fPIE -pie -O2 -o "$OUT" build/ppcore.o core/android/shim.c -lm -llog -landroid

echo "== 3/4 the core's thread-local segment must be 64-aligned for Android"
case "$(llvm-readelf -lW "$OUT" | grep TLS)" in *0x40|*0x80|*0x100) ;; *) echo "TLS underaligned"; exit 1;; esac

echo "== 4/4 the APK"
TASK=$([ "$TYPE" = release ] && echo assembleRelease || echo assembleDebug)
"$GRADLE" "$TASK" --console=verbose -PgeckoviewVersion="$GV" -PgeckoviewArtifact="$GVA" -PversionName="$NAME" -PversionCode="$CODE"
cp "app/build/outputs/apk/$TYPE/app-$TYPE.apk" "build/promptpipe-$NAME.apk"
[ -d /sdcard/Download ] && cp "build/promptpipe-$NAME.apk" /sdcard/Download/promptpipe.apk
echo "done: build/promptpipe-$NAME.apk"
