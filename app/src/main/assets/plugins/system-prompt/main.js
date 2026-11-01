// System prompt plugin: put the system prompt in front of the message.
PP.plugin({
  beforeSend(text, ctx) {
    const s = ctx.settings;
    if (!s.prompt.trim()) return text;
    if (s.when === "first" && !ctx.firstMessage) return text;
    return s.wrap.replace("{prompt}", s.prompt).replace("{message}", text);
  },
  // The block shows a short preview of the prompt next to its switch.
  renderBlock(ctx) {
    const p = ctx.settings.prompt.trim();
    return ctx.pill(p ? "System: " + (p.length > 18 ? p.slice(0, 18) + "…" : p) : "System prompt (empty)");
  },
});
