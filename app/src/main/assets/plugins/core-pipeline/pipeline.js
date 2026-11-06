"use strict";
// App part: the pipeline. A profile uses a preset: an ordered list of rows.
//   piece    text of yours (rules, a character, notes); "when" says which messages get it
//   step     a plugin. It changes everything above it (or only your message),
//            or, if it gives a piece() (Memory), puts its text where its row is
//   message  where your message goes
// A row can sit in a group: the group's switch turns all its rows on or off.
// Presets are shared by profiles: S.config.presets, prof.preset = a preset id.
// Plugin settings stay per profile (settingsFor); which steps run is the preset's.

const WHEN = { every: "Every message", first: "First message of a site chat", everyN: "Every N messages", off: "Off" };
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const JOIN = "\n\n";

// ---------- rows ----------
const piece = (name, text, when = "every", extra = {}) => ({ type: "piece", id: newId("pc"), name, text, when, n: 5, group: "", on: true, ...extra });
const step = (plugin, on = true, scope = "above") => ({ type: "step", plugin, on, scope, group: "" });
const messageRow = () => ({ type: "message" });

// A plugin is a pipeline step if it does something with messages.
const HOOKS = ["beforeSend", "afterReply", "piece", "route", "renderTurn"];
const isPipeStep = (p) => isStep(p) && !!p.def && HOOKS.some((k) => typeof p.def[k] === "function");
const changesText = (p) => !!p?.def && (typeof p.def.piece === "function" || typeof p.def.beforeSend === "function");

// ---------- starter presets ----------
const STARTERS = () => [
  {
    id: "plain",
    name: "Plain",
    groups: [],
    rows: [messageRow()],
  },
  {
    id: "rp",
    name: "RP",
    groups: [],
    rows: [
      piece(
        "Role-play rules",
        "Let's role-play. You play the world and every character except mine; I play my character. Stay in character. Never write my character's actions, words or thoughts. Keep each reply to a few paragraphs and stop where my character can act. Show, don't tell. Don't summarise what happens next and don't ask me what I want.",
        "first",
      ),
      piece("Characters and setting", "", "first"),
      step("memory"),
      messageRow(),
      piece("Reminder", "(Stay in character, and don't write for my character.)", "everyN", { n: 5 }),
    ],
  },
  {
    id: "feedback",
    name: "Writing feedback",
    groups: [],
    rows: [
      piece(
        "Editor",
        "You are an honest, specific editor. For the text I send, say what works and what doesn't: quote the exact lines you mean and say why. Look at clarity, pacing, voice, dialogue and consistency. Don't rewrite my text unless I ask; suggest, don't replace. Be direct, and skip praise that says nothing.",
      ),
      messageRow(),
    ],
  },
  {
    id: "story",
    name: "Story writing",
    groups: [],
    rows: [
      piece(
        "Co-writer",
        "We're writing a story together. Follow my outline and notes, and keep names, facts and tone consistent. Write in the tense and point of view I use. When I ask for a scene, write only that scene and stop.",
        "first",
      ),
      piece("Story notes", "", "first"),
      step("memory"),
      messageRow(),
    ],
  },
];

// ---------- lookups (pure on the config) ----------
const presets = () => (S.config.presets = S.config.presets || []);
const presetOf = (prof = profile()) => presets().find((p) => p.id === prof.preset) || presets()[0] || null;
const groupOf = (pre, row) => (row.group ? (pre.groups || []).find((g) => g.id === row.group) : null);
const rowLive = (pre, row) => row.on !== false && groupOf(pre, row)?.on !== false;
const stepRowOf = (pre, id) => pre?.rows.find((r) => r.type === "step" && r.plugin === id) || null;
const rowName = (r) => (r.type === "message" ? "Your message" : r.type === "step" ? pluginName(r.plugin) : r.name || (r.text || "").trim().split("\n")[0].slice(0, 40) || "(empty piece)");
const whenLabel = (r) => (r.when === "everyN" ? `Every ${Math.max(1, +r.n || 1)} messages` : WHEN[r.when] || WHEN.every);

// Does this piece go with this message? count = the message's number in the chat.
const pieceGoes = (r, ctx, count) => {
  if (r.when === "off") return false;
  if (r.when === "first") return !!ctx.firstMessage;
  if (r.when === "everyN") return !!ctx.firstMessage || count % Math.max(1, Math.round(+r.n || 1)) === 0;
  return true;
};

