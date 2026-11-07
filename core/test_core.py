#!/usr/bin/env python3
"""Route checks for the core. Starts it on a free port in a temp folder.
Usage: python3 core/test_core.py <path to ppcore binary>"""
import base64, hashlib, hmac, io, zipfile, json, os, socket, subprocess, sys, tempfile, threading, time, http.client

BIN = sys.argv[1]
KEY = "k" * 48
tmp = tempfile.mkdtemp(prefix="pptest-")
assets = os.path.join(tmp, "assets")
os.makedirs(os.path.join(assets, "ui"))
os.makedirs(os.path.join(assets, "plugins", "demo"))
open(os.path.join(assets, "ui", "index.html"), "w").write("<h1>ui</h1>")
open(os.path.join(assets, "plugins", "demo", "plugin.json"), "w").write('{"id":"demo","version":"1.0.0"}')
open(os.path.join(assets, "plugins", "demo", "main.js"), "w").write("x()")
s = socket.socket(); s.bind(("127.0.0.1", 0)); PORT = s.getsockname()[1]; s.close()
proc = subprocess.Popen([BIN, "--data", tmp + "/data", "--private", tmp + "/priv", "--assets", assets, "--port", str(PORT)],
                        env={**os.environ, "PP_KEY": KEY}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
for _ in range(50):
    try: socket.create_connection(("127.0.0.1", PORT), 0.1).close(); break
    except OSError: time.sleep(0.1)

passed = failed = 0
def check(name, cond, extra=""):
    global passed, failed
    if cond: passed += 1; print("  ok  ", name)
    else: failed += 1; print("  FAIL", name, extra)

def call(method, path, body=None, headers=None, host=None, timeout=40):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=timeout)
    h = {"Host": host or f"127.0.0.1:{PORT}"}
    h.update(headers or {})
    data = None
    if body is not None:
        data = body if isinstance(body, (bytes, str)) else json.dumps(body)
        h["Content-Type"] = "application/json"
    c.request(method, path, body=data, headers=h)
    r = c.getresponse()
    raw = r.read().decode()
    try: js = json.loads(raw)
    except Exception: js = None
    return r.status, js, raw, dict(r.getheaders())

K = {"X-PP-Key": KEY}
def api(method, path, body=None, **kw): return call(method, path, body, K, **kw)

print("security")
st, _, _, _ = call("GET", "/api/app"); check("no key -> 401", st == 401)
st, _, _, _ = call("GET", "/api/app", headers={"X-PP-Key": "wrong" * 10}); check("wrong key -> 401", st == 401)
st, _, _, _ = call("GET", "/api/app", headers=K, host="evil.example:%d" % PORT); check("wrong Host -> 403", st == 403)
st, _, _, _ = call("GET", "/shell/next", headers={"Cookie": "pp_key=" + KEY}); check("shell needs header, not cookie", st == 401)
st, _, _, h = call("GET", "/open?key=" + KEY)
check("open sets cookie and redirects", st == 302 and "HttpOnly" in h.get("Set-Cookie", "") and "SameSite=Strict" in h.get("Set-Cookie", ""))
st, _, raw, _ = call("GET", "/", headers={"Cookie": "pp_key=" + KEY}); check("cookie opens the screen", st == 200 and "ui" in raw)
st, _, _, _ = call("GET", "/open?key=nope"); check("open with wrong key -> 401", st == 401)

def raw_head(head, wait=5):
    """Send just a request head (no body) and return the status line the core answers with."""
    sk = socket.create_connection(("127.0.0.1", PORT), 2); sk.settimeout(wait)
    sk.sendall(head.encode())
    try: return sk.recv(200).decode(errors="replace").split("\r\n")[0]
    except socket.timeout: return "(no answer)"
    finally: sk.close()
