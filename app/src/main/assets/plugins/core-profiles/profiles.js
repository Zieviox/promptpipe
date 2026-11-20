"use strict";
// Core plugin: profiles. A profile is an ordered list of blocks (prof.blocks), top to bottom:
//   prompt   a System prompt: text of yours, or linked to a prompt of the library (link: its id),
//            so editing it in the library changes every profile that links it. "when" says
//            which messages get it.
//   plugin   a plugin. Its beforeSend changes everything above it (or only your message, or only
//            the blocks picked); a plugin with text() (Memory) puts its text where its block is,
//            and each of its named texts (texts) can be a block of its own (textId).
//   message  where your message goes
// A block can sit in a group (prof.groups): the group's toggle turns all its blocks on or off.
// Templates (S.config.templates: Plain, Writing feedback ...) are what a new profile is copied
// from; changing a profile never changes a template or another profile.
// Each chat keeps its own toggles (chat.meta.toggles), where they differ from the profile.
// The prompt library (history/prompt-library.json, kept in git) is loaded here.
// Plugin settings stay per profile (settingsFor); which plugins run is the profile's blocks.

const WHEN = { every: "Every message", first: "First message of a site chat", everyN: "Every N messages", depth: "At depth N (N messages up in the earlier chat)", off: "Off" };
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const JOIN = "\n\n";

// ---------- blocks ----------
const promptBlock = (name, text, when = "every", extra = {}) => ({ type: "prompt", id: newId("pr"), name, text, when, n: 5, group: "", on: true, ...extra });
const linkedBlock = (link, when = "every", extra = {}) => ({ type: "prompt", id: newId("pr"), link, when, n: 5, group: "", on: true, ...extra });
const pluginBlock = (plugin, on = true, scope = "above") => ({ type: "plugin", plugin, on, scope, group: "" });
// One of a plugin's named texts (def.texts[textId]), in a block of its own.
const textBlock = (plugin, textId) => ({ type: "plugin", plugin, textId, on: true, group: "" });
const messageBlock = () => ({ type: "message" });

// A plugin can be a block if it does something with messages.
const HOOKS = ["beforeSend", "afterReply", "text", "route", "renderTurn"];
const canBeBlock = (p) => isBlockPlugin(p) && !!p.def && HOOKS.some((k) => typeof p.def[k] === "function");
const changesText = (p) => !!p?.def && (typeof p.def.text === "function" || typeof p.def.beforeSend === "function");
const textOfBlock = (b) => (b.textId && S.plugins.get(b.plugin)?.def?.texts?.[b.textId]) || null;
// Every plugin that can be a block of its own, by name.
const blockPlugins = () => [...S.plugins.values()].filter(canBeBlock).sort((a, b) => (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id));
// Every named text a plugin offers: [{ plugin, textId, name }].
const pluginTexts = () =>
  [...S.plugins.values()].filter((p) => isBlockPlugin(p) && p.def?.texts).flatMap((p) => Object.entries(p.def.texts).map(([textId, d]) => ({ plugin: p.id, textId, name: `${pluginName(p.id)} · ${d.name || textId}` })));

// ---------- the prompt library ----------
// Every System prompt you save: { id, name, text, pinned, created, edited }. A linked block sends
// the library's text, so one edit here reaches every profile that links it.
const LIB_FILE = "prompt-library.json";
const LEGACY_LIB_FILE = "system-prompts.json"; // legacy: the System prompt plugin's library file
const PROMPT_LIB = { prompts: [], loaded: false };
const libPrompt = (id) => PROMPT_LIB.prompts.find((p) => p.id === id) || null;
const libName = (p) => (p ? p.name || p.text.trim().split("\n")[0].slice(0, 40) || "(empty)" : "");
const loadLibrary = async () => {
  for (const file of [LIB_FILE, LEGACY_LIB_FILE]) {
    try {
      const r = await api("/api/history/file?path=" + file);
      if (!r.text) continue;
      PROMPT_LIB.prompts = (JSON.parse(r.text).prompts || []).filter((p) => p && typeof p.text === "string");
      PROMPT_LIB.loaded = true;
      // legacy: the old file moves to the new name, in one commit
      if (file === LEGACY_LIB_FILE) await saveLibrary("moved to " + LIB_FILE, [LEGACY_LIB_FILE]);
      return;
    } catch (e) {}
  }
  PROMPT_LIB.loaded = true;
};
const saveLibrary = (message, remove = []) =>
  api("/api/history/save", { files: [{ path: LIB_FILE, text: JSON.stringify({ prompts: PROMPT_LIB.prompts }, null, 2) + "\n" }], delete: remove, message: "prompt library: " + message }).catch((e) => toast("Couldn't save the prompt library: " + e.message, "error"));
