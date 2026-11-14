"use strict";
// App part: the pipeline. A profile uses a preset: an ordered list of rows.
//   piece    text of yours (rules, a character, notes); "when" says which messages get it
//   step     a plugin. It changes everything above it (or only your message),
//            or, if it gives a piece() (Memory), puts its text where its row is
//   message  where your message goes
// A row can sit in a group: the group's switch turns all its rows on or off.
// A profile owns its rows: prof.pipe = { groups, rows }. S.config.presets are the
// starters (Dialogue & Role play, Story & Prose ...) a profile can be made from; changing a profile
// never changes a starter or another profile.
// Plugin settings stay per profile (settingsFor); which steps run is the profile's.

const WHEN = { every: "Every message", first: "First message of a site chat", everyN: "Every N messages", depth: "At depth N (N messages up in the earlier chat)", off: "Off" };
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const JOIN = "\n\n";

// ---------- rows ----------
const piece = (name, text, when = "every", extra = {}) => ({ type: "piece", id: newId("pc"), name, text, when, n: 5, group: "", on: true, ...extra });
const step = (plugin, on = true, scope = "above") => ({ type: "step", plugin, on, scope, group: "" });
// One of a plugin's pieces (def.pieces[part]), in a row of its own.
const partRow = (plugin, part) => ({ type: "step", plugin, part, on: true, group: "" });
const messageRow = () => ({ type: "message" });

// A plugin is a pipeline step if it does something with messages.
const HOOKS = ["beforeSend", "afterReply", "piece", "route", "renderTurn"];
const isPipeStep = (p) => isStep(p) && !!p.def && HOOKS.some((k) => typeof p.def[k] === "function");
const changesText = (p) => !!p?.def && (typeof p.def.piece === "function" || typeof p.def.beforeSend === "function");
const partOf = (r) => (r.part && S.plugins.get(r.plugin)?.def?.pieces?.[r.part]) || null;
// Every plugin piece there is: [{ plugin, part, name }].
// Every plugin that can be a row of its own (switched on or off in a profile).
const pipeSteps = () => [...S.plugins.values()].filter(isPipeStep).sort((a, b) => (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id));
const pluginPieces = () =>
  [...S.plugins.values()].filter((p) => isStep(p) && p.def?.pieces).flatMap((p) => Object.entries(p.def.pieces).map(([part, d]) => ({ plugin: p.id, part, name: `${pluginName(p.id)} · ${d.name || part}` })));

// ---------- starter presets ----------
// The text of the shipped blocks. Written and tested by Cadence (see the default prompts doc).
const DEVELOPMENT = `Get the setting provided by the user or ask for one, in case you do not receive an answer, decide on a relevant setting

output every stage of its commitment order BEFORE writing:

What the character is already doing and wants.

What they actually choose to do next.

What happens as that action unfolds.

Whether another independent decision is warranted.

Only THEN rendering the prose.

Now write the story.`;

const SCENE_RULES = `There are two ways we work, depending on what I ask.

If I play a character: you play the world and every character except mine. Stay in character, and never write my character's actions, words or thoughts. Other characters want their own things and only give way to mine when they have a reason. Keep each reply to a few paragraphs and end on something the world or another character does, at a point where my character can act. Don't summarise what happens next and don't ask me what I want.

If I ask for a scene between characters: write the whole scene as dialogue with minimal narration. Narration appears only when a concrete action changes the scene. End on the last spoken line, in medias res, mid-exchange: no closing narration, no closing question, no character leaving.`;

const DIALOGUE_CRAFT = `Echo (anadiplosis, epizeuxis): when a reply would repeat the previous speaker's words, answer the content instead.
Stichomythia: vary line length within each speaker, so nobody is always long or always short. A speaker may hold the floor for a few sentences, but in sentences of different lengths, not one run-on.
Backchannels: replace "Mm," "Right," and "Sure" with the speaker's actual reaction.
On-the-nose dialogue: move every feeling into subtext. People show feeling through what they talk about instead, what they do, and what they avoid. This includes warmth: affection and happiness show as behavior and specifics, never as announcements.
Exposition ("As you know, Bob"): a speaker says only what the listener doesn't already know.
Metadialogue: characters never comment on how the other person talks or behaves.
Sententia (aphorism): replace quotable, proverb-shaped lines with a concrete particular.
Tidy resolution: no apology, lesson, or reconciliation closes the scene.
Therapy-speak: speakers use their own register (job, age, class), never counselor phrasing.
Over-fluency: give each speaker an idiolect and natural disfluency. A nervous or guarded speaker changes what they avoid saying, not how many words they use.
Cross-purposes: each speaker pursues a private agenda and answers from it, not from the question asked.
Stock names: choose names that belong to the setting, not the first that come to mind.`;