nonce = "ab" * 16
st, js, _, _ = call("GET", "/hello?nonce=" + nonce)
want = hmac.new(KEY.encode(), ("ppcore-proof:" + nonce).encode(), hashlib.sha256).hexdigest()
check("hello proves the key without a key", st == 200 and js["proof"] == want, js)
st, _, _, _ = call("GET", "/hello?nonce=xyz"); check("hello refuses a bad nonce", st == 400)
st, _, _, _ = call("GET", "/hello?nonce=" + nonce, host="evil.example:%d" % PORT); check("hello checks Host", st == 403)
line = raw_head(f"POST /api/config HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nContent-Length: 60000000\r\n\r\n")
check("no key: refused before the body is read", " 401 " in line, line)
line = raw_head(f"POST /hello?nonce={nonce} HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nContent-Length: 10\r\n\r\n")
check("open routes take no body", " 413 " in line, line)
line = raw_head(f"POST /api/config HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nX-PP-Key: {KEY}\r\nContent-Length: 70000000\r\n\r\n")
check("body over the cap refused", " 413 " in line, line)

st, js, _, _ = call("GET", "/api/app", headers=K); TOKEN0 = js["apiTokenValue"]
st, js, _, _ = call("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "hi"}]}, {"Authorization": "Bearer " + TOKEN0}); check("API with app screen closed -> 503", st == 503, js)
print("app info, config, secrets")
st, js, _, _ = api("GET", "/api/app"); check("app info", st == 200 and js["apiToken"] is True and len(js["apiTokenValue"]) == 48, js)
token = js["apiTokenValue"]
st, _, _, _ = api("POST", "/api/config", {"profiles": [{"name": "Qwen"}], "git": {"enabled": True}}); check("config write", st == 200)
st, js, _, _ = api("GET", "/api/config"); check("config read", js["profiles"][0]["name"] == "Qwen")
st, _, _, _ = api("POST", "/api/config", "{broken"); check("broken config refused", st == 400)
st, _, _, _ = api("POST", "/api/secret", {"key": "apiToken", "value": ""}); check("empty API token makes a new one", st == 200)
st, js, _, _ = api("GET", "/api/app"); check("token changed, still on", js["apiTokenValue"] != token and len(js["apiTokenValue"]) == 48)
token = js["apiTokenValue"]
mode = oct(os.stat(tmp + "/priv/secrets.json").st_mode & 0o777); check("secrets file owner-only", mode == "0o600", mode)

print("history")
st, js, _, _ = api("POST", "/api/history/save", {"files": [{"path": "a/one.md", "text": "# One\nhi"}], "mkdir": ["empty"]})
check("save writes and reports git as unsupported (no shell)", st == 200 and js["ok"] and "not supported on this platform" in js.get("gitError", ""), js)
st, js, _, _ = api("GET", "/api/history/tree")
check("tree", [f["path"] for f in js["files"]] == ["a/one.md"] and set(js["folders"]) == {"a", "empty"}, js)
st, js, _, _ = api("GET", "/api/history/file?path=a/one.md"); check("file", js["text"].startswith("# One"))
st, js, _, _ = api("GET", "/api/history/file?path=../priv/secrets.json"); check("path escape refused", st == 400)
st, js, _, _ = api("POST", "/api/history/save", {"files": [{"path": "../x.md", "text": "x"}]}); check("save escape refused", st == 400)
os.makedirs(tmp + "/data/history/.memory/a/one", exist_ok=True)
open(tmp + "/data/history/.memory/a/one/s.md", "w").write("sum")
st, js, _, _ = api("POST", "/api/history/save", {"moves": [{"from": "a/one.md", "to": "b/one.md"}]})
check("move takes companion files along", st == 200 and os.path.exists(tmp + "/data/history/.memory/b/one/s.md"), js)
st, js, _, _ = api("GET", "/api/log"); check("log missing is reported", st == 200 and js["exists"] is False and js["text"] == "", js)
os.makedirs(tmp + "/data/logs", exist_ok=True)
open(tmp + "/data/logs/core.log", "w", encoding="utf-8").write("é" + "x" * 70000 + "\nlast line\n")
st, js, _, _ = api("GET", "/api/log"); check("log tail", js["exists"] and js["text"].endswith("last line\n") and len(js["text"]) <= 64000, len(js.get("text", "")))
st, js, _, _ = api("GET", "/api/history/all"); check("all", js["files"][0]["text"].startswith("# One"))

print("plugins")
st, js, _, _ = api("GET", "/api/plugins"); check("list", js["plugins"][0]["id"] == "demo" and js["plugins"][0]["source"] == "builtin", js)
st, _, raw, _ = api("GET", "/plugins/demo/main.js"); check("plugin file", raw == "x()")
def zipb(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        for n, t in files.items(): z.writestr(n, t)
    return b.getvalue()
bundle = zipb({"pp-0.7/bundle.json": '{"version":"1.1"}', "pp-0.7/demo/plugin.json": '{"id":"demo","version":"1.1.0"}', "pp-0.7/demo/main.js": "y()"})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "b.zip", "base64": base64.b64encode(bundle).decode()})
check("bundle zip installs as the update", st == 200 and js["id"] == "bundle:1.1", js)
st, js, _, _ = api("GET", "/api/plugins"); check("newer update used", js["plugins"][0].get("updated") is True, js)
st, _, raw, _ = api("GET", "/plugins/demo/main.js"); check("update file served", raw == "y()")
st, _, raw, _ = api("GET", "/plugins/demo/main.js?builtin=1"); check("safe mode uses built-in", raw == "x()")
st, js, _, _ = api("GET", "/api/plugins/bundle"); check("bundle info", js["version"] == "1.1")
st, js, _, _ = api("POST", "/api/plugins/fork", {"id": "demo"}); check("fork", st == 200 and js["path"].endswith("plugins/demo"))
st, js, _, _ = api("GET", "/api/plugins"); mine = {p["id"]: p for p in js["plugins"]}
check("a copy of yours says which version it hides", mine["demo"].get("overrides") and mine["demo"].get("shadows") == "1.1.0", mine["demo"])
st, js, _, _ = api("POST", "/api/plugins/remove", {"id": "demo"}); check("remove deletes your copy", st == 200 and not os.path.exists(tmp + "/data/plugins/demo"), js)
st, js, _, _ = api("POST", "/api/plugins/remove", {"id": "demo"}); check("remove refuses when there is no copy", st == 400, js)
st, js, _, _ = api("POST", "/api/plugins/remove", {"id": "../x"}); check("remove refuses a bad id", st == 400, js)
st, js, _, _ = api("POST", "/api/plugins/fork", {"id": "demo"}); check("fork again", st == 200)
st, js, _, _ = api("GET", "/api/plugins"); check("user copy wins", js["plugins"][0]["source"] == "user" and js["plugins"][0].get("overrides"), js)
one = zipb({"x/plugin.json": '{"id":"../bad"}'})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "x.zip", "base64": base64.b64encode(one).decode()}); check("bad id refused", st == 400, js)
one = zipb({"mine/plugin.json": '{"id":"mine","version":"1"}', "mine/main.js": "m()"})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "m.zip", "base64": base64.b64encode(one).decode()}); check("plugin zip installs", js.get("id") == "mine" and os.path.exists(tmp + "/data/plugins/mine/main.js"), js)
st, js, _, _ = api("POST", "/api/plugins/install", {"url": "https://example.com/p/plugin.json"}); check("install by link needs the shell's fetch", st == 400 and "shell" in js["error"], js)
def patched(zipbytes, field, value, size):
    """The zip with one field of its first central directory entry changed."""
    z = bytearray(zipbytes)
    eocd = z.rfind(b"PK\x05\x06")
    cd = int.from_bytes(z[eocd + 16:eocd + 20], "little")
    z[cd + field:cd + field + size] = value.to_bytes(size, "little")
    return bytes(z)
