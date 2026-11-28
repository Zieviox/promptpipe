"""The core against real HTTP: start it with temporary folders, then check the key, the challenge,
files and the change check, search, plugin hashes, the catalogue's signature and a local API job
answered by a stand-in screen. Run: python3 core/test/test_core.py <path to the built core>"""
import hashlib, hmac, json, os, subprocess, sys, tempfile, threading, time, urllib.request

CORE, PORT, KEY = sys.argv[1], 7797, "k" * 40
tmp = tempfile.mkdtemp()
app, private, assets = (os.path.join(tmp, d) for d in ("app", "private", "assets"))
os.makedirs(os.path.join(assets, "plugins", "base64"))
open(os.path.join(assets, "plugins", "base64", "plugin.json"), "w").write('{"id":"base64","version":"1.0.0"}')
proc = subprocess.Popen([CORE, "--app", app, "--private", private, "--assets", assets, "--port", str(PORT)],
                        env={**os.environ, "PP_KEY": KEY}, stdout=subprocess.DEVNULL)
time.sleep(0.5)
BASE = f"http://127.0.0.1:{PORT}"
failures = []

def http(path, body=None, headers=None, method=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"X-PP-Key": KEY, **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def call(name, data):
    return json.loads(http("/call", {"type": "call", "name": name, "data": data, "id": "1"})[1])

def check(what, ok):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok: failures.append(what)

try:
    check("no key, no answer", http("/call", {}, headers={"X-PP-Key": ""})[0] == 401)
    nonce = "abc"
    want = hmac.new(KEY.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    check("the challenge proves the key without sending it (S2)", http(f"/challenge?nonce={nonce}", headers={"X-PP-Key": ""})[1] == want)

    r = call("file_write", {"root": "app", "path": "config.json", "data": '{"settings":{}}'})
    rev = r["data"]["revision"]
    check("a write answers its revision", rev == hashlib.sha256(b'{"settings":{}}').hexdigest())
    open(os.path.join(app, "config.json"), "w").write('{"edited":true}')
    r = call("file_write", {"root": "app", "path": "config.json", "data": "{}", "expected": rev})
    check("an outside change isn't overwritten (D7)", "outside_change" in r["data"])
    r = call("file_read", {"root": "app", "path": "config.json"})
    check("a read says the file changed outside the app", r["data"][0]["changed"] is True)
    check("paths can't leave their root", call("file_read", {"root": "app", "path": "../x"}).get("error", {}).get("code") == "invalid_argument")
    check("only a .nomedia marker can be written on the phone's storage",
          call("file_write", {"root": "device", "path": "/tmp/x.txt", "data": "x"})["error"]["code"] == "permission_denied")

    # One write check for every call that changes files (H5): a copy or a move can't get around it.
    open(os.path.join(tmp, "x.txt"), "w").write("x")
    r = call("file_move", {"root": "device", "from": os.path.join(tmp, "x.txt"), "to_root": "built_in", "to": "base64/plugin.json", "copy": True})
    check("a copy can't overwrite a built-in plugin's file",
          r["error"]["code"] == "permission_denied" and "base64" in open(os.path.join(assets, "plugins", "base64", "plugin.json")).read())
    r = call("file_move", {"root": "app", "from": "config.json", "to_root": "device", "to": os.path.join(tmp, "out.json"), "copy": True})
    check("nothing is copied onto the phone's storage", r["error"]["code"] == "permission_denied" and not os.path.exists(os.path.join(tmp, "out.json")))
    r = call("file_move", {"root": "device", "from": os.path.join(tmp, "x.txt"), "to_root": "app", "to": "x.txt"})
    check("nothing on the phone's storage is moved", r["error"]["code"] == "permission_denied" and os.path.exists(os.path.join(tmp, "x.txt")))
    check("a write can't leave its root", call("file_write", {"root": "app", "path": "../x.txt", "data": "x"})["error"]["code"] == "invalid_argument")
    check("a delete on the phone's storage only takes the old app's folders",
          call("file_delete", {"root": "device", "path": os.path.join(tmp, "x.txt")})["error"]["code"] == "permission_denied")

    chat = ".promptpipe/chats/c1"
    call("file_write", {"root": "chats", "path": f"{chat}/meta.json", "data": '{"name":"Trip ideas"}'})
    turns = [{"id": "t1", "message": "a red car", "reply": "nice"}, {"id": "t2", "message": "blue", "reply": "sky"}]
    call("file_write", {"root": "chats", "path": f"{chat}/turns.json", "data": json.dumps(turns)})
    r = call("file_find", {"root": "chats", "words": ["trip", "red"], "phrases": []})
    check("search finds by the chat's name and the text (#212)", [m["turn"]["id"] for m in r["data"]] == ["t1"])
    r = call("file_read", {"root": "chats", "pattern": ".promptpipe/chats/*/meta.json"})
    check("a pattern reads every chat's meta", len(r["data"]) == 1)
    r = call("file_move", {"root": "chats", "from": ".promptpipe", "to_root": "app", "to": "copy", "copy": True})
    check("a copy keeps the original", os.path.exists(os.path.join(app, "chats", ".promptpipe")) and r["data"]["copied"] == 0)

    files = {"plugin.json": '{"id":"rot13","version":"1.0.0"}', "main.js": "x"}
    hashes = {n: hashlib.sha256(t.encode()).hexdigest() for n, t in files.items()}
    bad = call("plugin_write", {"plugin": "rot13", "files": {**files, "main.js": "y"}, "entry": {"hashes": hashes}})
    check("a file that doesn't match the catalogue's hash is refused (S3)", bad["error"]["code"] == "permission_denied")
    good = call("plugin_write", {"plugin": "rot13", "files": files, "entry": {"hashes": hashes}})
    check("a matching plugin goes to the updates", good["data"]["copy"] == "updated")
    ids = {p["id"]: p["copy"] for p in call("plugin_list", {})["data"]}
    check("the list says which copy runs", ids == {"base64": "built_in", "rot13": "updated"})
    check("the plugin's files are served from the copy that runs", http("/plugins/rot13/main.js")[1] == "x")
    old = os.path.join(tmp, "old", "PromptPipe")
    os.makedirs(os.path.join(old, "history", ".git"))
    big = os.urandom(3 * 1024 * 1024)
    open(os.path.join(old, "history", ".git", "pack"), "wb").write(big)
    open(os.path.join(old, "history", "Trip.md"), "w").write("# Trip")
    r = call("file_move", {"root": "device", "from": old, "to_root": "app", "to": ".promptpipe/backups/old-app-shared", "copy": True, "overwrite": False})
    copy = os.path.join(app, ".promptpipe", "backups", "old-app-shared", "history")
    check("a folder is copied whole, hidden ones and big files included, in chunks",
          r["data"]["copied"] == 1 and open(os.path.join(copy, ".git", "pack"), "rb").read() == big
          and open(os.path.join(copy, "Trip.md")).read() == "# Trip")
    check("a whole copy reports no failures", r["data"]["failed"] == 0 and r["data"]["first_failed"] == "")
    backup = ".promptpipe/backups/old-app-shared"
    r = call("file_move", {"root": "app", "from": backup, "to": f"{backup}/history/history", "copy": True})
    check("a folder is never copied into itself (the old app's nested history)",
          r.get("error", {}).get("code") == "invalid_argument" and not os.path.exists(os.path.join(copy, "history")))
    os.makedirs(os.path.join(app, "blocked", "history", "Trip.md"))  # a folder where the file goes
    r = call("file_move", {"root": "device", "from": old, "to_root": "app", "to": "blocked", "copy": True, "overwrite": True})
    check("a copy names the files it couldn't copy (H6)",
          r["data"]["failed"] == 1 and r["data"]["first_failed"].endswith("history/Trip.md")
          and not os.path.exists(os.path.join(app, "blocked", "history", "Trip.md.copying")))
    # A chat's own files by a pattern with "*" inside a part (how a chat's messages are loaded).
    one = os.path.join(app, "chats", ".promptpipe", "chats", "abc")
    os.makedirs(one, exist_ok=True)
    for f in ("meta.json", "turns.json", "memory.json", "notes.txt"):
        open(os.path.join(one, f), "w").write("{}")
    got = sorted(f["path"].split("/")[-1] for f in call("file_read", {"root": "chats", "pattern": ".promptpipe/chats/abc/*.json"})["data"])
    check("\"*\" inside a path part matches (a chat's messages load after a restart)", got == ["memory.json", "meta.json", "turns.json"])
    got = [f["path"] for f in call("file_read", {"root": "chats", "pattern": ".promptpipe/chats/*/meta.json"})["data"]]
    check("\"*\" as a whole part still matches", ".promptpipe/chats/abc/meta.json" in got and all(p.endswith("/meta.json") for p in got))
    folders = call("chats_folder_get", {})["data"]
    check("the core names the default chats folder", folders["default"] == os.path.join(app, "chats"))
    check("an unsigned catalogue is refused", call("catalogue_verify", {"data": "{}", "signature": "A" * 86 + "=="})["error"]["code"] == "permission_denied")
    try:  # another source's catalogue, checked against the key accepted for it
        import base64
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        source_key = Ed25519PrivateKey.generate()
        raw = serialization.Encoding.Raw
        public = source_key.public_key().public_bytes(raw, serialization.PublicFormat.Raw).hex()
        data = '{"version":1,"entries":[]}'
        signature = base64.b64encode(source_key.sign(data.encode())).decode()
        r = call("catalogue_verify", {"data": data, "signature": signature, "key": public})
        check("a source's catalogue signed with its accepted key is taken", "error" not in r)
        other = Ed25519PrivateKey.generate().public_key().public_bytes(raw, serialization.PublicFormat.Raw).hex()
        r = call("catalogue_verify", {"data": data, "signature": signature, "key": other})
        check("the same catalogue under another key is refused", r["error"]["code"] == "permission_denied")
        r = call("catalogue_verify", {"data": data, "signature": signature})
        check("a source's key doesn't count for the official catalogue", r["error"]["code"] == "permission_denied")
    except ImportError:
        print("skip the sources' keys (no cryptography module)")

    token = "secret-token"
    cfg = json.dumps({"settings": {}, "api_token_hash": hashlib.sha256(token.encode()).hexdigest()})
    call("file_write", {"root": "app", "path": "config.json", "data": cfg, "expected": hashlib.sha256(b'{"edited":true}').hexdigest()})
    check("a wrong token is refused (UC41)", http("/v1/models", headers={"Authorization": "Bearer nope", "X-PP-Key": ""})[0] == 401)

    def screen():  # a stand-in screen: answers each job from the event stream
        req = urllib.request.Request(BASE + "/events", headers={"X-PP-Key": KEY})
        with urllib.request.urlopen(req, timeout=20) as stream:
            for line in stream:
                if not line.startswith(b"data: "): continue
                event = json.loads(line[6:])
                job = event["data"]
                if job.get("request") == "chat":
                    for status, reply in (("sending", "Hel"), ("done", "Hello there")):
                        http("/event", {"type": "event", "name": "job_changed", "data": {"job": job["id"], "status": status, "reply": reply, "chat": "c9", "sent": "hi"}})
                    return
    threading.Thread(target=screen, daemon=True).start()
    time.sleep(0.3)
    status, body = http("/v1/chat/completions", {"model": "Plain", "messages": [{"role": "user", "content": "hi"}]},
                        headers={"Authorization": "Bearer " + token, "X-PP-Key": ""})
    answer = json.loads(body)
    check("a job answers like OpenAI, with the chat it went to", answer["choices"][0]["message"]["content"] == "Hello there" and answer["promptpipe"]["chat"] == "c9")
finally:
    proc.terminate()
print("all passed" if not failures else f"{len(failures)} failed")
sys.exit(1 if failures else 0)
