#!/usr/bin/env python3
"""Route checks for the core. Starts it on a free port in a temp folder.
Usage: python3 core/test_core.py <path to ppcore binary>"""
import base64, io, zipfile, json, os, socket, subprocess, sys, tempfile, threading, time, http.client

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
st, js, _, _ = api("POST", "/api/history/save", {"mkdir": ["a/one.md/sub"]}); check("mkdir under a file says why", st == 400 and "could not make the folder a/one.md/sub" in js.get("error", ""), js)
st, js, _, _ = api("POST", "/api/history/save", {"files": [{"path": "a/one.md/x.md", "text": "x"}]}); check("a failed write says why", st == 400 and "could not write a/one.md/x.md (" in js.get("error", ""), js)
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

print("storage check")
st, js, _, _ = api("GET", "/api/storage/check"); check("storage check passes on a normal folder", st == 200 and all(x["ok"] for x in js["steps"]) and len(js["steps"]) == 3, js)
check("storage check leaves nothing behind", not os.path.exists(tmp + "/data/history/.pp-check") and not os.path.exists(tmp + "/data/history/.pp-check.txt"))
print("chats folder")
st, js, _, _ = api("GET", "/api/storage/folder"); check("folder: default", st == 200 and not js["custom"] and js["path"].endswith("/data/history"), js)
other = tmp + "/elsewhere/chats"
open(tmp + "/data/history/note.md", "w").write("x")
st, js, _, _ = api("POST", "/api/storage/folder", {"path": other, "copy": True}); check("folder: choose and copy", st == 200 and js["copied"] >= 1 and os.path.exists(other + "/note.md"), js)
st, js, _, _ = api("GET", "/api/storage/folder"); check("folder: custom now", js["custom"] and js["path"] == other, js)
check("folder: choice kept in the private folder", open(tmp + "/priv/history-folder").read().strip() == other)
st, js, _, _ = api("POST", "/api/history/save", {"files": [{"path": "a/b.md", "text": "hi"}], "message": "t"}); check("folder: saving goes to the new folder", st == 200 and os.path.exists(other + "/a/b.md"), js)
st, js, _, _ = api("GET", "/api/storage/dirs?path=" + tmp + "/elsewhere"); check("dirs lists folders", js["dirs"] == ["chats"] and js["parent"] == tmp, js)
st, js, _, _ = api("GET", "/api/storage/count?path=" + other); check("count chats in a folder", js["chats"] >= 1 and js["exists"], js)
st, js, _, _ = api("GET", "/api/storage/count?path=/nope/none"); check("count of a missing folder is 0", js["chats"] == 0 and not js["exists"], js)
old = tmp + "/oldchats"; os.makedirs(old + "/.git"); os.makedirs(old + "/sub")
open(old + "/one.md", "w").write("one"); open(old + "/sub/two.md", "w").write("two"); open(old + "/.git/HEAD", "w").write("g")
open(other + "/one.md", "w").write("mine")
st, js, _, _ = api("POST", "/api/storage/copy", {"from": old}); check("copy: adds only chats it doesn't have", st == 200 and js["copied"] == 1 and open(other + "/one.md").read() == "mine" and os.path.exists(other + "/sub/two.md") and not os.path.exists(other + "/.git/HEAD"), js)
st, js, _, _ = api("POST", "/api/storage/copy", {"from": other}); check("copy: the folder in use is refused", st == 400, js)
st, js, _, _ = api("POST", "/api/storage/copy", {"from": "/nope/none"}); check("copy: a missing folder is refused", st == 400, js)
st, js, _, _ = api("POST", "/api/storage/folder", {"path": "relative/x"}); check("folder: relative path refused", st == 400, js)
st, js, _, _ = api("POST", "/api/storage/folder", {"path": tmp + "/data/plugins/x"}); check("folder: app's own refused", st == 400, js)
st, js, _, _ = api("POST", "/api/storage/folder", {"path": ""}); check("folder: back to default", st == 200 and js["path"].endswith("/data/history") and not os.path.exists(tmp + "/priv/history-folder"), js)
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
st, js, _, _ = api("POST", "/api/export", {"name": "story.profile.json", "text": "{\"a\":1}"}); check("export saves a file under export/", st == 200 and open(tmp + "/data/export/story.profile.json").read() == '{"a":1}', js)
st, js, _, _ = api("POST", "/api/export", {"name": "../evil.json", "text": "x"}); check("export refuses a path in the name", st == 400, js)
st, js, _, _ = api("POST", "/api/plugins/fork", {"id": "demo"}); check("fork again", st == 200)
st, js, _, _ = api("GET", "/api/plugins"); check("user copy wins", js["plugins"][0]["source"] == "user" and js["plugins"][0].get("overrides"), js)
one = zipb({"x/plugin.json": '{"id":"../bad"}'})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "x.zip", "base64": base64.b64encode(one).decode()}); check("bad id refused", st == 400, js)
one = zipb({"mine/plugin.json": '{"id":"mine","version":"1"}', "mine/main.js": "m()"})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "m.zip", "base64": base64.b64encode(one).decode()}); check("plugin zip installs", js.get("id") == "mine" and os.path.exists(tmp + "/data/plugins/mine/main.js"), js)
one2 = zipb({"mine/plugin.json": '{"id":"mine","version":"2"}', "mine/main.js": "m2()"})
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "m.zip", "base64": base64.b64encode(one2).decode()})
st, js, _, _ = api("GET", "/api/plugins"); mine2 = {p["id"]: p for p in js["plugins"]}["mine"]; check("install keeps the replaced version", mine2["manifest"]["version"] == "2" and mine2.get("previous") == "1", mine2)
st, js, _, _ = api("POST", "/api/plugins/rollback", {"id": "mine"}); check("rollback goes back", st == 200 and js["version"] == "1" and open(tmp + "/data/plugins/mine/main.js").read() == "m()", js)
st, js, _, _ = api("GET", "/api/plugins"); mine3 = {p["id"]: p for p in js["plugins"]}["mine"]; check("rollback keeps the newer to go forward", mine3.get("previous") == "2", mine3)
st, js, _, _ = api("POST", "/api/plugins/rollback", {"id": "nope"}); check("rollback refuses when there is nothing earlier", st == 400, js)
st, js, _, _ = api("POST", "/api/plugins/remove", {"id": "mine"}); check("remove drops the earlier copy too", st == 200 and not os.path.exists(tmp + "/data/plugins-previous/mine"), js)
st, js, _, _ = api("POST", "/api/plugins/install", {"name": "m.zip", "base64": base64.b64encode(one).decode()})
st, js, _, _ = api("POST", "/api/plugins/install", {"files": {"plugin.json": '{"id":"typed","version":"1"}', "main.js": "t()"}}); check("plugin from its files", js.get("id") == "typed" and open(tmp + "/data/plugins/typed/main.js").read() == "t()", js)
st, js, _, _ = api("POST", "/api/plugins/install", {"files": {"main.js": "t()"}}); check("files without plugin.json refused", st == 400, js)
st, js, _, _ = api("POST", "/api/plugins/install", {"files": {"plugin.json": '{"id":"typed2","version":"1"}', "../x.js": "t()"}}); check("files with a bad path refused", st == 400 and not os.path.exists(tmp + "/data/plugins/typed2"), js)
st, js, _, _ = api("POST", "/api/plugins/install", {"url": "https://example.com/p/plugin.json"}); check("install by link needs the shell's fetch", st == 400 and "shell" in js["error"], js)

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

