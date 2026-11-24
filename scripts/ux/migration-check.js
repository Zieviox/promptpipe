// Checks that what an older app saved comes over to the words of 2026-11-20: a config with a
// profile's "pipe" of rows (pieces, steps, the System prompt plugin's stack), presets, "site" and
// "switches", the System prompt plugin's library file, and a chat file with "site:" and "switches:".
// Runs its own stand-in (port 7796, data in build/ux-migration-data) and prints PASS/FAIL.
//
//   node scripts/ux/migration-check.js    needs Playwright; PP_PLUGINS=<folder> as for standin.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "../..");
const PORT = 7796;
const DATA = path.join(ROOT, "build/ux-migration-data");
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log((ok ? "PASS " : "FAIL ") + name + (detail && !ok ? "  (" + detail + ")" : ""));
};

// legacy: what the app saved before the rename
const OLD_CONFIG = {
  activeProfile: "p1",
  site: "deepseek",
  siteSettings: { deepseek: { model: "", switches: { DeepThink: true } } },
  startersSet: 2,
  rowsPruned: true,
  welcomed: true,
  quickstart: { setup: true, chat: true, list: true, plugins: true },
  ui: { part: "chat-ui", scale: 1, theme: "", mode: "", accent: "", text: 16, enterSends: false },
  presets: [{ id: "mine", name: "My starter", groups: [], rows: [{ type: "piece", id: "pcX", name: "Mine", text: "Starter text.", when: "every" }, { type: "message" }] }],
  profiles: [
    {
      id: "p1",
      name: "Default",
      plugins: [
        { id: "base64", on: false, settings: { encodePrompt: false } },
        { id: "system-prompt", on: true, settings: { stack: ["sp1", "sp2"], when: "every" } },
        { id: "memory", on: true, settings: { every: 2 } },
      ],
      pipe: {
        groups: [{ id: "g1", name: "Rules", on: true }],
        rows: [
          { type: "piece", id: "pc1", name: "Master", text: "Be brief.", when: "every", n: 5, group: "", on: true },
          { type: "step", plugin: "system-prompt", on: true, scope: "above", group: "g1" },
          { type: "step", plugin: "memory", on: true, scope: "above", group: "" },
          { type: "step", plugin: "memory", part: "recent", on: false, group: "" },
          { type: "message" },
          { type: "step", plugin: "base64", on: false, scope: "pick", pick: ["pc1", "message"], group: "" },
        ],
      },
    },
  ],
};
const OLD_LIBRARY = { prompts: [{ id: "sp1", name: "Tone", text: "Friendly." }, { id: "sp2", name: "Format", text: "Use lists." }] };
const OLD_CHAT = `---
title: Old chat
source: https://chat.deepseek.com/a/chat/s/abc
site: deepseek
ai: DeepSeek
model:
profile: Default
switches: memory=off pc1=on
tags: []
created: 2026-11-01T10:00:00.000Z
updated: 2026-11-01T10:00:00.000Z
---

# Old chat
`;