const PROSE_CRAFT = `Filtering: write the thing perceived, not "she saw", "he felt" or "she noticed".
Stock gesture (a held breath, a tightening jaw, a smile that doesn't reach the eyes): use an action only this character would do here, or none.
Simile: at most one per scene, and only when it says what literal words can't.
Correctio ("not X, but Y"): state the Y.
Tricolon (lists of three): use as many items as the moment actually has.
Sententia and closing summary: end on an event or a spoken line, never on what the scene meant.
Sensory inventory: give the one detail that matters to the character, not a tour of the senses.
Purple prose: use the plain word unless the character would use the fancy one.`;

const PROSE_STYLE = `Write rhyme, not facts. Carry the pacing by emotion. And every sentence MUST be naturally connected to the other, and by that I mean: connect via the context and flow itself. No fragmented prose allowed.`;

const BRIDGE = `The rule about connected sentences is for narration. Spoken lines follow speech, not prose: people interrupt each other, answer sideways, and leave gaps, so spoken lines do not have to connect smoothly to each other.`;

const CO_WRITER = `We're writing a story together. Follow my outline and notes, and keep names, facts and tone consistent. Write in the tense and point of view I use. Where my notes leave something open, choose a specific detail that belongs to this story, not the first one that comes to mind. When I ask for a scene, write only that scene and stop.`;

const EDITOR = `You are an honest, specific editor. For the text I send, say what works and what doesn't: quote the exact lines you mean and say why. Lead with the one or two changes that would matter most, then smaller points. Look at clarity, pacing, voice, dialogue and consistency. If a part works, say so in a line and move on; don't invent problems. Don't rewrite my text unless I ask; suggest, don't replace. Be direct, and skip praise that says nothing.`;

// Every starter: the master system prompt first (empty, yours), the blocks that carry instructions,
// then Base64 (off), then your message. Base64 changes everything above it, so when it is
// switched on your message stays plain.
const master = () => piece("Master system prompt", "", "every");
const base64Off = () => step("base64", false, "above");
const STARTERS_SET = 2; // raise it when the shipped starters change
const STARTERS = () => [
  {
    id: "plain",
    name: "Plain",
    groups: [],
    rows: [master(), messageRow()],
  },
  {
    id: "feedback",
    name: "Writing feedback",
    groups: [],
    rows: [master(), piece("Editor", EDITOR, "every"), base64Off(), messageRow()],
  },
  {
    id: "dialogue",
    name: "Dialogue & Role play",
    groups: [],
    rows: [
      master(),
      piece("Development", DEVELOPMENT, "first"),
      piece("Scene rules", SCENE_RULES, "every"),
      piece("Dialogue craft", DIALOGUE_CRAFT, "every"),
      piece("Characters and setting", "", "first"),
      step("memory"),
      piece("Reminder", "(Stay in character, and don't write for my character.)", "everyN", { n: 5 }),
      base64Off(),
      messageRow(),
    ],
  },
  {
    id: "story",
    name: "Story & Prose",
    groups: [],
    rows: [
      master(),
      piece("Co-writer", CO_WRITER, "every"),
      piece("Development", DEVELOPMENT, "every"),
      piece("Prose style", PROSE_STYLE, "every"),
      piece("Bridge", BRIDGE, "every"),
      piece("Dialogue craft", DIALOGUE_CRAFT, "every"),
      piece("Prose craft", PROSE_CRAFT, "every"),
      piece("Story notes", "", "first"),
      step("memory"),
      base64Off(),
      messageRow(),
    ],
  },
];