const newLibPrompt = (name, text) => ({ id: newId("lp"), name: name || "", text, pinned: false, created: iso() });
// The text a System prompt block sends: its own, or its library prompt's.
const promptText = (b) => (b.link ? libPrompt(b.link)?.text || "" : b.text || "");

// ---------- templates ----------
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

// Every template: the master system prompt first (empty, yours), the blocks that carry instructions,
// then Base64 (off), then your message. Base64 changes everything above it, so when it is
// toggled on your message stays plain.
const master = () => promptBlock("Master system prompt", "", "every");
const base64Off = () => pluginBlock("base64", false, "above");
const TEMPLATES_SET = 3; // raise it when the shipped templates change
const TEMPLATES = () => [
  { id: "plain", name: "Plain", groups: [], blocks: [master(), messageBlock()] },
  { id: "feedback", name: "Writing feedback", groups: [], blocks: [master(), promptBlock("Editor", EDITOR, "every"), base64Off(), messageBlock()] },
  {
    id: "dialogue",
    name: "Dialogue & Role play",
    groups: [],
    blocks: [
      master(),
      promptBlock("Development", DEVELOPMENT, "first"),
      promptBlock("Scene rules", SCENE_RULES, "every"),
      promptBlock("Dialogue craft", DIALOGUE_CRAFT, "every"),
      promptBlock("Characters and setting", "", "first"),
      pluginBlock("memory"),
      promptBlock("Reminder", "(Stay in character, and don't write for my character.)", "everyN", { n: 5 }),
      base64Off(),
      messageBlock(),
    ],
  },
  {
    id: "story",
    name: "Story & Prose",
    groups: [],
    blocks: [
      master(),
      promptBlock("Co-writer", CO_WRITER, "every"),
      promptBlock("Development", DEVELOPMENT, "every"),
      promptBlock("Prose style", PROSE_STYLE, "every"),
      promptBlock("Bridge", BRIDGE, "every"),
      promptBlock("Dialogue craft", DIALOGUE_CRAFT, "every"),
      promptBlock("Prose craft", PROSE_CRAFT, "every"),
      promptBlock("Story notes", "", "first"),
      pluginBlock("memory"),
      base64Off(),
      messageBlock(),
    ],
  },
];

// ---------- lookups (pure on the config) ----------
const templates = () => (S.config.templates = S.config.templates || []);
// A copy of a profile's or template's blocks and groups, with new ids for its System prompt blocks.
const cloneBlocks = (src) => {
  const out = JSON.parse(JSON.stringify({ groups: src.groups || [], blocks: src.blocks || [] }));
  for (const b of out.blocks) if (b.type === "prompt") b.id = newId("pr");
  return out;
};
const groupOf = (prof, b) => (b.group ? (prof.groups || []).find((g) => g.id === b.group) : null);
const blockLive = (prof, b) => b.on !== false && groupOf(prof, b)?.on !== false;

// ---------- a chat's own toggles ----------
// Each chat keeps its own on/off for its profile's blocks and groups, in its file:
// chat.meta.toggles = { key: true | false }, only where it differs from the profile
// (the profile is the default a chat starts from). Every message of the chat uses them,
// including one that waits in the queue: they are read when the message is built.
const blockKey = (b) => (b.type === "prompt" ? b.id : b.type === "plugin" ? b.plugin + (b.textId ? "/" + b.textId : "") : "");
const groupKey = (g) => "group/" + g.id;
const chatToggles = (chat) => chat?.meta?.toggles || {};
// The profile as this chat uses it: the same blocks, with the chat's toggles applied.
forChat = (prof, chat) => {
  const t = chatToggles(chat);
  if (!prof || !Object.keys(t).length) return prof;
  const on = (k, def) => (k in t ? t[k] : def);
  return {
    ...prof,
    groups: (prof.groups || []).map((g) => ({ ...g, on: on(groupKey(g), g.on !== false) })),
    blocks: prof.blocks.map((b) => (b.type === "message" ? b : { ...b, on: on(blockKey(b), b.on !== false) })),
  };
};
// Set one of a chat's toggles (key from blockKey / groupKey; def: the profile's value).
// Back to the profile's value means the chat has no toggle of its own for it.
const setChatToggle = (chat, key, on, def) => {
  const t = { ...chatToggles(chat) };
  if (on === def) delete t[key];
  else t[key] = on;
  chat.meta.toggles = t;
};
const clearChatToggles = (chat) => (chat.meta.toggles = {});
// A plugin's own block (not one of its named texts).
const pluginBlockOf = (prof, id) => prof?.blocks.find((b) => b.type === "plugin" && b.plugin === id && !b.textId) || null;
const blockName = (b) =>
  b.type === "message"
    ? "Your message"
    : b.type === "plugin"
      ? pluginName(b.plugin) + (b.textId ? " · " + (textOfBlock(b)?.name || b.textId) : "")
      : b.link
        ? libName(libPrompt(b.link)) || "(no longer in the library)"
        : b.name || (b.text || "").trim().split("\n")[0].slice(0, 40) || "(empty system prompt)";