// ---------- the parts the rest of the app calls ----------
activePlugins = (prof = profile()) => {
  const pre = presetOf(prof);
  if (!pre) return [];
  return pre.rows.filter((r) => r.type === "step" && rowLive(pre, r) && S.plugins.get(r.plugin)?.def).map((r) => entryFor(r.plugin, prof));
};
stepOn = (id, prof = profile()) => {
  const pre = presetOf(prof);
  const r = stepRowOf(pre, id);
  return !!r && rowLive(pre, r);
};
setStepOn = (id, on, prof = profile()) => {
  const pre = presetOf(prof);
  if (!pre) return;
  let r = stepRowOf(pre, id);
  if (!r) pre.rows.push((r = step(id, on)));
  r.on = on;
  const g = groupOf(pre, r);
  if (on && g && g.on === false) toast(`${pluginName(id)} is on, but its group “${g.name}” is off`);
  saveConfig();
};

// Walk the rows top to bottom. Pieces add their text, "Your message" adds the
// message, a step changes what is above it (or only the message), a step with
// piece() adds its own text there.
buildMessage = async (prompt, ctx, trace, prof = profile()) => {
  const pre = presetOf(prof);
  if (!pre) return prompt;
  const count = ctx.chat ? ctx.chat.turns.length : 1;
  let msg = prompt;
  let parts = []; // strings, or MSG where the message goes
  const MSG = {};
  const joined = () => parts.map((x) => (x === MSG ? msg : x)).filter((x) => x.trim()).join(JOIN);
  const sent = [];
  for (const r of pre.rows) {
    if (r.type === "message") {
      parts.push(MSG);
      continue;
    }
    if (!rowLive(pre, r)) continue;
    if (r.type === "piece") {
      const text = (r.text || "").trim();
      if (!text || !pieceGoes(r, ctx, count)) continue;
      parts.push(text);
      sent.push(rowName(r));
      trace.push({ label: "Piece · " + rowName(r), text, notes: [] });
      continue;
    }
    const p = S.plugins.get(r.plugin);
    if (!p?.def) continue;
    const notes = [];
    const hctx = hookCtx(r.plugin, ctx, prof, notes);
    let out = null;
    if (typeof p.def.piece === "function") {
      const text = await p.def.piece({ ...hctx, message: msg });
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
      out = text || "(nothing)";
    } else if (typeof p.def.beforeSend === "function") {
      if (r.scope === "message") {
        const t = await p.def.beforeSend(msg, hctx);
        if (typeof t === "string") msg = t;
        out = msg;
      } else {
        const t = await p.def.beforeSend(joined(), hctx);
        if (typeof t === "string") parts = [t];
        out = joined();
      }
    } else continue;
    trace.push({ label: `${pluginName(r.plugin)} · before`, text: out, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(r.plugin)}: ${n}`));
  }
  if (sent.length) ctx.notes.push(`${pre.name}: ${sent.join(", ")}`);
  return joined() || msg;
};

// What would go out, without running anything: steps show as a marker.
const previewMessage = (prof = profile(), opts = {}) => {
  const pre = presetOf(prof);
  if (!pre) return "";
  const ctx = { firstMessage: opts.first !== false };
  const count = opts.count || 1;
  const out = [];
  for (const r of pre.rows) {
    if (r.type === "message") out.push("⟨your message⟩");
    else if (!rowLive(pre, r)) continue;
    else if (r.type === "piece") {
      if ((r.text || "").trim() && pieceGoes(r, ctx, count)) out.push(r.text.trim());
    } else if (changesText(S.plugins.get(r.plugin))) {
      const p = S.plugins.get(r.plugin);
      out.push(typeof p.def.piece === "function" ? `⟨${pluginName(r.plugin)} adds its text here⟩` : `⟨${pluginName(r.plugin)} changes ${r.scope === "message" ? "your message" : "everything above"}⟩`);
    }
  }
  return out.join(JOIN);
};

// ---------- presets: edit (each saves) ----------
const usePreset = (id, prof = profile()) => {
  prof.preset = id;
  saveConfig();
};
const addPreset = (name, from = null) => {
  const pre = from ? JSON.parse(JSON.stringify(from)) : { groups: [], rows: [messageRow()] };
  pre.id = newId("ps");
  pre.name = name;
  for (const r of pre.rows) if (r.type === "piece") r.id = newId("pc");
  syncRows(pre);
  presets().push(pre);
  saveConfig();
  return pre;
};
const removePreset = (pre) => {
  const list = presets();
  if (list.length < 2) return toast("Keep at least one preset", "error");
  list.splice(list.indexOf(pre), 1);
  for (const prof of S.config.profiles) if (prof.preset === pre.id) prof.preset = list[0].id;
  saveConfig();
};
const moveRow = (pre, i, d) => {
  const j = i + d;
  if (j < 0 || j >= pre.rows.length) return;
  [pre.rows[i], pre.rows[j]] = [pre.rows[j], pre.rows[i]];
  saveConfig();
};
const addGroup = (pre, name) => {
  const g = { id: newId("g"), name, on: true };
  (pre.groups = pre.groups || []).push(g);
  saveConfig();
  return g;
};
const removeGroup = (pre, g) => {
  pre.groups = pre.groups.filter((x) => x !== g);
  for (const r of pre.rows) if (r.group === g.id) r.group = "";
  saveConfig();
};

// ---------- set up and keep in step ----------
// Every installed step plugin has a row in every preset (new ones come in
// switched off, at the end); the message row is always there.
const syncRows = (pre) => {
  pre.groups = pre.groups || [];
  if (!pre.rows.some((r) => r.type === "message")) pre.rows.push(messageRow());
  for (const p of S.plugins.values()) if (isPipeStep(p) && !stepRowOf(pre, p.id)) pre.rows.push(step(p.id, false, p.id === "base64" ? "message" : "above"));
};

// The system prompt library (history/system-prompts.json), for migration and "Add from library".
const promptLibrary = async () => {
  try {
    const r = await api("/api/history/file?path=system-prompts.json");
    return (r.text && JSON.parse(r.text).prompts) || [];
  } catch (e) {
    return [];
  }
};

// A profile from before presets: its plugin order and switches (and the
// system prompt stack, as a piece) become a preset of its own. Nothing on and
// nothing stacked: it takes Plain.
const migrateProfile = (prof, lib) => {
  const top = []; // rows that went in front of the message; the later plugin's text came first
  const below = [];
  let anyOn = false;
  for (const e of prof.plugins) {
    const p = S.plugins.get(e.id);
    if (!p || !isPipeStep(p)) continue;
    anyOn = anyOn || !!e.on;
    if (e.id === "system-prompt") {
      const s = settingsFor(e.id, prof);
      const stacked = (Array.isArray(s.stack) ? s.stack : []).map((id) => lib.find((x) => x.id === id)).filter((x) => x && (x.text || "").trim());
      const texts = stacked.map((x) => x.text.trim());
      if ((s.prompt || "").trim() && !texts.length) texts.push(s.prompt.trim());
      const name = stacked.map((x) => x.name || x.text.trim().split("\n")[0].slice(0, 30)).join(" + ") || "Your system prompt";
      if (!texts.length) continue;
      anyOn = true;
      const body = (s.wrap || "{prompt}\n\n{message}").replace("{prompt}", texts.join((s.joiner || "\n\n").replace(/\\n/g, "\n"))).replace(/\s*\{message\}\s*/, "").trim();
      top.unshift(piece(name, body, s.when === "every" ? "every" : "first", { on: !!e.on }));
    } else if (typeof p.def.piece === "function") top.unshift(step(e.id, !!e.on));
    else below.push(step(e.id, !!e.on, e.id === "base64" && !top.length ? "message" : "above"));
  }
  if (!anyOn) return "plain";
  const pre = { id: newId("ps"), name: prof.name, groups: [], rows: [...top, messageRow(), ...below] };
  syncRows(pre);
  presets().push(pre);
  return pre.id;
};

const setUp = async () => {
  const fresh = !S.config.presets;
  if (fresh) S.config.presets = STARTERS();
  const lib = S.config.profiles.some((p) => !p.preset) ? await promptLibrary() : [];
  for (const prof of S.config.profiles) {
    if (!prof.preset || !presets().some((p) => p.id === prof.preset)) prof.preset = prof.preset ? presets()[0].id : migrateProfile(prof, lib);
  }
  for (const pre of presets()) syncRows(pre);
  if (fresh) saveConfig();
};
on("plugins", setUp, null);

// Shared with the UI part and plugins.
PP.pipeline = { WHEN, presets, presetOf, rowLive, rowName, whenLabel, previewMessage, piece, promptLibrary, usePreset, addPreset, removePreset, moveRow, addGroup, removeGroup };