def install_zip(zb): return api("POST", "/api/plugins/install", {"name": "z.zip", "base64": base64.b64encode(zb).decode()})
good = zipb({"zz/plugin.json": '{"id":"zz","version":"1"}'})
st, js, _, _ = install_zip(patched(good, 28, 0xFFFF, 2)); check("zip name running past the end refused", st == 400 and "broken zip" in js["error"], js)
st, js, _, _ = install_zip(patched(good, 24, 1, 4)); check("zip size that doesn't match refused", st == 400 and "can't unpack" in js["error"], js)
st, js, _, _ = install_zip(patched(good, 24, 0xFFFFFFFF, 4)); check("huge zip entry refused", st == 400 and "too big" in js["error"], js)
st, js, _, _ = install_zip(patched(good, 42, 0x7FFFFFFF, 4)); check("zip entry offset past the end refused", st == 400 and "broken zip" in js["error"], js)
st, _, _, _ = api("GET", "/api/app"); check("core still up after bad zips", st == 200)

print("events")
api("POST", "/shell/emit", {"event": {"type": "start"}})
st, js, _, _ = api("GET", "/api/events?after=0", timeout=5)
seq = js["seq"]
check("poll returns waiting events at once", js["events"][-1]["type"] == "start", js)
def later_emit():
    time.sleep(0.5); api("POST", "/shell/emit", {"event": {"type": "hello", "n": 1}})