const whenLabel = (b) => (b.when === "everyN" ? `Every ${Math.max(1, +b.n || 1)} messages` : b.when === "depth" ? `At depth ${Math.max(0, +b.n || 0)}` : WHEN[b.when] || WHEN.every);

// Does this System prompt go with this message? count = the message's number in the chat.
const promptGoes = (b, ctx, count) => {
  if (b.when === "off") return false;
  if (b.when === "first") return !!ctx.firstMessage;
  if (b.when === "everyN") return !!ctx.firstMessage || count % Math.max(1, Math.round(+b.n || 1)) === 0;
  return true; // every, depth
};

// The blocks a plugin changes when it is set to "only the blocks I pick": [{ key, name }] of the
// blocks above it plus your message.
const pickable = (prof, b) => {
  const i = prof.blocks.indexOf(b);
  const above = prof.blocks.slice(0, i < 0 ? prof.blocks.length : i).filter((x) => (x.type === "prompt" && x.when !== "depth") || (x.type === "plugin" && (x.textId || typeof S.plugins.get(x.plugin)?.def?.text === "function")));
  return [...above.map((x) => ({ key: blockKey(x), name: blockName(x) })), { key: "message", name: "Your message" }];
};
const pickedNames = (prof, b) => {
  const names = pickable(prof, b).filter((x) => (b.pick || []).includes(x.key)).map((x) => x.name);
  return names.length ? names.join(", ") : "no block yet";
};

// ---------- what the rest of the app calls ----------
// The plugins that run (afterReply, route ...): each once, if any block of it is on. Ids.
activePlugins = (prof = profile()) => (prof ? [...new Set(prof.blocks.filter((b) => b.type === "plugin" && blockLive(prof, b) && S.plugins.get(b.plugin)?.def).map((b) => b.plugin))] : []);
pluginOn = (id, prof = profile()) => !!prof && prof.blocks.some((b) => b.type === "plugin" && b.plugin === id && blockLive(prof, b));
setPluginOn = (id, on, prof = profile()) => {
  if (!prof || !isBlockPlugin(S.plugins.get(id))) return; // providers, themes and passive plugins aren't blocks
  let b = pluginBlockOf(prof, id);
  if (!b) prof.blocks.push((b = pluginBlock(id, on)));
  b.on = on;
  const g = groupOf(prof, b);
  if (on && g && g.on === false) toast(`${pluginName(id)} is on, but its group “${g.name}” is off`);
  saveConfig();
};