# Android lets an app make folders but not open the ones above its own (/data, /storage):
# new folders must not depend on opening them. Needs root + setpriv to act as another user.
import shutil
if os.geteuid() == 0 and shutil.which("setpriv"):
    print("folders under folders the app can't open")
    top = tempfile.mkdtemp(prefix="ppandroid-")
    for d in (top, top + "/a"): os.makedirs(d, exist_ok=True); os.chmod(d, 0o711)
    for d in (top + "/a/data", top + "/a/priv"): os.makedirs(d, exist_ok=True); shutil.chown(d, 65534, 65534)
    sock = socket.socket(); sock.bind(("127.0.0.1", 0)); P2 = sock.getsockname()[1]; sock.close()
    os.chmod(BIN, 0o755)
    p2 = subprocess.Popen(["setpriv", "--reuid=65534", "--regid=65534", "--clear-groups", BIN, "--data", top + "/a/data", "--private", top + "/a/priv", "--assets", assets, "--port", str(P2)],
                          env={**os.environ, "PP_KEY": KEY}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: socket.create_connection(("127.0.0.1", P2), 0.1).close(); break
        except OSError: time.sleep(0.1)
    def call2(path, body):
        c = http.client.HTTPConnection("127.0.0.1", P2, timeout=20)
        c.request("POST", path, body=json.dumps(body), headers={"Host": f"127.0.0.1:{P2}", "X-PP-Key": KEY, "Content-Type": "application/json"})
        r = c.getresponse(); return r.status, json.loads(r.read().decode())
    st, js = call2("/api/plugins/install", {"files": {"plugin.json": '{"id":"t1","version":"1"}'}}); check("plugin folder made under a folder the app can't open", st == 200 and os.path.exists(top + "/a/data/plugins/t1/plugin.json"), js)
    st, js = call2("/api/history/save", {"mkdir": ["x/y"], "message": "t"}); check("chat folder made likewise", st == 200 and os.path.isdir(top + "/a/data/history/x/y"), js)
    p2.terminate()

proc.terminate()
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
