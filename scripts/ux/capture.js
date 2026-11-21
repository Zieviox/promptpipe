// Captures the UX/UI reference for the remake: a screenshot of every screen and state of the
// current app, in light and dark, on a phone-sized screen. Runs its own stand-in (port 7797, data
// in build/ux-capture-data) with seeded chats, folders, tags, profiles and prompts.
//
//   node scripts/ux/capture.js [out-folder|-] [state,state]   default: design/ux, every state; needs Playwright
//
// PP_PLUGINS=<folder> as for standin.js. Prints each shot, and the ones that couldn't be taken.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

const ROOT = path.join(__dirname, "../..");
const PORT = 7797;
const DATA = path.join(ROOT, "build/ux-capture-data");
const OUT = path.resolve(process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : path.join(ROOT, "design/ux"));
const ONLY = process.argv[3] ? process.argv[3].split(",") : null; // capture only these states
const REPO = process.env.PP_PLUGINS || path.join(ROOT, "../promptpipe-plugins");

const REPLY = [
  "Here is a short answer with **bold**, a list and some code.",
  "",
  "1. First point",
  "2. Second point",
  "",
  "```js",
  "const greet = (name) => `Hello, ${name}`;",
  "```",
  "",
  "| Option | Effect |",
  "|---|---|",
  "| Fast | Shorter replies |",
].join("\n");

