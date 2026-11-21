#!/bin/sh
# Makes every key promptpipe needs, once, on your phone or computer (never anywhere shared), and
# prints what to keep in your password manager:
#   1. the APK's release key: ~/.promptpipe/release.keystore, its password in
#      ~/.promptpipe/release.properties (read by `sh scripts/build.sh <name> <code> release`).
#      By default it's your debug.keystore's key under a new password, so the new app installs
#      over the old one and nothing is uninstalled (an uninstall deletes the old app's own folder
#      before it's imported). --fresh makes a new key instead (then uninstall the old app first,
#      after copying its folder to /sdcard/PromptPipe).
#   2. the catalogue's keys 1 and 2 (the plugins repo's scripts/catalogue_sign.py --new-key);
#      both public keys go into core/plugins.odin, key 1's into the plugins repo's catalogue.pub.
# Needs keytool (from the JDK) and python3 with the cryptography module.
set -e
cd "$(dirname "$0")/.."
DIR="$HOME/.promptpipe"
PLUGINS="${PP_PLUGINS:-../promptpipe-plugins}"
STORE="$DIR/release.keystore"
PROPS="$DIR/release.properties"
[ -e "$STORE" ] && { echo "$STORE already exists; move it away first if you really want new keys."; exit 1; }
[ -f "$PLUGINS/scripts/catalogue_sign.py" ] || { echo "No promptpipe-plugins at $PLUGINS (set PP_PLUGINS)."; exit 1; }
grep -q '"0\{64\}"' core/plugins.odin || { echo "core/plugins.odin already has catalogue keys."; exit 1; }
mkdir -p "$DIR" && chmod 700 "$DIR"
PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")

if [ -f debug.keystore ] && [ "$1" != "--fresh" ]; then
    echo "== 1/2 the release key: your debug.keystore's key, under a new password"
    keytool -importkeystore -noprompt -srckeystore debug.keystore -srcstorepass android \
        -srcalias androiddebugkey -destkeystore "$STORE" -deststoretype PKCS12 \
        -deststorepass "$PASS" -destkeypass "$PASS" -destalias promptpipe
else
    echo "== 1/2 the release key: a new one"
    keytool -genkeypair -noprompt -keystore "$STORE" -storetype PKCS12 -alias promptpipe \
        -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=promptpipe" \
        -storepass "$PASS" -keypass "$PASS"
fi
chmod 600 "$STORE"
printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=promptpipe\nkeyPassword=%s\n' "$STORE" "$PASS" "$PASS" > "$PROPS"
chmod 600 "$PROPS"

echo "== 2/2 the catalogue's keys"
OUT=$(python3 "$PLUGINS/scripts/catalogue_sign.py" --new-key)
set -- $(echo "$OUT" | sed -n 's/^PUBLIC_KEYS //p')
python3 - "$1" "$2" <<'PY'
import sys
path = "core/plugins.odin"
text = open(path).read()
for key in sys.argv[1:]:
    text = text.replace('"' + "0" * 64 + '"', f'"{key}"', 1)
open(path, "w").write(text)
PY

cat <<END

==== Keep these in your password manager ====

1. APK release key
   password: $PASS
   the key file ($STORE), as text (paste it whole; base64 -d turns it back into the file):
$(base64 < "$STORE" | tr -d '\n')

2. Catalogue keys
$(echo "$OUT" | sed -n 's/^  promptpipe/   promptpipe/p')

Not secret, already in place: the public keys in core/plugins.odin (commit it) and
$PLUGINS/catalogue.pub (commit it).
To get the keys back on a new phone: base64 -d the key file into $STORE, write
$PROPS as above, and put catalogue key 1 into $DIR/catalogue.key.
END
