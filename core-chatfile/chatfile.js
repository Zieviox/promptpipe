// Chat <-> Markdown file. The file is meant to be read by people (and edited in
// any editor); hidden <!-- pp:... --> markers let the app read it back.
//
// ---
// title: Story ideas
// source: https://chat.qwen.ai/c/...      (the chat on the AI site)
// site: qwen-chat                          (the site plugin the chat uses)
// ai: Qwen Chat
// model: Qwen3-Max
// profile: Base64
// tags: [story, "draft#"]                 (chat tags: every message gets them;
//                                          name# gives each new message the next number)
// created: 2026-10-30T21:15:00.000Z
// updated: ...
// ---
// # Story ideas
// > Source: [Qwen Chat](https://chat.qwen.ai/c/...) · Model: ... · Profile: ...
// ## 1 · 2026-10-30 21:15
// <!-- pp:turn {"at":"...","profile":"Base64","notes":[...]} -->
// ### You / ### <AI name> / <details> with what was sent and the raw reply
(function () {
  const FIELDS = ["title", "source", "site", "ai", "model", "profile", "switches", "tags", "created", "updated"];
  // The chat's own plugin switches (see core-pipeline): "memory=off pc1x2=on".
  const switchesStr = (sw) => Object.entries(sw || {}).map(([k, v]) => `${k}=${v ? "on" : "off"}`).join(" ");
  const switchesOf = (v) => Object.fromEntries(String(v || "").split(/\s+/).map((x) => /^(.+)=(on|off)$/.exec(x)).filter(Boolean).map((m) => [m[1], m[2] === "on"]));

  const yamlStr = (s) => {
    s = String(s ?? "");
    return /^[\w./@+-][\w ./@+-]*$/.test(s) && s.trim() === s ? s : JSON.stringify(s);
  };
  const yamlVal = (v) => {
    v = v.trim();
    if (v.startsWith('"')) {
      try {
        return JSON.parse(v);
      } catch (e) {
        return v;
      }
    }
    return v;
  };

  const parseFront = (text) => {
    const meta = { title: "", source: "", site: "", ai: "", model: "", profile: "", switches: {}, tags: [], created: "", updated: "" };
    const m = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!m) return meta;
    for (const line of m[1].split("\n")) {
      const kv = /^(\w+):\s?(.*)$/.exec(line);
      if (!kv) continue;
      if (kv[1] === "tags") {
        const inner = kv[2].trim().replace(/^\[|\]$/g, "");
        meta.tags = (inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || []).map(yamlVal).filter(Boolean);
      } else if (kv[1] === "switches") meta.switches = switchesOf(yamlVal(kv[2]));
      else meta[kv[1]] = yamlVal(kv[2]);
    }
    return meta;
  };

  // A message's tags: its own, plus the chat's plain tags (counter templates
  // like "draft#" were already turned into a number when the message was made).
  const messageTags = (meta, turn) => [...new Set([...(turn.tags || []), ...(meta.tags || []).filter((t) => !t.endsWith("#"))])];

  const fence = (text, lang = "text") => {
    const longest = Math.max(3, ...(String(text).match(/`+/g) || [""]).map((s) => s.length));
    const f = "`".repeat(longest + 1);
    return `${f}${lang}\n${text}\n${f}`;
  };

  const stamp = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return iso || "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const toMd = (chat) => {
    const m = chat.meta;
    const out = ["---"];
    for (const k of FIELDS) {
      if (k === "tags") out.push(`tags: [${(m.tags || []).map(yamlStr).join(", ")}]`);
      else if (k === "switches") out.push(`switches: ${switchesStr(m.switches) ? yamlStr(switchesStr(m.switches)) : ""}`.trimEnd());
      else out.push(`${k}: ${m[k] ? yamlStr(m[k]) : ""}`.trimEnd());
    }
    out.push("---", "", `# ${m.title || "Untitled chat"}`, "");
    const src = [];
    src.push(m.source ? `Source: [${m.ai || "AI chat"}](${m.source})` : `AI: ${m.ai || "?"}`);
    if (m.model) src.push(`Model: ${m.model}`);
    if (m.profile) src.push(`Profile: ${m.profile}`);
    if (m.tags && m.tags.length) src.push(`Chat tags: ${m.tags.map((t) => "`" + t + "`").join(" ")}`);
    out.push("> " + src.join(" · "), "");
    chat.turns.forEach((t, i) => {
      const info = { at: t.at, profile: t.profile || "", tags: t.tags || [], notes: t.notes || [] };
      if (t.error) info.error = t.error;
      if (t.secs != null) info.secs = t.secs;
      // Plugins' own notes on this message (ctx.setTurnData), by plugin id.
      if (t.data && Object.keys(t.data).length) info.data = t.data;
      out.push(`## ${i + 1} · ${stamp(t.at)}`, "", `<!-- pp:turn ${JSON.stringify(info)} -->`, "");
      const tags = messageTags(m, t);
      if (tags.length) out.push("Tags: " + tags.map((x) => "`" + x + "`").join(" "), "");
      out.push("<!-- pp:you -->", "### You", "", t.you, "");
      if (t.thinking) out.push("<!-- pp:think -->", "<details><summary>Thinking</summary>", "", t.thinking, "", "</details>", "");
      out.push("<!-- pp:ai -->", `### ${m.ai || "AI"}`, "", t.reply, "");
      out.push("<!-- pp:raw -->", "<details><summary>Sent and raw reply</summary>", "");
      out.push("Sent:", "", fence(t.sent), "", "Raw reply:", "", fence(t.raw), "", "</details>", "");
    });
    return out.join("\n");
  };

  // Sections start at marker lines (a marker must be alone on its line).
  const sections = (body) => {
    const out = {};
    const parts = body.split(/^<!-- pp:(you|think|ai|raw) -->[ \t]*$/m);
    for (let i = 1; i < parts.length; i += 2) if (!(parts[i] in out)) out[parts[i]] = parts[i + 1];
    return out;
  };
  const dropHeading = (s) => s.replace(/^\s*###[^\n]*\n/, "").trim();

  const fromMd = (path, text) => {
    const meta = parseFront(text);
    const turns = [];
    const parts = text.split(/^## [^\n]*\n+<!-- pp:turn (.*?) -->[ \t]*$/m);
    for (let i = 1; i < parts.length; i += 2) {
      let info = {};
      try {
        info = JSON.parse(parts[i]);
      } catch (e) {}
      const sec = sections(parts[i + 1] || "");
      const fences = [...(sec.raw || "").matchAll(/^(`{4,})text\n([\s\S]*?)\n\1$/gm)].map((f) => f[2]);
      turns.push({
        at: info.at || "",
        profile: info.profile || "",
        tags: info.tags || [],
        notes: info.notes || [],
        error: info.error,
        secs: info.secs,
        data: info.data || {},
        you: dropHeading(sec.you || ""),
        reply: dropHeading(sec.ai || ""),
        thinking: (sec.think || "").replace(/^\s*<details><summary>Thinking<\/summary>\s*/, "").replace(/\s*<\/details>\s*$/, ""),
        sent: fences[0] ?? "",
        raw: fences[1] ?? "",
      });
    }
    return { path, meta, turns };
  };

  window.ChatFile = { toMd, fromMd, parseFront, stamp, messageTags };
})();