// [name, what to do before the shot]. Each starts from the chat with nothing open.
const SHOTS = [
  ["chat-empty", async (p) => p.evaluate(() => startNewChat())],
  ["chat", async () => {}],
  ["chat-composer-big", async (p) => p.evaluate(() => toggleExpand())],
  ["chat-message-menu", async (p) => p.evaluate(() => openMessageMenu(S.chat, S.chat.turns[0], 0))],
  ["chat-select-text", async (p) => p.evaluate(() => openSelect(S.chat.turns[0]))],
  ["chat-info", async (p) => p.evaluate(() => openChatSheet())],
  ["chat-history", async (p) => p.evaluate(() => openHistorySheet())],
  ["chat-move", async (p) => p.evaluate(() => openMoveSheet())],
  ["drawer", async (p) => p.evaluate(() => openDrawer())],
  ["drawer-select", async (p) => p.evaluate(() => (openDrawer(), (S.selMode = true), (S.sel = new Set()), render()))],
  ["drawer-site-chats", async (p) => p.evaluate(() => openSiteChats())],
  ["find", async (p) => p.evaluate(() => openFind("hello"))],
  ["provider-menu", async (p) => p.evaluate(() => providerMenu())],
  ["provider-sheet", async (p) => p.evaluate(() => openProviderSheet())],
  ["models", async (p) => p.evaluate(() => openModels())],
  ["quick-edit", async (p) => p.evaluate(() => openQuick())],
  ["site-view", async (p) => p.evaluate(() => ((S.sv = true), render()))],
  ["profiles-new", async (p) => p.evaluate(() => openNewProfile())],
  ["profile-editor", async (p) => p.evaluate(() => openProfileEditor(S.config.activeProfile))],
  ["profile-add-block", async (p) => p.evaluate(() => openAddBlock())],
  ["profile-block-page", async (p) => p.evaluate(() => openBlockPage(profile().blocks[0]))],
  ["profile-groups", async (p) => p.evaluate(() => openGroups())],
  ["profile-preview", async (p) => p.evaluate(() => openPreview())],
  ["profile-import", async (p) => p.evaluate(() => openImportProfile())],
  ["prompt-library", async (p) => p.evaluate(() => openPromptLibrary())],
  ["prompt-page", async (p) => p.evaluate(() => openLibPrompt(PP.profiles.library.prompts[0].id))],
  ["prompt-editor", async (p) => p.evaluate(() => openLibEditor(PP.profiles.library.prompts[0].id))],
  ["plugins", async (p) => p.evaluate(() => openPlugins())],
  ["plugins-catalogue", async (p) => p.evaluate(() => openGetPlugins())],
  ["plugins-providers", async (p) => p.evaluate(() => openGetProviders())],
  ["plugins-install", async (p) => p.evaluate(() => openInstall())],
  ["plugins-add-source", async (p) => p.evaluate(() => openAddSource())],
  ["plugins-guide", async (p) => p.evaluate(() => openPluginGuide())],
  ["plugin-page", async (p) => p.evaluate(() => openPluginPage("memory"))],
  ["plugin-settings", async (p) => p.evaluate(() => openPluginSettings("memory"))],
  ["settings", async (p) => p.evaluate(() => openSettings())],
  ["settings-look-accent", async (p) => p.evaluate(() => openAccent())],
  ["settings-waiting", async (p) => p.evaluate(() => openWaiting())],
  ["settings-folder", async (p) => p.evaluate(() => openFolderPicker())],
  ["settings-git", async (p) => p.evaluate(() => openGit())],
  ["settings-api-token", async (p) => p.evaluate(() => openApiToken())],
  ["settings-api-how", async (p) => p.evaluate(() => openApiHow())],
  ["settings-storage-check", async (p) => p.evaluate(() => openStorageCheck())],
  ["settings-core-log", async (p) => p.evaluate(() => openCoreLog())],
  ["help-menu", async (p) => p.evaluate(() => openHelp())],
  ["help-mode", async (p) => p.evaluate(() => ((S.help = true), render()))],
  ["quick-start-list", async (p) => p.evaluate(() => openQuickStartList())],
  ["tour-setup", async (p) => p.evaluate(() => startTour("setup"))],
  ["tour-chat", async (p) => p.evaluate(() => startTour("chat"))],
  ["settings-look", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Look"); }],
  ["settings-sites", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Sites"); }],
  ["settings-storage", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Chats and storage"); }],
  ["settings-import-export", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Import and export"); }],
  ["settings-local-api", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Local API"); }],
  ["settings-advanced", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Advanced"); }],
  ["settings-help", async (p) => { await p.evaluate(() => openSettings()); await p.waitForTimeout(300); await p.evaluate((label) => { const el = [...document.querySelectorAll("button, a, [role=button]")].find((e) => e.textContent.trim().startsWith(label) && e.getClientRects().length); if (!el) throw new Error("no item " + label); el.click(); }, "Help"); }],
  ["drawer-folder-open", async (p) => p.evaluate(() => (S.openFolders.add("food"), openDrawer()))],
  ["dialog-confirm", async (p) => { await p.evaluate(() => { window.__pending = askConfirm("Delete the chat \u201cTrip ideas\u201d? It stays in git history."); }); }],
  ["dialog-text", async (p) => { await p.evaluate(() => { window.__pending = askText("Tag for this message", "", "Add"); }); }],
  ["toast-error", async (p) => p.evaluate(() => toast("Not sent: the page did not finish loading", "error"))],
  ["chat-failed", async (p) => p.evaluate(() => ((S.chat.failed = [{ you: "and the budget?", error: "DeepSeek refused the message: \"Content too long\"", at: new Date().toISOString(), page: 0 }]), render()))],
  ["chat-queued", async (p) => p.evaluate(() => ((S.chat.queued = [{ you: "also add a museum", at: new Date().toISOString() }, { you: "and a restaurant", at: new Date().toISOString() }]), render()))],
  ["chat-streaming", async (p) => p.evaluate(() => { S.chat.turns.push({ at: new Date().toISOString(), you: "one more idea?", sent: "", raw: "", reply: "", profile: "Default", tags: [], notes: [], data: {}, pending: true, progress: "Writing\u2026", thinking: "Thinking about a third option" }); const t = S.chat.turns[S.chat.turns.length - 1]; t.reply = "A day hike to the lakes, with"; render(); })],
];

let standin = null;
process.on("unhandledRejection", (e) => {
  console.error(String(e && e.stack || e).slice(0, 1500));
  if (standin) standin.kill();
  process.exit(1);
});

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  standin = spawn(process.execPath, [path.join(__dirname, "standin.js")], { env: { ...process.env, PP_PORT: String(PORT), PP_DATA: DATA }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((ok) => standin.stdout.on("data", (d) => String(d).includes("stand-in on") && ok()));
  console.log("stand-in up");
  const base = `http://127.0.0.1:${PORT}`;
  fs.cpSync(path.join(REPO, "deepseek"), path.join(DATA, "plugins", "deepseek"), { recursive: true });
  const config = { welcomed: true, seen: { setup: true, chat: true, list: true, plugins: true }, provider: "deepseek" };
  await fetch(base + "/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: devices["Pixel 7"].userAgent });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(base + "/");
  await page.waitForFunction(() => window.PP && PP.profiles && PP.profiles.library.loaded, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  console.log("app loaded");

  // Seed: prompts, blocks, chats (one long with tags, one in a folder, one pinned), a counter tag.
  await page.evaluate(async (reply) => {
    const P = PP.profiles;
    const lib = P.library.prompts;
    lib.push(P.newLibPrompt ? P.newLibPrompt("Tone", "Be friendly and brief.") : { id: "sp1", name: "Tone", text: "Be friendly and brief." });
    lib.push(P.newLibPrompt ? P.newLibPrompt("Format", "Use short lists.") : { id: "sp2", name: "Format", text: "Use short lists." });
    if (P.saveLibrary) await P.saveLibrary();
    const prof = profile();
    const at = prof.blocks.findIndex((b) => b.type === "message");
    prof.blocks.splice(Math.max(0, at), 0, P.promptBlock("Master", "Answer in English."), P.linkedBlock(lib[0].id));
    saveConfig();
    const mk = async (title, folder, turns, tags = []) => {
      const c = newChat(folder);
      c.meta.title = title;
      c.meta.provider = "deepseek";
      c.meta.ai = "DeepSeek";
      for (const [you, r, thinking] of turns) c.turns.push({ at: new Date().toISOString(), you, sent: you, raw: r, reply: r, thinking: thinking || "", profile: prof.name, tags: [...tags], notes: [], data: {} });
      await saveChat(c, "seed: " + title);
      return c;
    };
    await mk("Trip ideas", "", [["hello, plan a weekend trip", reply, "The user wants a short plan. I'll list two options."], ["make it cheaper", "Take the train and stay in a hostel.", ""]], ["travel", "part1"]);
    await mk("Recipe notes", "food", [["a quick pasta recipe?", "Boil pasta, toss with garlic, oil and chili.", ""]]);
    const pinned = await mk("Work plan", "", [["summarise my week", "Three meetings, one deadline on Friday.", ""]]);
    if (typeof setPinned === "function") setPinned([pinned.path], true);
    if (typeof loadTree === "function") await loadTree();
    await openChat(S.chats.find((c) => c.meta.title === "Trip ideas").path);
  }, REPLY);
  console.log("seeded");
  await page.waitForTimeout(600);

  fs.mkdirSync(OUT, { recursive: true });
  const reset = () => page.evaluate(() => {
    S.sheet = null; S.drawer = false; S.sv = false; S.help = false; S.helpCard = null; S.selMode = false; S.expanded = false; S.providerMenu = false;
    if (S.tour !== undefined) S.tour = null;
    if (S.chat) { delete S.chat.failed; delete S.chat.queued; S.chat.turns = S.chat.turns.filter((t) => !t.pending); }
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    document.querySelectorAll(".ask-wrap, #toasts > *").forEach((el) => el.remove()); // the app's own dialogs, toasts
    render();
  });
  const failed = [];
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, setup] of SHOTS.filter(([n]) => !ONLY || ONLY.includes(n))) {
      try {
        await reset();
        if (name !== "chat-empty") await page.evaluate(async () => { const c = S.chats.find((x) => x.meta.title === "Trip ideas"); if (c && S.chat?.path !== c.path) await openChat(c.path); });
        await setup(page);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`) });
        if (scheme === "light") console.log("shot " + name);
      } catch (e) {
        failed.push(scheme + " " + name + ": " + String(e.message || e).split("\n")[0].slice(0, 140));
      }
    }
  }
  const total = SHOTS.filter(([n]) => !ONLY || ONLY.includes(n)).length * 2;
  console.log(`\n${total - failed.length} of ${total} screenshots taken (light and dark) in ${OUT}`);
  if (failed.length) console.log("Not captured:\n  " + failed.join("\n  "));
  if (errors.length) console.log("Page errors:\n  " + [...new Set(errors)].join("\n  "));
  await browser.close();
  standin.kill();
})();
