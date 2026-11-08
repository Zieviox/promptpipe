#!/bin/sh
# Builds the core for Android (arm64) into app/src/main/jniLibs, where the app
# packs it as libppcore.so and runs it as a program.
# Needs: odin, and the Android NDK (ANDROID_NDK_HOME or ODIN_ANDROID_NDK).
# Android 10 (API 29) or newer: older Android has no native thread-locals.
set -e
cd "$(dirname "$0")/.."
NDK="${ODIN_ANDROID_NDK:-$ANDROID_NDK_HOME}"
[ -d "$NDK" ] || { echo "Set ANDROID_NDK_HOME to the Android NDK folder."; exit 1; }
export ODIN_ANDROID_NDK="$NDK"
CC="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android29-clang"
OUT=app/src/main/jniLibs/arm64-v8a
mkdir -p build "$OUT"
echo "core: compiling Odin for android arm64…"
t0=$(date +%s)
odin build core -target:linux_arm64 -subtarget:android -build-mode:object -out:build/ppcore-android.o -o:speed
echo "core: linking with the NDK…"
"$CC" -fPIE -pie -O2 -o "$OUT/libppcore.so" build/ppcore-android.o core/android/shim.c -lm -llog
echo "core: done in $(( $(date +%s) - t0 ))s -> $OUT/libppcore.so ($(wc -c < "$OUT/libppcore.so") bytes)"
