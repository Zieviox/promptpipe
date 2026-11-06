#!/bin/sh
# Builds the whole app on an arm64 phone (Termux + proot Arch): the Odin core,
# linked with the host clang against the NDK's sysroot (the NDK's own tools
# only run on x86), then the APK. Prints every step.
# Usage: sh scripts/build-local.sh [versionName] [versionCode]
# Needs: odin, clang, lld, JDK 17, Gradle, ANDROID_HOME (or sdk.dir in
# local.properties) with an NDK, and debug.keystore next to settings.gradle.kts
# so the APK installs over earlier ones.
set -e
cd "$(dirname "$0")/.."
VNAME="${1:-0.7.0-local}"
VCODE="${2:-100}"
step() { echo; echo "== $*"; }
t0=$(date +%s)

SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' local.properties 2>/dev/null)}"
[ -d "$SDK" ] || { echo "Set ANDROID_HOME, or sdk.dir in local.properties."; exit 1; }
[ -f local.properties ] || echo "sdk.dir=$SDK" > local.properties
NDK="${ANDROID_NDK_HOME:-$(ls -d "$SDK"/ndk/* 2>/dev/null | sort | tail -1)}"
[ -d "$NDK" ] || { echo "No NDK in $SDK/ndk."; exit 1; }
T=$(ls -d "$NDK"/toolchains/llvm/prebuilt/* | head -1)
GRADLE=$(command -v gradle || ls -d /root/gradle-*/bin/gradle 2>/dev/null | sort | tail -1)
[ -x "$GRADLE" ] || { echo "Gradle not found."; exit 1; }
command -v ld.lld >/dev/null || { echo "Installing lld..."; pacman -S --noconfirm lld; }
[ -f debug.keystore ] || echo "Note: no debug.keystore here, so this APK won't install over earlier ones."
# Newest GeckoView release, as the cloud builds use; GECKOVIEW=<v> pins one.
GV="${GECKOVIEW:-$(curl -fsSL https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/maven-metadata.xml | sed -n 's:.*<release>\(.*\)</release>.*:\1:p')}"
[ -n "$GV" ] || { echo "Couldn't read the GeckoView version; set GECKOVIEW=<version>."; exit 1; }
echo "sdk $SDK"; echo "ndk $NDK"; echo "gradle $GRADLE"; echo "geckoview $GV"; echo "version $VNAME ($VCODE)"

step "1/4 compiling core (Odin)"
mkdir -p build app/src/main/jniLibs/arm64-v8a
export ODIN_ANDROID_NDK="$NDK"
odin build core -target:linux_arm64 -subtarget:android -build-mode:object -out:build/ppcore-android.o -o:speed -show-timings

step "2/4 linking core"
OUT=app/src/main/jniLibs/arm64-v8a/libppcore.so
clang --target=aarch64-linux-android29 --sysroot="$T/sysroot" -resource-dir="$(ls -d "$T"/lib/clang/* | head -1)" \
    --rtlib=compiler-rt --unwindlib=none -fuse-ld=lld -fno-emulated-tls -fPIE -pie -O2 \
    -o "$OUT" build/ppcore-android.o core/android/shim.c -lm -llog
ls -la "$OUT"

step "3/4 checking core (TLS must be 64-aligned)"
tls=$(llvm-readelf -lW "$OUT" | grep TLS)
echo "$tls"
case "$tls" in *0x40|*0x80|*0x100) ;; *) echo "TLS segment underaligned: Android would refuse to start the core."; exit 1;; esac

step "4/4 building APK (Gradle prints each task)"
"$GRADLE" assembleDebug --console=plain --no-daemon -Dorg.gradle.jvmargs=-Xmx2g \
    -Pkotlin.compiler.execution.strategy=in-process -PgeckoviewVersion="$GV" -PversionName="$VNAME" -PversionCode="$VCODE"

APK=build/promptpipe-$VNAME.apk
cp app/build/outputs/apk/debug/app-debug.apk "$APK"
[ -d /sdcard/Download ] && cp "$APK" /sdcard/Download/promptpipe.apk && APK="$APK and /sdcard/Download/promptpipe.apk"
echo; echo "DONE in $(( $(date +%s) - t0 ))s -> $APK ($(du -h "$APK" | cut -f1))"