// ---------- lookups (pure on the config) ----------
const presets = () => (S.config.presets = S.config.presets || []);
const clonePipe = (src) => {
  const out = JSON.parse(JSON.stringify({ groups: src.groups || [], rows: src.rows }));
  for (const r of out.rows) if (r.type === "piece") r.id = newId("pc");
  return out;
};
const presetOf = (prof = profile()) => prof.pipe || null;
const groupOf = (pre, row) => (row.group ? (pre.groups || []).find((g) => g.id === row.group) : null);
const rowLive = (pre, row) => row.on !== false && groupOf(pre, row)?.on !== false;
// ---------- a chat's own switches ----------
// Each chat keeps its own on/off for its profile's rows and groups, in its file:
// chat.meta.switches = { key: true | false }, only where it differs from the profile
// (the profile is the default a chat starts from). Every message of the chat uses them,
// including one that waits in the queue: they are read when the message is built.
const rowKey = (r) => (r.type === "piece" ? r.id : r.type === "step" ? r.plugin + (r.part ? "/" + r.part : "") : "");
const groupKey = (g) => "group/" + g.id;
const chatSwitches = (chat) => chat?.meta?.switches || {};
// The profile as this chat uses it: the same rows, with the chat's switches applied.
forChat = (prof, chat) => {
  const sw = chatSwitches(chat);
  const pre = prof?.pipe;
  if (!pre || !Object.keys(sw).length) return prof;
  const on = (k, def) => (k in sw ? sw[k] : def);
  return {
    ...prof,
    pipe: {
      ...pre,
      groups: (pre.groups || []).map((g) => ({ ...g, on: on(groupKey(g), g.on !== false) })),
      rows: pre.rows.map((r) => (r.type === "message" ? r : { ...r, on: on(rowKey(r), r.on !== false) })),
    },
  };
};
// Set one of a chat's switches (key from rowKey / groupKey; def: the profile's value).
// Back to the profile's value means the chat has no switch of its own for it.
const setChatSwitch = (chat, key, on, def) => {
  const sw = { ...chatSwitches(chat) };
  if (on === def) delete sw[key];
  else sw[key] = on;
  chat.meta.switches = sw;
};
const clearChatSwitches = (chat) => (chat.meta.switches = {});
// A plugin's own row (not one of its pieces).
const stepRowOf = (pre, id) => pre?.rows.find((r) => r.type === "step" && r.plugin === id && !r.part) || null;
const rowName = (r) => (r.type === "message" ? "Your message" : r.type === "step" ? pluginName(r.plugin) + (r.part ? " · " + (partOf(r)?.name || r.part) : "") : r.name || (r.text || "").trim().split("\n")[0].slice(0, 40) || "(empty piece)");
const whenLabel = (r) => (r.when === "everyN" ? `Every ${Math.max(1, +r.n || 1)} messages` : r.when === "depth" ? `At depth ${Math.max(0, +r.n || 0)}` : WHEN[r.when] || WHEN.every);

// Does this piece go with this message? count = the message's number in the chat.
const pieceGoes = (r, ctx, count) => {
  if (r.when === "off") return false;
  if (r.when === "first") return !!ctx.firstMessage;
  if (r.when === "everyN") return !!ctx.firstMessage || count % Math.max(1, Math.round(+r.n || 1)) === 0;
  return true; // every, depth
};

// The blocks a step changes when it is set to "only the blocks I pick": [{ key, name }] of the
// rows above it plus your message.
const pickable = (pre, r) => {
  const i = pre.rows.indexOf(r);
  const above = pre.rows.slice(0, i < 0 ? pre.rows.length : i).filter((x) => (x.type === "piece" && x.when !== "depth") || (x.type === "step" && (x.part || typeof S.plugins.get(x.plugin)?.def?.piece === "function")));
  return [...above.map((x) => ({ key: rowKey(x), name: rowName(x) })), { key: "message", name: "Your message" }];
};
const pickedNames = (pre, r) => {
  const names = pickable(pre, r).filter((b) => (r.pick || []).includes(b.key)).map((b) => b.name);
  return names.length ? names.join(", ") : "no block yet";
};

