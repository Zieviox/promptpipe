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
TOOLS=$(ls -d "$NDK"/toolchains/llvm/prebuilt/* | head -1)

echo "== 1/4 built-in plugins"
python3 scripts/plugins_copy.py

echo "== 2/4 the core (Odin, android arm64)"
mkdir -p build app/src/main/jniLibs/arm64-v8a
export ODIN_ANDROID_NDK="$NDK"
odin build core -target:linux_arm64 -subtarget:android -build-mode:object -out:build/ppcore.o -o:speed
OUT=app/src/main/jniLibs/arm64-v8a/libppcore.so
clang --target=aarch64-linux-android29 --sysroot="$TOOLS/sysroot" \
    -resource-dir="$(ls -d "$TOOLS"/lib/clang/* | head -1)" --rtlib=compiler-rt --unwindlib=none \
    -fuse-ld=lld -fno-emulated-tls -fPIE -pie -O2 -o "$OUT" build/ppcore.o core/android/shim.c -lm -llog

echo "== 3/4 the core's thread-local segment must be 64-aligned for Android"
case "$(llvm-readelf -lW "$OUT" | grep TLS)" in *0x40|*0x80|*0x100) ;; *) echo "TLS underaligned"; exit 1;; esac

echo "== 4/4 the APK"
TASK=$([ "$TYPE" = release ] && echo assembleRelease || echo assembleDebug)
gradle "$TASK" --console=verbose -PversionName="$NAME" -PversionCode="$CODE"
cp "app/build/outputs/apk/$TYPE/app-$TYPE.apk" "build/promptpipe-$NAME.apk"
[ -d /sdcard/Download ] && cp "build/promptpipe-$NAME.apk" /sdcard/Download/promptpipe.apk
echo "done: build/promptpipe-$NAME.apk"
