// Page report: outlines the AI page so a site plugin's selectors can be fixed.
// The walk runs inside the AI page (PP.site("run")); a site plugin's own
// report (its site script's probe) wins when it has one.

// Runs in the AI page. PP = the page helpers, site = the site plugin's selectors.
const walker = (PP, site) => {
  let box = PP.lastReplyEl(site) || document.body;
  for (let up = 0; up < 4 && box.parentElement && box.parentElement !== document.body; up++) box = box.parentElement;
  const lines = [];
  const walk = (el, depth) => {
    if (lines.length > 700 || depth > 14) return;
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
    const attrs = ["id", "role", "aria-label", "aria-expanded", "data-testid"].filter((a) => el.getAttribute(a)).map((a) => `[${a}=${el.getAttribute(a)}]`).join("");
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 50);
    lines.push("  ".repeat(depth) + el.tagName.toLowerCase() + cls + attrs + (own ? `  "${own}"` : ""));
    for (const c of el.children) if (!/^(svg|script|style|path)$/i.test(c.tagName)) walk(c, depth + 1);
  };
  lines.push("== around the newest reply ==");
  walk(box, 0);
  // The message box and its buttons, where sending happens.
  let inp = PP.first(site.input);
  if (inp) {
    for (let up = 0; up < 5 && inp.parentElement && inp.parentElement !== document.body; up++) inp = inp.parentElement;
    lines.push("", "== around the message box ==");
    const before = lines.length;
    walk(inp, 0);
    if (lines.length > before + 250) lines.length = before + 250;
  } else lines.push("", "== message box: not found with the plugin's input selectors ==");
  // Open panels, drawers and dialogs, and thinking outside the reply.
  const found = [...document.querySelectorAll("[role=dialog], [class*='drawer' i], [class*='panel' i], [class*='modal' i], [class*='popover' i], [class*='think' i], [class*='reason' i]")]
    .filter((el) => el.getClientRects().length && !box.contains(el) && PP.textOf(el).length > 20);
  const outer = found.filter((el) => !found.some((o) => o !== el && o.contains(el)));
  if (outer.length) {
    lines.push("", "== open panels and thinking elsewhere ==");
    for (const el of outer.slice(0, 4)) walk(el, 0);
  }
  return { url: location.href, report: lines.join("\n") };
};

const copyReport = async () => {
  let r = await PP.site("probe");
  if (!r.report) r = await PP.site("run", { code: "return (" + walker.toString() + ")(PP, site);" });
  const name = PP.sitePlugin?.name || "the site";
  // PP.copy works after the wait for the page (the browser's clipboard doesn't).
  await PP.copy(`Page report for ${name} (${r.url})\n\n${r.report}`, "Page report copied. Paste it to whoever fixes the site plugin.");
};

PP.plugin({
  // Entries in the ⋯ menu (shown even when the plugin is switched off).
  menu: [{ label: "Copy page report (to fix a site)", run: copyReport }],
});