// Walk the blocks top to bottom. A System prompt adds its text, "Your message" adds the
// message, a plugin changes what is above it (or only the message, or the blocks picked),
// a plugin with text() adds its own text there.
buildMessage = async (prompt, ctx, trace, prof = profile()) => {
  if (!prof) return prompt;
  const count = ctx.chat ? ctx.chat.turns.length : 1;
  let msg = prompt;
  let out = []; // strings, or MSG where the message goes
  let keys = []; // the block each string came from (blockKey, or "message"), for a plugin that changes only the blocks picked
  const MSG = {};
  const add = (x, key) => (out.push(x), keys.push(key));
  const joined = () => out.map((x) => (x === MSG ? msg : x)).filter((x) => x.trim()).join(JOIN);
  const sent = [];
  // "At depth N" System prompts go N messages up inside the earlier chat a plugin sends
  // (Memory's recent messages), which marks them used; else just before your message.
  const depth = prof.blocks.filter((b) => b.type === "prompt" && b.when === "depth" && blockLive(prof, b) && promptText(b).trim()).map((b) => ({ text: promptText(b).trim(), n: Math.max(0, Math.round(+b.n || 0)), name: blockName(b) }));
  depth.used = false;
  ctx = { ...ctx, depth };
  for (const b of prof.blocks) {
    if (b.type === "message") {
      add(MSG, "message");
      continue;
    }
    if (!blockLive(prof, b)) continue;
    if (b.type === "prompt") {
      if (b.when === "depth") continue;
      const text = promptText(b).trim();
      if (!text || !promptGoes(b, ctx, count)) continue;
      add(text, blockKey(b));
      sent.push(blockName(b));
      trace.push({ label: "System prompt · " + blockName(b), text, notes: [] });
      continue;
    }
    const p = S.plugins.get(b.plugin);
    if (!p?.def) continue;
    const notes = [];
    const hctx = hookCtx(b.plugin, ctx, prof, notes);
    let result = null;
    if (b.textId) {
      const d = textOfBlock(b);
      if (!d || typeof d.text !== "function") continue;
      const text = await d.text({ ...hctx, message: msg });
      if (typeof text === "string" && text.trim()) add(text.trim(), blockKey(b));
      result = text || "(nothing)";
    } else if (typeof p.def.text === "function") {
      const text = await p.def.text({ ...hctx, message: msg });
      if (typeof text === "string" && text.trim()) add(text.trim(), blockKey(b));
      result = text || "(nothing)";
    } else if (typeof p.def.beforeSend === "function") {
      if (b.scope === "message") {
        const t = await p.def.beforeSend(msg, hctx);
        if (typeof t === "string") msg = t;
        result = msg;
      } else if (b.scope === "pick") {
        // Only the blocks picked (and maybe your message). The plugin gets each one on its own,
        // with ctx.pick = { i, n } (this is block i of n), so it can mark them and say so once.
        const want = new Set(b.pick || []);
        const at = out.map((x, i) => (x !== MSG && want.has(keys[i]) ? i : -1)).filter((i) => i >= 0);
        const total = at.length + (want.has("message") ? 1 : 0);
        let k = 0;
        const one = async (t) => {
          const o = await p.def.beforeSend(t, { ...hctx, pick: { i: k++, n: total } });
          return typeof o === "string" ? o : t;
        };
        for (const i of at) out[i] = await one(out[i]);
        if (want.has("message")) msg = await one(msg);
        result = total ? joined() : "(no block picked)";
      } else {
        const t = await p.def.beforeSend(joined(), hctx);
        if (typeof t === "string") (out = [t]), (keys = [""]);
        result = joined();
      }
    } else continue;
    trace.push({ label: `${pluginName(b.plugin)} · before`, text: result, notes });
    ctx.notes.push(...notes.map((n) => `${pluginName(b.plugin)}: ${n}`));
  }
  if (depth.length && !depth.used) {
    const at = out.indexOf(MSG);
    out.splice(at < 0 ? out.length : at, 0, ...depth.map((d) => d.text));
  }
  if (depth.length) sent.push(...depth.map((d) => `${d.name} (depth ${d.n}${depth.used ? "" : ", before your message"})`));
  if (sent.length) ctx.notes.push(`${prof.name}: ${sent.join(", ")}`);
  return joined() || msg;
};

// What would go out, without running anything: plugins show as a marker.
const previewMessage = (prof = profile(), opts = {}) => {
  if (!prof) return "";
  const ctx = { firstMessage: opts.first !== false };
  const count = opts.count || 1;
  const out = [];
  for (const b of prof.blocks) {
    if (b.type === "message") out.push("⟨your message⟩");
    else if (!blockLive(prof, b)) continue;
    else if (b.type === "prompt") {
      if (b.when === "depth") continue;
      const text = promptText(b).trim();
      if (text && promptGoes(b, ctx, count)) out.push(text);
    } else if (b.textId) {
      if (textOfBlock(b)) out.push(`⟨${blockName(b)} goes here⟩`);
    } else if (changesText(S.plugins.get(b.plugin))) {
      const p = S.plugins.get(b.plugin);
      out.push(typeof p.def.text === "function" ? `⟨${pluginName(b.plugin)} adds its text here⟩` : `⟨${pluginName(b.plugin)} changes ${b.scope === "message" ? "your message" : b.scope === "pick" ? pickedNames(prof, b) : "everything above"}⟩`);
    }
  }
  const depth = prof.blocks.filter((b) => b.type === "prompt" && b.when === "depth" && blockLive(prof, b) && promptText(b).trim());
  if (depth.length) out.push("⟨at depth: " + depth.map((b) => `${blockName(b)} ${Math.max(0, +b.n || 0)} up in the earlier chat`).join(", ") + "⟩");
  return out.join(JOIN);
};