(async () => {
  const standin = spawn(process.execPath, [path.join(__dirname, "standin.js")], { env: { ...process.env, PP_PORT: String(PORT), PP_DATA: DATA }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((ok) => standin.stdout.on("data", (d) => String(d).includes("stand-in on") && ok()));
  const base = `http://127.0.0.1:${PORT}`;
  // The stand-in emptied its data folder on start: put the old files in, then the old config.
  fs.writeFileSync(path.join(DATA, "history", "system-prompts.json"), JSON.stringify(OLD_LIBRARY));
  fs.writeFileSync(path.join(DATA, "history", "old-chat.md"), OLD_CHAT);
  await fetch(base + "/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(OLD_CONFIG) });
  // The providers have to be there for "provider" to survive (they come from the plugins repo).
  for (const id of ["deepseek"]) {
    const repo = process.env.PP_PLUGINS || path.join(ROOT, "../promptpipe-plugins");
    fs.cpSync(path.join(repo, id), path.join(DATA, "plugins", id), { recursive: true });
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  try {
    await page.goto(base + "/");
    await page.waitForFunction(() => window.PP && PP.profiles && PP.profiles.library.loaded, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const prof = S.config.profiles[0];
      return {
        config: { provider: S.config.provider, providerSettings: S.config.providerSettings, site: S.config.site, siteSettings: S.config.siteSettings, presets: S.config.presets, templates: (S.config.templates || []).map((t) => t.id), ui: S.config.ui },
        prof: { blocks: prof.blocks, groups: prof.groups, pluginSettings: prof.pluginSettings, plugins: prof.plugins, pipe: prof.pipe },
        lib: PP.profiles.library.prompts.map((p) => p.id),
        preview: PP.profiles.previewMessage(prof, { first: true }),
        options: choicesFor("deepseek").options,
      };
    });
    const b = r.prof.blocks;
    check("config: site becomes provider", r.config.provider === "deepseek" && r.config.site === undefined, JSON.stringify(r.config.provider));
    check("config: siteSettings becomes providerSettings", !!r.config.providerSettings?.deepseek && r.config.siteSettings === undefined);
    check("config: a provider's switches become options", r.options && r.options.DeepThink === true, JSON.stringify(r.options));
    check("config: ui.part becomes ui.screen", r.config.ui.screen === "chat-ui" && r.config.ui.part === undefined, JSON.stringify(r.config.ui));
    check("config: presets become templates (yours kept, shipped ones refreshed)", !r.config.presets && r.config.templates.includes("mine") && r.config.templates.includes("plain"), JSON.stringify(r.config.templates));
    check("profile: pipe becomes blocks and groups", !r.prof.pipe && Array.isArray(b) && r.prof.groups[0]?.id === "g1");
    check("profile: a piece becomes a System prompt block, same id and text", b[0]?.type === "prompt" && b[0].id === "pc1" && b[0].text === "Be brief.", JSON.stringify(b[0]));
    const linked = b.filter((x) => x.type === "prompt" && x.link);
    check("profile: the System prompt plugin's stack becomes linked blocks, in order, in its group", linked.map((x) => x.link).join() === "sp1,sp2" && linked.every((x) => x.when === "every" && x.group === "g1"), JSON.stringify(linked));
    check("profile: the System prompt plugin itself is gone", !b.some((x) => x.plugin === "system-prompt") && !r.prof.pluginSettings["system-prompt"]);
    check("profile: a plugin's part becomes a text block", b.some((x) => x.type === "plugin" && x.plugin === "memory" && x.textId === "recent" && x.on === false));
    check("profile: plugins' settings kept", r.prof.pluginSettings.memory?.every === 2 && r.prof.pluginSettings.base64?.encodePrompt === false && !r.prof.plugins, JSON.stringify(r.prof.pluginSettings));
    check("profile: a pick list kept", b.find((x) => x.plugin === "base64")?.pick?.join() === "pc1,message");
    check("library: moved to prompt-library.json", fs.existsSync(path.join(DATA, "history", "prompt-library.json")) && !fs.existsSync(path.join(DATA, "history", "system-prompts.json")) && r.lib.join() === "sp1,sp2");
    check("sending: the linked prompts go out", r.preview.includes("Be brief.") && r.preview.includes("Friendly.") && r.preview.includes("Use lists."), r.preview);
    // The old chat file
    const chat = await page.evaluate(async () => {
      await openChat("old-chat.md");
      const m = S.chat.meta;
      await saveChat(S.chat, "migration check");
      return { provider: m.provider, toggles: m.toggles, site: m.site, switches: m.switches };
    });
    const saved = fs.readFileSync(path.join(DATA, "history", "old-chat.md"), "utf8");
    check("chat file: site and switches are read as provider and toggles", chat.provider === "deepseek" && chat.toggles?.memory === false && chat.toggles?.pc1 === true, JSON.stringify(chat));
    check("chat file: saved with the new names", /^provider: deepseek$/m.test(saved) && /^toggles: /m.test(saved) && !/^site:|^switches:/m.test(saved), saved.slice(0, 300));
    check("no page errors", !errors.length, errors.join(" | "));
  } catch (e) {
    check("the run itself", false, String(e.message || e).slice(0, 400));
  } finally {
    await browser.close();
    standin.kill();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