threading.Thread(target=later_emit).start()
t0 = time.time(); st, js, _, _ = api("GET", f"/api/events?after={seq}")
check("long poll wakes on event", js["events"] and js["events"][-1]["type"] == "hello" and js["events"][-1]["seq"] == seq + 1 and time.time() - t0 < 5, js)

print("shell bridge and modules")
st, js, _, _ = api("POST", "/api/site", {"cmd": "info"}); check("site call without shell says so", st == 502 and "shell" in js["error"], js)
api("POST", "/shell/hello", {"platform": "test", "modules": ["clipboard"], "missing": {"git": "no git here"}})
def fake_shell():
    for _ in range(8):
        st, js, _, _ = api("GET", "/shell/next")
        for c in js["calls"]:
            if c["kind"] == "site": api("POST", "/shell/done", {"id": c["id"], "ok": True, "result": {"url": "https://chat.example", "echo": c["data"]["cmd"]}})
            elif c["kind"] == "fetch":
                body = WEB.get(c["data"]["url"])
                api("POST", "/shell/done", {"id": c["id"], "ok": True, "result": {"status": 200 if body is not None else 404, "base64": base64.b64encode(body or b"").decode()}})
            elif c["kind"] == "module": api("POST", "/shell/done", {"id": c["id"], "ok": True, "result": {"copied": c["data"]["args"]["text"]}})
            else: api("POST", "/shell/done", {"id": c["id"], "ok": False, "error": "nope"})
WEB = {
    "https://raw.githubusercontent.com/o/r/main/web/plugin.json": b'{"id":"web","version":"2","main":"main.js"}',
    "https://raw.githubusercontent.com/o/r/main/web/main.js": b"w()",
    "https://api.github.com/repos/o/r/releases/latest": json.dumps({"tag_name": "v1.2", "assets": [{"name": "promptpipe-plugins-1.2.zip", "browser_download_url": "https://github.com/o/r/releases/download/v1.2/promptpipe-plugins-1.2.zip"}]}).encode(),
    "https://github.com/o/r/releases/download/v1.2/promptpipe-plugins-1.2.zip": zipb({"bundle.json": '{"version":"1.2"}', "demo/plugin.json": '{"id":"demo","version":"1.2.0"}'}),
}
sh = threading.Thread(target=fake_shell); sh.start()
time.sleep(0.2)
st, js, _, _ = api("POST", "/api/site", {"cmd": "info"}); check("site call goes through the shell", st == 200 and js["echo"] == "info", js)
st, js, _, _ = api("POST", "/api/module", {"module": "clipboard", "call": "copy", "args": {"text": "hey"}}); check("module call", st == 200 and js["result"]["copied"] == "hey", js)
st, js, _, _ = api("POST", "/api/plugins/install", {"url": "https://github.com/o/r/tree/main/web"}); check("install from a GitHub folder link via shell fetch", js.get("id") == "web" and open(tmp + "/data/plugins/web/main.js").read() == "w()", js)
st, js, _, _ = api("POST", "/api/plugins/update", {"repo": "o/r"}); check("update from latest release", js.get("updated") and js["version"] == "1.2", js)
st, js, _, _ = api("POST", "/api/plugins/update", {"repo": "o/r"}); check("second update: up to date", js.get("upToDate") is True, js)
for c in ("push", "pull", "commit"):
    st, js, _, _ = api("POST", "/api/module", {"module": "git", "call": c, "args": {"remote": "https://evil.example/x.git"}})
    check(f"git {c} through /api/module refused", st == 403, js)