// ---------- editing (each saves) ----------
// Fill a profile's blocks from a template (the profile's own blocks are replaced).
const applyTemplate = (id, prof = profile()) => {
  const t = templates().find((x) => x.id === id);
  if (!t) return;
  Object.assign(prof, cloneBlocks(t));
  syncBlocks(prof);
  saveConfig();
};
// A new profile with its own blocks, from a template (or just your message). It is
// not made the active one.
const makeProfile = (name, templateId = "plain") => {
  const prof = { id: "p" + Date.now().toString(36), name, blocks: [], groups: [], pluginSettings: {} };
  S.config.profiles.push(prof);
  applyTemplate(templateId, prof);
  syncBlocks(prof);
  return prof;
};
const copyProfile = (src, name) => {
  const prof = JSON.parse(JSON.stringify(src));
  prof.id = "p" + Date.now().toString(36);
  prof.name = name;
  Object.assign(prof, cloneBlocks(src));
  S.config.profiles.push(prof);
  saveConfig();
  return prof;
};
const moveBlock = (prof, i, d) => moveBlockTo(prof, i, i + d);
// Take the block at `from` and put it at `to` (the others shift).
const moveBlockTo = (prof, from, to) => {
  if (to < 0 || to >= prof.blocks.length || from === to) return;
  prof.blocks.splice(to, 0, ...prof.blocks.splice(from, 1));
  saveConfig();
};
const addGroup = (prof, name) => {
  const g = { id: newId("g"), name, on: true };
  (prof.groups = prof.groups || []).push(g);
  saveConfig();
  return g;
};
const removeGroup = (prof, g) => {
  prof.groups = prof.groups.filter((x) => x !== g);
  for (const b of prof.blocks) if (b.group === g.id) b.group = "";
  saveConfig();
};
// Every profile has its groups list and its "Your message" block.
const syncBlocks = (prof) => {
  prof.groups = prof.groups || [];
  prof.blocks = prof.blocks || [];
  if (!prof.blocks.some((b) => b.type === "message")) prof.blocks.push(messageBlock());
};

