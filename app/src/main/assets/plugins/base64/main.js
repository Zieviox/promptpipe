// Base64 plugin: encode on the way out, decode on the way back.
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

// strict: throw on any damage. Otherwise decode what is there and report fixes.
const fromBase64 = (b64, strict) => {
  const fixes = [];
  let s = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(s)) {
    if (strict) throw new Error("base64 has invalid characters");
    s = s.replace(/[^A-Za-z0-9+/]/g, "");
    fixes.push("removed invalid characters");
  }
  if (s.length % 4 === 1) {
    if (strict) throw new Error("base64 is cut off (bad length)");
    s = s.slice(0, -1);
    fixes.push("dropped 1 stray character");
  }
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), fixes };
  } catch (e) {
    if (strict) throw new Error("decoded bytes are not valid UTF-8");
    fixes.push("some bytes were not valid UTF-8 (shown as �)");
    return { text: new TextDecoder("utf-8").decode(bytes), fixes };
  }
};

// Longest stretch of base64-looking words in the reply. Short words at its
// edges are dropped, so "Here it is" next to the base64 is not glued on.
const findBase64 = (text) => {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```[a-zA-Z0-9]*/g, " ");
  const groups = [];
  let cur = [];
  for (const w of cleaned.split(/\s+/)) {
    if (/^[A-Za-z0-9+/_=-]+$/.test(w)) cur.push(w);
    else if (cur.length) groups.push(cur), (cur = []);
  }
  if (cur.length) groups.push(cur);
  const trim = (g) => {
    let a = 0;
    while (a < g.length - 1 && g[a].length < 12) a++;
    return g.slice(a);
  };
  return groups.map(trim).sort((x, y) => y.join("").length - x.join("").length)[0] || [];
};

const badChars = (t) => (t.match(/[�\u0000-\u0008\u000E-\u001F]/g) || []).length;

const decode = (text, s, ctx) => {
  const words = findBase64(text);
  try {
    // Ordinary words are short; real base64 runs much longer.
    if (words.join("").length < 16) throw new Error("no base64 found in the reply");
    // Words right after the base64 (a short sign-off, a button label) can look
    // like base64 too and decode to garbage: try without up to 3 trailing words.
    let out = null;
    for (let cut = 0; cut <= Math.min(3, words.length - 1); cut++) {
      let o;
      try {
        o = fromBase64(words.slice(0, words.length - cut).join(""), s.strict);
      } catch (e) {
        if (cut === 0 && s.strict) throw e;
        continue;
      }
      if (cut) o.fixes.push(`left out ${cut} trailing word${cut > 1 ? "s" : ""}`);
      if (!out || badChars(o.text) < badChars(out.text)) out = o;
      if (!badChars(o.text)) break;
    }
    if (!out) throw new Error("the base64 in the reply doesn't decode");
    // The AI garbled only the very end: keep the clean text before it.
    const firstBad = out.text.search(/[�\u0000-\u0008\u000E-\u001F]/);
    if (!s.strict && firstBad > 0 && firstBad > out.text.length * 0.85) {
      out.text = out.text.slice(0, firstBad).replace(/[^\s.!?"')\]]*$/, "").trimEnd();
      out.fixes.push("dropped a garbled ending");
    }
    // Repairs can't save text that was never base64: refuse obvious garbage.
    const bad = (out.text.match(/[�\u0000-\u0008\u000E-\u001F]/g) || []).length;
    if (bad > Math.max(2, out.text.length * 0.03)) throw new Error("the reply doesn't decode to readable text (not base64?)");
    const wordy = (out.text.match(/[\p{L}\p{N}\s.,;:!?'"()-]/gu) || []).length;
    if (wordy < out.text.length * 0.6) throw new Error("the reply doesn't decode to readable text (not base64?)");
    if (out.fixes.length) ctx.note("repaired: " + out.fixes.join(", "));
    return out.text;
  } catch (e) {
    if (s.keepOnFail) {
      ctx.note("not decoded: " + e.message);
      return text;
    }
    throw e;
  }
};

PP.plugin({
  beforeSend(text, ctx) {
    const s = ctx.settings;
    if (s.encodePrompt) return `${s.instruction}\nMy message below is base64 encoded UTF-8; decode it first.\n\n${toBase64(text)}`;
    return `${s.instruction}\n\n${text}`;
  },
  afterReply(text, ctx) {
    return decode(text, ctx.settings, ctx);
  },
  // Shown under every AI message, even when the plugin is off.
  messageActions: [
    { label: "Decode base64", run: (text, ctx) => decode(text, { ...ctx.settings, keepOnFail: false }, ctx) },
  ],
});