st, js, _, _ = api("POST", "/api/module", {"module": "git", "call": "log"}); check("missing module: reported, with reason", st == 501 and "not supported on this platform (test): no git here" in js["error"], js)
st, js, _, _ = api("GET", "/api/app"); check("app info lists modules and missing", js["modules"] == ["clipboard"] and js["missing"]["git"] == "no git here" and js["shell"] is True, js)
sh.join(timeout=60)

print("OpenAI API")
st, js, _, _ = call("GET", "/v1/models"); check("no token -> 401", st == 401)
B = {"Authorization": "Bearer " + token}
st, js, _, h = call("GET", "/v1/models", headers=B); check("models = profiles", js["data"][0]["id"] == "Qwen" and h.get("Access-Control-Allow-Origin") == "*", js)
jobs = []
st, js, _, _ = api("POST", "/shell/emit", {"event": {"type": "mark"}}); st, js, _, _ = api("GET", "/api/events?after=0", timeout=5); start_seq = js["seq"]
def fake_screen():
    after = start_seq
    deadline = time.time() + 30
    while time.time() < deadline and len(jobs) < 2:
        st, js, _, _ = api("GET", f"/api/events?after={after}", timeout=40)
        after = js["seq"]
        for e in js["events"]:
            if e.get("type") == "job":
                jobs.append(e["req"])
                api("POST", "/api/jobs/done", {"id": e["id"], "result": {"reply": "hello back", "thinking": "hm", "chat": e["req"]["chat"] if e["req"]["chat"] != "new" else "api/new.md", "sent": e["req"]["prompt"], "source": {"site": "qwen"}}})
scr = threading.Thread(target=fake_screen); scr.start(); time.sleep(0.3)
msgs = [{"role": "system", "content": "be nice"}, {"role": "user", "content": "first"}, {"role": "assistant", "content": "ok"}, {"role": "user", "content": "second"}]
st, js, _, _ = call("POST", "/v1/chat/completions", {"model": "qwen", "messages": msgs}, B)
check("new chat: whole history flattened", st == 200 and jobs[0]["prompt"].startswith("### System\nbe nice") and jobs[0]["chat"] == "new" and jobs[0]["profile"] == "Qwen", jobs[:1])
check("reply + thinking + report", js["choices"][0]["message"]["content"] == "hello back" and js["choices"][0]["message"]["reasoning_content"] == "hm" and js["promptpipe"]["chat"] == "api/new.md" and js["promptpipe"]["sent"].endswith("second"), js)
st, raw_js, raw, _ = call("POST", "/v1/chat/completions", {"model": "Qwen", "chat": "api/new.md", "stream": True, "messages": msgs}, B)
check("chat field: only the last user message, continues that chat", jobs[1]["prompt"] == "second" and jobs[1]["chat"] == "api/new.md", jobs[1:])
check("stream: one chunk then DONE", raw.count("data: ") == 3 and raw.strip().endswith("data: [DONE]") and '"promptpipe"' in raw, raw)
st, js, _, _ = call("POST", "/v1/chat/completions", {"chat": "../x.md", "messages": msgs}, B); check("bad chat path refused", st == 400)
st, js, _, _ = api("POST", "/api/v1/chat", {"prompt": "x"}); check("simple API gone, points to /v1", st == 404 and "/v1" in js["error"])
scr.join(timeout=5)

proc.terminate()
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
