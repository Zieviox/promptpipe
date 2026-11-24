#!/usr/bin/env python3
"""Version code, version name and file of each APK, read from its manifest (no aapt2 needed).

    python3 scripts/apk-version.py build/*.apk | sort -n

A new build must have a higher code than the app on the phone, or Android refuses it
(Samsung says "package appears to be invalid").
"""
import struct, sys, zipfile
def info(path):
    d = zipfile.ZipFile(path).read("AndroidManifest.xml")
    strings, resmap, off = [], [], 8
    while off < len(d):
        typ, hsz, size = struct.unpack_from("<HHI", d, off)
        if typ == 0x0001:  # string pool
            n, _, flags, sstart, _ = struct.unpack_from("<IIIII", d, off + 8)
            utf8 = flags & 0x100
            for i in range(n):
                p = off + sstart + struct.unpack_from("<I", d, off + hsz + 4 * i)[0]
                if utf8:
                    p += 2 if d[p] & 0x80 else 1
                    l = d[p]; p += 1
                    if l & 0x80: l = ((l & 0x7f) << 8) | d[p]; p += 1
                    strings.append(d[p:p + l].decode("utf8", "replace"))
                else:
                    l = struct.unpack_from("<H", d, p)[0]; p += 2
                    if l & 0x8000: l = ((l & 0x7fff) << 16) | struct.unpack_from("<H", d, p)[0]; p += 2
                    strings.append(d[p:p + 2 * l].decode("utf-16-le", "replace"))
        elif typ == 0x0180:  # resource ids of attribute names
            resmap = list(struct.unpack_from("<%dI" % ((size - hsz) // 4), d, off + hsz))
        elif typ == 0x0102:  # first start tag = <manifest>
            astart, asize, count = struct.unpack_from("<HHH", d, off + hsz + 8)
            out = {}
            for i in range(count):
                a = off + hsz + astart + i * asize
                _, name, raw, _, _, dtype, data = struct.unpack_from("<IIIHBBI", d, a)
                rid = resmap[name] if name < len(resmap) else 0
                key = {0x0101021b: "code", 0x0101021c: "name"}.get(rid) or strings[name]
                if key in ("code", "versionCode"): out["code"] = data
                if key in ("name", "versionName"): out["name"] = strings[raw] if raw != 0xFFFFFFFF else str(data)
                if strings[name] == "package": out["pkg"] = strings[raw]
            return out
        off += size
for f in sys.argv[1:]:
    try:
        o = info(f); print(f"{o.get('code', '?'):>6}  {o.get('name', '?'):<22} {f}")
    except Exception as e:
        print(f"     ?  ({e})  {f}")
