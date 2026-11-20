#!/usr/bin/env python3
"""Type 3 clone detection in the SourcererCC style: every function (at any nesting level) is a
multiset ("bag") of tokens, and a pair is a candidate when

    overlap = |A ∩ B| / max(|A|, |B|) >= threshold

Pairs where one function contains the other (same file) are dropped.

    python3 tokenbag.py [--threshold 0.7] [--min-tokens 40] [--normalize] ROOT...

--normalize replaces names, strings and numbers with placeholders (finds renamed copies, Type 2-3).
It is noisy on screen code built from h(...) calls: use a higher threshold (0.85) and read the pairs.
Languages: .js, .odin, .kt (brace bodies), .py (indented bodies).
"""
import argparse, collections, itertools, os, re

SKIP_DIRS = ("node_modules", "/.git", "/assets/plugins", "/build")
KW = set("""if else for while do return const let var function async await new try catch finally throw switch case break
continue typeof instanceof in of class extends this null undefined true false proc struct defer or_return or_else when
package import fun val private override internal object is as def lambda not and elif pass with from None True False""".split())
TOK = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`|/\*.*?\*/|//[^\n]*|#[^\n]*|[A-Za-z_$][\w$]*|\d[\w.]*'
                 r'|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|::|:=|\.\.\.|[^\s\w]', re.S)
START = {
    ".js": re.compile(r'(?:function\s*\*?\s*[\w$]*\s*\([^)]*\)\s*\{|(?:\([^()]*\)|[\w$]+)\s*=>\s*\{)'),
    ".odin": re.compile(r'::\s*proc[^{]*\{'),
    ".kt": re.compile(r'\bfun\s[^{=]*\{'),
}


def tokens(src, hash_comments, normalize):
    out = []
    for t in TOK.findall(src):
        if t.startswith(("//", "/*")) or (hash_comments and t.startswith("#")):
            continue
        if normalize:
            if t[0] in "\"'`":
                t = "S"
            elif t[0].isdigit():
                t = "N"
            elif (t[0].isalpha() or t[0] in "_$") and t not in KW:
                t = "I"
        out.append(t)
    return out


def brace_end(src, j):
    depth = 1
    while j < len(src) and depth:
        c = src[j]
        if c in "\"'`":
            q = c
            j += 1
            while j < len(src) and src[j] != q:
                j += 2 if src[j] == "\\" else 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        j += 1
    return j


def functions(path, normalize, min_tokens):
    ext = os.path.splitext(path)[1]
    src = open(path, errors="ignore").read()
    found = []
    if ext == ".py":
        lines = src.split("\n")
        for i, line in enumerate(lines):
            m = re.match(r'(\s*)def\s', line)
            if not m:
                continue
            indent, body = len(m.group(1)), [line]
            for nxt in lines[i + 1:]:
                if nxt.strip() and len(nxt) - len(nxt.lstrip()) <= indent:
                    break
                body.append(nxt)
            found.append((i + 1, (i, i + len(body)), tokens("\n".join(body), True, normalize)))
    elif ext in START:
        for m in START[ext].finditer(src):
            end = brace_end(src, m.end())
            found.append((src.count("\n", 0, m.start()) + 1, (m.start(), end), tokens(src[m.start():end], False, normalize)))
    return [(line, span, t) for line, span, t in found if len(t) >= min_tokens]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("roots", nargs="+")
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--min-tokens", type=int, default=40)
    ap.add_argument("--normalize", action="store_true")
    a = ap.parse_args()
    bags = []
    for root in a.roots:
        for d, _, files in os.walk(root):
            if any(s in d for s in SKIP_DIRS):
                continue
            for f in sorted(files):
                if os.path.splitext(f)[1] not in (".js", ".odin", ".kt", ".py"):
                    continue
                p = os.path.join(d, f)
                for line, span, t in functions(p, a.normalize, a.min_tokens):
                    bags.append((f"{os.path.relpath(p)}:{line}", collections.Counter(t), len(t), p, span))
    pairs = []
    for (na, A, la, pa, sa), (nb, B, lb, pb, sb) in itertools.combinations(bags, 2):
        if pa == pb and ((sa[0] <= sb[0] and sb[1] <= sa[1]) or (sb[0] <= sa[0] and sa[1] <= sb[1])):
            continue  # one contains the other
        big = max(la, lb)
        if min(la, lb) < a.threshold * big:
            continue  # sizes too far apart to reach the threshold
        overlap = sum((A & B).values()) / big
        if overlap >= a.threshold:
            pairs.append((overlap, na, la, nb, lb))
    mode = "names and literals replaced" if a.normalize else "real tokens"
    print(f"{len(bags)} functions, {len(pairs)} pairs >= {a.threshold} ({mode}, min {a.min_tokens} tokens)")
    for overlap, na, la, nb, lb in sorted(pairs, reverse=True):
        print(f"{overlap:.2f}  {na} ({la} tokens)  ~  {nb} ({lb} tokens)")


main()
