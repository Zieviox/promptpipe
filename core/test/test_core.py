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
    check("an unsigned catalogue is refused", call("catalogue_verify", {"data": "{}", "signature": "A" * 86 + "=="})["error"]["code"] == "permission_denied")

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
