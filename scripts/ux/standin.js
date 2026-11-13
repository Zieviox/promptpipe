// A stand-in for the promptpipe core, for looking at the app screen in a desktop browser.
// It serves the app's own UI files and answers the same routes with simple, in-memory
// behaviour. The AI site is faked: "send" reports progress and returns a canned reply.
// Not the real core: storage, git and the page bridge are simulated. Use the real core
// (odin build core) when Odin is installed; this is for a machine without it.
//
//   node scripts/ux/standin.js          then open http://127.0.0.1:7790 (or run driver.js)
//
// PP_PLUGINS=<folder>: a checkout of promptpipe-plugins (default: ../promptpipe-plugins, next
// to this repo). With it, the app parts are the newer ones from there and "Get plugins"
// installs from it. Without it, the parts are the ones this repo ships.
// PP_PORT=<port>: default 7790. Each start begins from a first launch (build/ux-data is emptied).
// The fake site answers every message with one reply (list, table, code, link, thinking).
// A message with "fail" in it is not sent, "slow" takes 22 s, "short" gets a one-word reply.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const APP = path.join(ROOT, "app/src/main/assets");
const REPO = process.env.PP_PLUGINS || path.join(ROOT, "../promptpipe-plugins");
const DATA = path.join(ROOT, "build/ux-data");
const PORT = +process.env.PP_PORT || 7790;
const PARTS = ["chat-ui", "core-chatfile", "core-history", "core-jobs", "core-markdown", "core-pipeline", "core-send"];
fs.rmSync(DATA, { recursive: true, force: true });
for (const d of ["history", "plugins", "export"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });

const MIME = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", md: "text/markdown", svg: "image/svg+xml", png: "image/png" };
const safe = (rel) => !!rel && !rel.startsWith("/") && rel.split("/").every((p) => p && p !== "." && p !== "..");
// The newest app parts are the ones in the plugins repo (what an updated phone runs).
const pluginDir = (id, builtinOnly) => {
  const user = path.join(DATA, "plugins", id);
  if (!builtinOnly && fs.existsSync(path.join(user, "plugin.json"))) return { dir: user, source: "user" };
  if (PARTS.includes(id) && fs.existsSync(path.join(REPO, id, "plugin.json"))) return { dir: path.join(REPO, id), source: "builtin" };
  return { dir: path.join(APP, "plugins", id), source: "builtin" };
};
const listPlugins = (builtinOnly) => {
  const ids = new Set([...fs.readdirSync(path.join(APP, "plugins")), ...PARTS, ...(builtinOnly ? [] : fs.readdirSync(path.join(DATA, "plugins")))]);
  const out = [];
  for (const id of [...ids].sort()) {
    const { dir, source } = pluginDir(id, builtinOnly);
    try {
      out.push({ id, source, manifest: JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8")) });
    } catch (e) {}
  }
  return out;
};

let config = {};
let seq = 0;
const events = [];
const waiters = [];
const emit = (ev) => {
  events.push({ seq: ++seq, ...ev });
  if (events.length > 200) events.shift();
  for (const w of waiters.splice(0)) w();
};
const pages = [{ page: 0, connected: false, url: "", title: "" }];
const actions = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const walk = (base, rel = "", out = []) => {
  for (const name of fs.readdirSync(path.join(base, rel)).sort()) {
    if (name.startsWith(".")) continue;
    const r = rel ? rel + "/" + name : name;
    const st = fs.statSync(path.join(base, r));
    out.push({ rel: r, dir: st.isDirectory(), mtime: Math.round(st.mtimeMs) });
    if (st.isDirectory()) walk(base, r, out);
  }
  return out;
};
const HIST = path.join(DATA, "history");

const REPLY = `Here is a short plan for the week.

## Monday to Wednesday

1. Draft the outline
2. Write the first two sections
   - keep each under 300 words
   - one example per section
3. Send it to a reader

| Day | Task | Time |
| --- | --- | --- |
| Mon | Outline | 1 h |
| Tue | Sections 1 and 2 | 3 h |
| Wed | Review | 30 min |

\`\`\`python
def words(text):
    return len(text.split())
\`\`\`

A longer paragraph follows so the reply has some weight to it: the point of the plan is to keep each day small enough that it is finished, with **one** clear thing to hand over at the end, and a link to check: https://example.com/a/very/long/path/that/might/need/to/wrap/on/a/narrow/phone/screen?with=query&and=more`;
const THINK = "The user wants a plan. Keep it short.\n\nThree days, one task each, a table for the times and a small code sample.";

const site = async (b) => {
  const pg = pages[b.page || 0] || pages[0];
  const info = { url: pg.url, title: pg.title, model: "Stand-in 1.0", input: true, page: pg.page };
  switch (b.cmd) {
    case "send":
    case "follow": {
      if (/fail/i.test(b.text || "")) {
        await sleep(1500);
        throw new Error("chat input box not found on the page after 15s (tap the site name to look; it shows a Log in button)");
      }
      const slow = /slow/i.test(b.text || "");
      for (let i = 1; i <= 4; i++) {
        await sleep(slow ? 2500 : 500);
        const th = THINK.slice(0, (THINK.length * i) / 4);
        emit({ type: "site", event: "progress", page: pg.page, connected: true, text: `thinking… ${th.length} chars`, live: { thinking: th } });
      }
      for (let i = 1; i <= 5; i++) {
        await sleep(slow ? 2500 : 500);
        const r = REPLY.slice(0, (REPLY.length * i) / 5);
        emit({ type: "site", event: "progress", page: pg.page, connected: true, text: `writing… ${r.length} chars`, live: { thinking: THINK, reply: r } });
      }
      if (!/\/c\//.test(pg.url)) pg.url = (pg.url || "https://chat.example.com/").replace(/\/$/, "") + "/c/" + Math.random().toString(36).slice(2, 8);
      return { ...info, url: pg.url, raw: /short/i.test(b.text || "") ? "Done." : REPLY, thinking: THINK, you: b.text || "" };
    }
    case "models": return { ...info, models: ["Stand-in 1.0", "Stand-in Max", "Stand-in Flash"], switches: (b.site?.switches || []).map((s) => ({ name: s.name, found: true, on: false })) };
    case "setModel": return { ...info, model: b.model, switches: [] };
    case "setSwitch": return { ...info, switches: [] };
    case "list": return { ...info, chats: [{ url: "https://chat.example.com/c/abc", title: "An older site chat" }] };
    case "last": return { ...info, raw: REPLY, thinking: THINK };
    case "history": return { ...info, turns: [{ you: "Hello", reply: "Hi there.", thinking: "" }] };
    case "cancel": return {};
    default: return info;
  }
};

const api = async (p, q, body, method) => {
  const post = method === "POST";
  switch (p) {
    case "/api/app": return { storage: DATA, coreVersion: "stand-in", port: PORT, gitToken: false, apiToken: true, apiTokenValue: "0123456789abcdef0123456789abcdef0123456789abcdef", ui: true, shell: true, platform: "android", modules: ["git", "clipboard", "vibration", "share"], missing: {}, version: "0.7.0-alpha31", allFiles: true, site: pages[0], pages };
    case "/api/app/action": actions.push(body); return { ok: true };
    case "/api/secret": return { ok: true };
    case "/api/config": if (post) { config = body; return { ok: true }; } return config;
    case "/api/events": {
      const after = +q.get("after") || 0;
      if (seq <= after) await Promise.race([new Promise((r) => waiters.push(r)), sleep(25000)]);
      return { seq, events: events.filter((e) => e.seq > after) };
    }
    case "/api/plugins": return { plugins: listPlugins(q.get("builtin") === "1"), folder: path.join(DATA, "plugins") };
    case "/api/plugins/bundle": return {};
    case "/api/plugins/update": return { version: "0.7.0-alpha31", upToDate: true };
    case "/api/plugins/install": {
      const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)\/plugin\.json$/.exec(body.url || "");
      if (!m || !safe(m[1]) || !fs.existsSync(path.join(REPO, m[1], "plugin.json"))) throw new Error("the stand-in only installs from the local plugins repo");
      const id = JSON.parse(fs.readFileSync(path.join(REPO, m[1], "plugin.json"), "utf8")).id;
      fs.cpSync(path.join(REPO, m[1]), path.join(DATA, "plugins", id), { recursive: true });
      return { id };
    }
    case "/api/plugins/remove": fs.rmSync(path.join(DATA, "plugins", path.basename(body.id || "x")), { recursive: true, force: true }); return { ok: true };
    case "/api/plugins/fork": {
      const id = path.basename(body.id || "x");
      const dest = path.join(DATA, "plugins", id);
      if (fs.existsSync(dest)) throw new Error(`plugins/${id} already exists`);
      fs.cpSync(pluginDir(id, true).dir, dest, { recursive: true });
      return { path: dest };
    }
    case "/api/plugins/rollback": throw new Error("there is no earlier version of this plugin to go back to");
    case "/api/fetch": {
      const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/.exec(body.url || "");
      if (m && safe(m[1]) && fs.existsSync(path.join(REPO, m[1]))) return { status: 200, url: body.url, base64: fs.readFileSync(path.join(REPO, m[1])).toString("base64") };
      return { status: 404, url: body.url, base64: "" };
    }
    case "/api/export": fs.writeFileSync(path.join(DATA, "export", path.basename(body.name)), body.text || ""); return { path: path.join(DATA, "export", path.basename(body.name)) };
    case "/api/storage/check": return { path: HIST, steps: [{ name: "make a folder", ok: true, why: "" }, { name: "write a file in it", ok: true, why: "" }, { name: "write a file beside the chats", ok: true, why: "" }] };
    case "/api/storage/folder": return post ? { path: HIST, copied: 0 } : { path: HIST, default: HIST, custom: false, chats: walk(HIST).filter((e) => e.rel.endsWith(".md")).length };
    case "/api/storage/count": return { chats: 0, exists: false };
    case "/api/storage/copy": return { copied: 0 };
    case "/api/storage/dirs": return { path: q.get("path") || "/", parent: "/", dirs: ["Documents", "Download", "PromptPipe"] };
    case "/api/site": return site(body);
    case "/api/site/open": {
      const pg = pages[body.page || 0] || pages[0];
      await sleep(600);
      Object.assign(pg, { connected: true, url: body.url, title: "Stand-in chat" });
      emit({ type: "site", page: pg.page, connected: true, url: pg.url, title: pg.title });
      return { url: pg.url, title: pg.title, page: pg.page };
    }
    case "/api/site/pages":
      if (body.count) { while (pages.length < body.count) pages.push({ page: pages.length, connected: false, url: "", title: "" }); pages.length = Math.max(1, body.count); }
      return { pages, max: 10 };
    case "/api/history/tree": {
      const all = walk(HIST);
      return { files: all.filter((e) => !e.dir && e.rel.endsWith(".md")).map((e) => ({ path: e.rel, head: fs.readFileSync(path.join(HIST, e.rel), "utf8").slice(0, 1500), mtime: e.mtime })), folders: all.filter((e) => e.dir).map((e) => e.rel), root: HIST };
    }
    case "/api/history/all": return { files: walk(HIST).filter((e) => !e.dir && e.rel.endsWith(".md")).map((e) => ({ path: e.rel, text: fs.readFileSync(path.join(HIST, e.rel), "utf8"), mtime: e.mtime })) };
    case "/api/history/file": {
      const rel = q.get("path") || "";
      if (!safe(rel)) throw new Error("bad path");
      const f = path.join(HIST, rel);
      return { path: rel, text: fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null };
    }
    case "/api/history/save": {
      for (const d of body.mkdir || []) if (safe(d)) fs.mkdirSync(path.join(HIST, d), { recursive: true });
      for (const m of body.moves || []) {
        if (!safe(m.from) || !safe(m.to)) throw new Error("bad move path");
        if (fs.existsSync(path.join(HIST, m.to))) throw new Error(m.to + " already exists");
        fs.mkdirSync(path.dirname(path.join(HIST, m.to)), { recursive: true });
        fs.renameSync(path.join(HIST, m.from), path.join(HIST, m.to));
      }
      for (const f of body.files || []) {
        if (!safe(f.path)) throw new Error(`bad file path '${f.path}'`);
        fs.mkdirSync(path.dirname(path.join(HIST, f.path)), { recursive: true });
        fs.writeFileSync(path.join(HIST, f.path), f.text || "");
      }
      for (const d of body.delete || []) if (safe(d)) fs.rmSync(path.join(HIST, d), { recursive: true, force: true });
      return { ok: true, commit: "abc1234" };
    }
    case "/api/log": return { path: path.join(DATA, "logs/core.log"), exists: true, text: "12:00:00 core: stand-in\n" };
    case "/api/git/log": return { result: [{ id: "abc1234", message: "chat: Plan (#1)", time: Date.now() - 60000 }] };
    case "/api/git/push": case "/api/git/pull": throw new Error("set a remote URL first (Git sheet)");
    case "/api/module":
      if (body.module === "clipboard" && body.call === "paste") return { result: { text: "pasted text" } };
      return { result: { ok: true } };
    case "/api/jobs/done": return { ok: true };
  }
  const e = new Error("unknown " + p);
  e.status = 404;
  throw e;
};

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const p = decodeURIComponent(u.pathname);
    const file = (f) => {
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end("not found");
      res.writeHead(200, { "Content-Type": (MIME[f.split(".").pop()] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(f));
    };
    if (p === "/") return file(path.join(APP, "ui/index.html"));
    if (p === "/__actions") return res.end(JSON.stringify(actions));
    if (p.startsWith("/ui/") || p.startsWith("/docs/")) return safe(p.slice(1)) ? file(path.join(APP, p.slice(1))) : res.writeHead(404).end();
    const pm = /^\/(plugins|builtin)\/([\w.-]+)\/(.+)$/.exec(p);
    if (pm) return safe(pm[3]) ? file(path.join(pluginDir(pm[2], pm[1] === "builtin" || u.searchParams.get("builtin") === "1").dir, pm[3])) : res.writeHead(404).end();
    let raw = "";
    for await (const c of req) raw += c;
    try {
      const out = await api(p, u.searchParams, raw ? JSON.parse(raw) : {}, req.method);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(e.status || 502, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log("stand-in on http://127.0.0.1:" + PORT));
