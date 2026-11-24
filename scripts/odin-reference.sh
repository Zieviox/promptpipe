#!/bin/sh
# Downloads the Odin reference into build/odin-reference/ (not in git): the language docs
# (overview, spec, packages, attributes, directives, testing, FAQ) from the odin-lang.org repo,
# and an index of the core library packages promptpipe's core uses, made from the compiler's
# source at one release (procedures, types and constants with their doc comments).
#
#   sh scripts/odin-reference.sh [tag]        default: the newest dev-YYYY-MM release
#
# ODIN_SRC=<folder> / ODIN_SITE=<folder>: use existing checkouts instead of downloading.
# Check the phone's compiler with `odin version`: the reference should match it.
set -e
cd "$(dirname "$0")/.."
OUT=build/odin-reference
TAG="${1:-$(git ls-remote --tags https://github.com/odin-lang/Odin | sed -n 's#.*refs/tags/\(dev-[0-9]\{4\}-[0-9]\{2\}\)$#\1#p' | sort | tail -1)}"
[ -n "$TAG" ] || { echo "Couldn't read the newest Odin release; give a tag (dev-YYYY-MM)."; exit 1; }
mkdir -p "$OUT"
SRC="${ODIN_SRC:-$OUT/odin-src}"
SITE="${ODIN_SITE:-$OUT/site}"
[ -d "$SRC/core" ] || git clone -q --depth 1 --branch "$TAG" https://github.com/odin-lang/Odin "$SRC"
[ -d "$SITE/content/docs" ] || git clone -q --depth 1 https://github.com/odin-lang/odin-lang.org "$SITE"

rm -rf "$OUT/docs" && mkdir -p "$OUT/docs"
for f in overview spec packages attributes directives testing faq; do
  cp "$SITE/content/docs/$f.md" "$OUT/docs/$f.md"
done

# The packages the core imports, plus the ones the rewrite is expected to need (signatures for
# the catalog, hashing, paths). Edit this list when the core starts using another package.
PKGS="base/builtin base/runtime core/bytes core/compress/deflate core/compress/zlib core/crypto core/crypto/sha2 core/crypto/ed25519
core/crypto/hash core/encoding/base64 core/encoding/endian core/encoding/hex core/encoding/json core/fmt core/io
core/mem core/mem/virtual core/net core/os core/path/filepath core/path/slashpath core/slice core/sort core/strconv
core/strings core/sync core/thread core/time core/unicode/utf8"
python3 - "$SRC" "$OUT/api" $PKGS <<'EOF'
import os, re, sys
src, out, pkgs = sys.argv[1], sys.argv[2], sys.argv[3:]
# Files for other platforms are left out: the core runs on Linux/Android (and desktop later).
OTHER = re.compile(r'_(windows|darwin|freebsd|openbsd|netbsd|haiku|js|wasi|wasm32|wasm64|essence|orca|freestanding|i386|amd64|arm32|riscv64)(_[a-z0-9]+)?\.odin$')
DECL = re.compile(r'^([A-Za-z_]\w*)\s*::\s*(#force_inline\s+|#force_no_inline\s+)?(proc\b|struct\b|enum\b|union\b|bit_set\b|distinct\b|#type\b|[^{;]*$|.*)')
os.makedirs(out, exist_ok=True)
index = []
for pkg in pkgs:
    d = os.path.join(src, pkg)
    if not os.path.isdir(d):
        print("missing package:", pkg); continue
    lines_out = [f"# {pkg.replace('/', ':', 1)}", ""]
    doc = os.path.join(d, "doc.odin")
    if os.path.isfile(doc):
        text = open(doc, errors="ignore").read()
        m = re.search(r'/\*(.*?)\*/', text, re.S)
        if m: lines_out += [m.group(1).strip(), ""]
    count = 0
    for f in sorted(os.listdir(d)):
        if not f.endswith(".odin") or OTHER.search(f) or f.endswith("_test.odin"):
            continue
        lines = open(os.path.join(d, f), errors="ignore").read().split("\n")
        if any(re.match(r'#\+private\s*$', l) or l.strip() == "#+private file" for l in lines[:5]):
            continue
        entries, comments, private = [], [], False
        for i, l in enumerate(lines):
            s = l.rstrip()
            if s.startswith("//"):
                comments.append(s[2:].strip()); continue
            if s.startswith("@("):
                if "private" in s: private = True
                continue
            m = DECL.match(s)
            if m and not s.startswith(("package", "import", "foreign")):
                name = m.group(1)
                if not private and not name.startswith("_"):
                    # Join continuation lines: a signature over several lines, or a procedure group.
                    text, j = s, i
                    group = re.search(r'::\s*proc\s*\{', s) is not None
                    while j + 1 < len(lines) and j - i < 40:
                        if group and "}" in text: break
                        if not group and text.count("(") <= text.count(")") and not text.rstrip().endswith((",", "(", "->", "=")):
                            break
                        j += 1
                        text += " " + lines[j].strip()
                    sig = text
                    if not group:
                        sig = re.sub(r'\s*\{[^{}]*\}\s*$', "", sig) if not sig.rstrip().endswith("{") else sig.rstrip()[:-1]
                        sig = sig.split(" --- ")[0].split("---")[0] if "---" in sig else sig
                    sig = re.sub(r'\s+', " ", sig).replace("( ", "(").replace(" )", ")").rstrip().rstrip("-").rstrip()
                    if sig.endswith("::"): sig += " ..."
                    entries.append((sig, [c for c in comments if c]))
            comments, private = [], False
        if entries:
            lines_out += [f"## {f}", ""]
            for sig, cm in entries:
                lines_out.append("```odin\n" + sig + "\n```")
                if cm: lines_out.append(" ".join(cm))
                lines_out.append("")
            count += len(entries)
    name = pkg.replace("/", "_") + ".md"
    open(os.path.join(out, name), "w").write("\n".join(lines_out))
    index.append(f"- [{pkg.replace('/', ':', 1)}](api/{name}): {count} declarations")
open(os.path.join(os.path.dirname(out), "README.md"), "w").write(
    "# Odin reference\n\nMade by scripts/odin-reference.sh. `docs/`: the language docs from the odin-lang.org repo. "
    "`api/`: the core library packages promptpipe uses, from the compiler's source (Linux/Android files only).\n\n" + "\n".join(index) + "\n")
print("\n".join(index))
EOF
echo "$TAG" > "$OUT/TAG"
echo "Odin reference for $TAG in $OUT (language docs, $(ls "$OUT/api" | wc -l) package indexes)."