// ---------- the parts the rest of the app calls ----------
activePlugins = (prof = profile()) => {
  const pre = presetOf(prof);
  if (!pre) return [];
  // A plugin runs (afterReply, route ...) once, if any row of it is on.
  const ids = [...new Set(pre.rows.filter((r) => r.type === "step" && rowLive(pre, r) && S.plugins.get(r.plugin)?.def).map((r) => r.plugin))];
  return ids.map((id) => entryFor(id, prof));
};
stepOn = (id, prof = profile()) => {
  const pre = presetOf(prof);
  return !!pre && pre.rows.some((r) => r.type === "step" && r.plugin === id && rowLive(pre, r));
};
setStepOn = (id, on, prof = profile()) => {
  const pre = presetOf(prof);
  if (!pre || !isStep(S.plugins.get(id))) return; // sites and themes aren't rows
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
  let keys = []; // the row each part came from (rowKey, or "message"), for a step that changes only the blocks picked
  const MSG = {};
  const add = (x, key) => (parts.push(x), keys.push(key));
  const joined = () => parts.map((x) => (x === MSG ? msg : x)).filter((x) => x.trim()).join(JOIN);
  const sent = [];
  // "At depth N" pieces go N messages up inside the earlier chat a plugin sends
  // (Memory's recent messages), which marks them used; else just before your message.
  const depth = pre.rows.filter((r) => r.type === "piece" && r.when === "depth" && rowLive(pre, r) && (r.text || "").trim()).map((r) => ({ text: r.text.trim(), n: Math.max(0, Math.round(+r.n || 0)), name: rowName(r) }));
  depth.used = false;
  ctx = { ...ctx, depth };
  for (const r of pre.rows) {
    if (r.type === "message") {
      add(MSG, "message");
      continue;
    }
    if (!rowLive(pre, r)) continue;
    if (r.type === "piece") {
      if (r.when === "depth") continue;
      const text = (r.text || "").trim();
      if (!text || !pieceGoes(r, ctx, count)) continue;
      add(text, rowKey(r));
      sent.push(rowName(r));
      trace.push({ label: "Piece · " + rowName(r), text, notes: [] });
      continue;
    }
    const p = S.plugins.get(r.plugin);
    if (!p?.def) continue;
    const notes = [];
    const hctx = hookCtx(r.plugin, ctx, prof, notes);
    let out = null;
    if (r.part) {
      const d = partOf(r);
      if (!d || typeof d.text !== "function") continue;
      const text = await d.text({ ...hctx, message: msg });
      if (typeof text === "string" && text.trim()) add(text.trim(), rowKey(r));
      out = text || "(nothing)";
    } else if (typeof p.def.piece === "function") {
      const text = await p.def.piece({ ...hctx, message: msg });
      if (typeof text === "string" && text.trim()) add(text.trim(), rowKey(r));
      out = text || "(nothing)";
    } else if (typeof p.def.beforeSend === "function") {
      if (r.scope === "message") {
        const t = await p.def.beforeSend(msg, hctx);
        if (typeof t === "string") msg = t;
        out = msg;
      } else if (r.scope === "pick") {
        // Only the blocks picked (and maybe your message). The plugin gets each one on its own,
        // with ctx.pick = { i, n } (this is block i of n), so it can mark them and say so once.
        const want = new Set(r.pick || []);
        const at = parts.map((x, i) => (x !== MSG && want.has(keys[i]) ? i : -1)).filter((i) => i >= 0);
        const total = at.length + (want.has("message") ? 1 : 0);
        let k = 0;
        const one = async (t) => {
          const o = await p.def.beforeSend(t, { ...hctx, pick: { i: k++, n: total } });
          return typeof o === "string" ? o : t;
        };
        for (const i of at) parts[i] = await one(parts[i]);
        if (want.has("message")) msg = await one(msg);
        out = total ? joined() : "(no block picked)";
      } else {
        const t = await p.def.beforeSend(joined(), hctx);
        if (typeof t === "string") (parts = [t]), (keys = [""]);
        out = joined();
      }
    } else continue;
    trace.push({ label: `${pluginName(r.plugin)} · before`, text: out, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(r.plugin)}: ${n}`));
  }
  if (depth.length && !depth.used) {
    const at = parts.indexOf(MSG);
    parts.splice(at < 0 ? parts.length : at, 0, ...depth.map((d) => d.text));
  }
  if (depth.length) sent.push(...depth.map((d) => `${d.name} (depth ${d.n}${depth.used ? "" : ", before your message"})`));
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
      if (r.when === "depth") continue;
      if ((r.text || "").trim() && pieceGoes(r, ctx, count)) out.push(r.text.trim());
    } else if (r.part) {
      if (partOf(r)) out.push(`⟨${rowName(r)} goes here⟩`);
    } else if (changesText(S.plugins.get(r.plugin))) {
      const p = S.plugins.get(r.plugin);
      out.push(typeof p.def.piece === "function" ? `⟨${pluginName(r.plugin)} adds its text here⟩` : `⟨${pluginName(r.plugin)} changes ${r.scope === "message" ? "your message" : r.scope === "pick" ? pickedNames(pre, r) : "everything above"}⟩`);
    }
  }
  const depth = pre.rows.filter((r) => r.type === "piece" && r.when === "depth" && rowLive(pre, r) && (r.text || "").trim());
  if (depth.length) out.push("⟨at depth: " + depth.map((r) => `${rowName(r)} ${Math.max(0, +r.n || 0)} up in the earlier chat`).join(", ") + "⟩");
  return out.join(JOIN);
};

// ---------- presets: edit (each saves) ----------
// Fill a profile's rows from a starter (the profile's own rows are replaced).
const applyStarter = (id, prof = profile()) => {
  const t = presets().find((p) => p.id === id);
  if (!t) return;
  prof.pipe = clonePipe(t);
  syncRows(prof.pipe);
  saveConfig();
};
// A new profile with its own rows, from a starter (or just your message). It is
// not made the active one.
const makeProfile = (name, starterId = "plain", from = profile()) => {
  const prof = { id: "p" + Date.now().toString(36), name, plugins: [] };
  S.config.profiles.push(prof);
  applyStarter(starterId, prof);
  if (!prof.pipe) prof.pipe = { groups: [], rows: [messageRow()] };
  return prof;
};
const copyProfile = (src, name) => {
  const prof = JSON.parse(JSON.stringify(src));
  prof.id = "p" + Date.now().toString(36);
  prof.name = name;
  prof.pipe = clonePipe(src.pipe);
  S.config.profiles.push(prof);
  saveConfig();
  return prof;
};
const moveRow = (pre, i, d) => moveRowTo(pre, i, i + d);
// Take the row at `from` and put it at `to` (the others shift).
const moveRowTo = (pre, from, to) => {
  if (to < 0 || to >= pre.rows.length || from === to) return;
  pre.rows.splice(to, 0, ...pre.rows.splice(from, 1));
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
// Every profile has its message row. Plugins join a profile only when the
// person adds them (Add a row), so a profile lists what it uses.
const syncRows = (pre) => {
  pre.groups = pre.groups || [];
  if (!pre.rows.some((r) => r.type === "message")) pre.rows.push(messageRow());
};
// Older versions put every installed plugin in every profile, switched off.
// Those rows go once; a plugin's settings stay, so adding it back restores them.
const dropAutoRows = (pre) => {
  pre.rows = pre.rows.filter((r) => r.type !== "step" || r.on);
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
  const lib = S.config.profiles.some((p) => !p.preset && !p.pipe) ? await promptLibrary() : [];
  // Older configs: profiles shared presets (or had none). Each profile now gets its own rows.
  const had = new Set(presets().map((p) => p.id));
  const made = new Set(); // presets that only existed because of a profile
  let moved = false;
  for (const prof of S.config.profiles) {
    if (prof.pipe) continue;
    moved = true;
    if (!prof.preset) {
      prof.preset = migrateProfile(prof, lib);
      if (!had.has(prof.preset)) made.add(prof.preset);
    }
    const t = presets().find((p) => p.id === prof.preset) || presets()[0];
    prof.pipe = clonePipe(t);
    delete prof.preset;
  }
  S.config.presets = presets().filter((p) => !made.has(p.id));
  // Starters are shipped data: a new set of them replaces the old one (once per set). Profiles
  // you made from a starter have their own rows and stay as they are.
  const refreshed = S.config.startersSet !== STARTERS_SET;
  if (refreshed) {
    const shipped = STARTERS();
    const ids = new Set(shipped.map((p) => p.id));
    S.config.presets = [...shipped, ...presets().filter((p) => !ids.has(p.id) && p.id !== "rp")];
    S.config.startersSet = STARTERS_SET;
  }
  const prune = !S.config.rowsPruned;
  for (const pre of [...S.config.profiles.map((p) => p.pipe), ...presets()]) {
    if (prune) dropAutoRows(pre);
    syncRows(pre);
  }
  S.config.rowsPruned = true;
  if (fresh || moved || prune || refreshed) saveConfig();
};
on("plugins", setUp, null);

// Shared with the UI part and plugins.
PP.pipeline = { pickable, rowKey, groupKey, chatSwitches, forChat, setChatSwitch, clearChatSwitches, step, pipeSteps, partRow, pluginPieces, partOf, WHEN, presets, presetOf, rowLive, rowName, whenLabel, previewMessage, piece, promptLibrary, applyStarter, makeProfile, copyProfile, clonePipe, syncRows, moveRow, moveRowTo, addGroup, removeGroup };