// ---------- saved data from before 2026-11-20 (legacy names) ----------
// legacy: a profile's or template's { groups, rows } with rows piece / step / message.
// The System prompt plugin's stack becomes linked System prompt blocks where its legacy row sat,
// in the same order, sent with the same messages (its first-message-only setting).
const legacyBlocks = (rows, prof) => {
  const out = [];
  for (const r of rows || []) {
    if (r.type === "message") out.push(messageBlock());
    else if (r.type === "piece") out.push({ type: "prompt", id: r.id || newId("pr"), name: r.name || "", text: r.text || "", when: r.when || "every", n: r.n ?? 5, group: r.group || "", on: r.on !== false }); // legacy
    else if (r.type === "step" && r.plugin === "system-prompt") { // legacy
      const s = (prof && prof.pluginSettings && prof.pluginSettings["system-prompt"]) || {}; // legacy: the System prompt plugin
      const when = s.when === "every" ? "every" : "first";
      const extra = { group: r.group || "", on: r.on !== false };
      const stack = Array.isArray(s.stack) ? s.stack : [];
      if (stack.length) out.push(...stack.map((id) => linkedBlock(id, when, extra)));
      else if ((s.prompt || "").trim()) out.push(promptBlock("System prompt", s.prompt.trim(), when, extra));
    } else if (r.type === "step") { // legacy
      const b = { type: "plugin", plugin: r.plugin, on: r.on !== false, group: r.group || "" };
      if (r.part) b.textId = r.part;
      if (r.scope) b.scope = r.scope;
      if (r.pick) b.pick = r.pick; // the keys didn't change
      out.push(b);
    }
  }
  return out;
};
const migrateLegacy = () => {
  const c = S.config;
  let changed = false;
  if (c.presets && !c.templates) { // legacy
    c.templates = c.presets.map((t) => ({ id: t.id, name: t.name, groups: t.groups || [], blocks: legacyBlocks(t.rows) })); // legacy: config.presets
    changed = true;
  }
  delete c.presets; // legacy
  delete c.startersSet; // legacy
  delete c.rowsPruned; // legacy
  for (const prof of c.profiles) {
    if (prof.pipe && !prof.blocks?.length) { // legacy
      prof.groups = prof.pipe.groups || []; // legacy
      prof.blocks = legacyBlocks(prof.pipe.rows, prof); // legacy: prof.pipe
      changed = true;
    } else if (!prof.blocks?.length && prof.legacyPluginsOn) {
      // legacy: a profile from before profiles had their own list: Plain, plus the plugins that were on
      prof.groups = [];
      prof.blocks = [promptBlock("Master system prompt", "", "every"), messageBlock()];
      const on = prof.legacyPluginsOn;
      if (on["system-prompt"]) prof.blocks.splice(1, 0, ...legacyBlocks([{ type: "step", plugin: "system-prompt", on: true }], prof));
      for (const [id, v] of Object.entries(on)) if (v && id !== "system-prompt") prof.blocks.push(pluginBlock(id, true));
      changed = true;
    }
    if (prof.pipe || prof.legacyPluginsOn || prof.preset != null) changed = true; // legacy
    delete prof.pipe; // legacy
    delete prof.preset; // legacy
    delete prof.legacyPluginsOn;
    if (prof.pluginSettings && prof.pluginSettings["system-prompt"]) {
      delete prof.pluginSettings["system-prompt"]; // legacy: its stack is linked blocks now
      changed = true;
    }
    if (prof.blocks.some((b) => b.type === "plugin" && b.plugin === "system-prompt")) {
      prof.blocks = prof.blocks.filter((b) => !(b.type === "plugin" && b.plugin === "system-prompt"));
      changed = true;
    }
  }
  return changed;
};

// legacy: a version 1 profile file ({ name, rows, groups, plugins: [{ id, settings }] }) as version 2 data.
const legacyProfileData = (d) => {
  const pluginSettings = Object.fromEntries((d.plugins || []).map((e) => [e.id, e.settings || {}])); // legacy
  const blocks = legacyBlocks(d.rows, { pluginSettings }); // legacy
  delete pluginSettings["system-prompt"]; // legacy
  return { name: d.name, blocks, groups: d.groups || [], pluginSettings, library: [], requires: [...new Set(blocks.filter((b) => b.type === "plugin").map((b) => b.plugin))] };
};

const setUp = async () => {
  const fresh = !S.config.templates && !S.config.presets; // legacy: presets
  let changed = migrateLegacy();
  if (fresh) S.config.templates = TEMPLATES();
  // Templates are shipped data: a new set of them replaces the old one (once per set). Profiles
  // you made from a template have their own blocks and stay as they are.
  if (S.config.templatesSet !== TEMPLATES_SET) {
    const shipped = TEMPLATES();
    const ids = new Set(shipped.map((t) => t.id));
    S.config.templates = [...shipped, ...templates().filter((t) => !ids.has(t.id) && t.id !== "rp")];
    S.config.templatesSet = TEMPLATES_SET;
    changed = true;
  }
  // A first start: the profile you have is made from Plain.
  if (fresh) for (const prof of S.config.profiles) if (!prof.blocks || !prof.blocks.length) applyTemplate("plain", prof);
  for (const prof of S.config.profiles) syncBlocks(prof);
  for (const t of templates()) syncBlocks(t);
  if (!PROMPT_LIB.loaded) await loadLibrary();
  if (fresh || changed) saveConfig();
};
on("plugins", setUp, null);

// Shared with the screen and plugins.
PP.profiles = {
  WHEN, pickable, blockKey, groupKey, chatToggles, forChat, setChatToggle, clearChatToggles, pluginBlock, linkedBlock, promptBlock, textBlock,
  blockPlugins, pluginTexts, textOfBlock, templates, blockLive, blockName, whenLabel, previewMessage, applyTemplate, makeProfile, copyProfile,
  cloneBlocks, syncBlocks, moveBlock, moveBlockTo, addGroup, removeGroup, promptText,
  library: PROMPT_LIB, libPrompt, libName, loadLibrary, saveLibrary, newLibPrompt, legacyProfileData,
};
