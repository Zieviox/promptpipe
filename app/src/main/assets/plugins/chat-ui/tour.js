"use strict";
// App part (chat screen): Quick start. Four short guides of three steps:
// welcome and log in (full screen, on first launch), chatting, the chat list and
// plugins. Each opens by itself the first time you reach its place, lights up
// the control to use, and moves on when you use it. Help › Quick start replays them.

const seen = () => (S.config.seen = S.config.seen || {});
const markSeen = (k) => ((seen()[k] = true), saveConfig());
const resetSeen = () => ((S.config.seen = {}), saveConfig());
const pinCount = () => (S.config.pinned || []).length;
const TRY = "Try it now: use the lit control";
// Where a step's control lives (the card's "Take me there").
const toChat = () => ((S.sheet = null), (S.drawer = false), (S.siteMenu = false), syncLayer());
const toList = () => ((S.sheet = null), (S.drawer = true), syncLayer());

// ---------- the guides, as data ----------
// A step: t (title), b (lines), sel (what to light up), hint, done (it was used),
// after (tidy up once done), next (the button's word), and for the welcome:
// choice (pick a site) and login (log in on it).
const GUIDES = {
  setup: { title: "Welcome and log in", sub: "Pick a site and log in", full: true, steps: [
    { t: "Welcome to PromptPipe", b: ["PromptPipe sends your messages to the AI chat sites you already use, and keeps every chat on your phone.", "Three quick steps to get going."], next: "Start" },
    { t: "Pick a site", b: ["A site is the AI chat PromptPipe talks to for you."], choice: true },
    { t: "Log in to your site", b: ["PromptPipe has no AI of its own. It uses the chat site for you, like you would. So you need to be logged in there."], login: true, note: "You log in on the site's own page, not in a PromptPipe form. Use an account you can afford to lose. Sites may limit automated use.", next: "Done" },
  ] },
  chat: { title: "Chatting", sub: "Send, find, quick edit", steps: [
    { t: "Say hello", b: ["Pick how the AI should help, then type a message and tap send. The reply shows up above, live."], starter: true, sel: ".comp", go: toChat, hint: "Try it now: type and send", done: (b) => S.chat.turns.length > b.turns },
    { t: "Find anything", b: ["Find searches your chats and every setting, and lights up where each one lives."], sel: '[aria-label="Find chats and functions"]', go: toChat, hint: TRY, done: () => S.sheet?.title === "Find", after: closeSheet },
    { t: "Quick edit", b: ["This turns your profile's plugins on or off and reorders them, without leaving the chat."], sel: '[aria-label="Quick edit and add"]', go: toChat, hint: TRY, done: () => S.sheet?.id === "quick", after: closeSheet },
  ] },
  list: { title: "Chat list", sub: "Pin, select, search", steps: [
    { t: "Pin a chat", b: ["Pinned chats stay on top. Tap a pin."], sel: '#clist [data-ck^="c:"] .pb:not(.on)', go: toList, hint: TRY, done: (b) => pinCount() > b.pins || (S.chats.length > 0 && S.chats.every((c) => isPinned(c.path))) },
    { t: "Select several", b: ["Tap the check to pick many chats, then pin, move or delete them together. Drag handles move chats and folders."], sel: '[aria-label="Select chats"]', go: toList, hint: TRY, done: () => S.selMode, after: () => (endSelect(), render()) },
    { t: "Search", b: ["Type a name or a #tag."], sel: "#cs", go: toList, hint: "Try it now: type a letter", done: () => !!(S.query || "").length },
  ] },
  plugins: { title: "Plugins", sub: "Updates and repos", steps: [
    { t: "Open the Library", b: ["Plugins add sites and tools. A dot on Library means an update is waiting."], sel: ".tabs button:last-child", go: () => openPlugins("profile"), hint: TRY, done: () => S.sheet?.title === "Plugins" && LIB.tab === "library" },
    { t: "Update everything", b: ["Tap Update all. You can roll a plugin back later."], sel: '[data-row="library.updall"]', go: () => openPlugins("library"), hint: TRY, done: () => updateCount() === 0 },
    { t: "Plugins from friends", b: ["A repo is a list of plugins. A friend can send you a link. Tap Get plugins, then Sources."], warn: "Only add repos from people you trust. Plugins are code. They can read your chats. Never add one from a random site.", go: () => openPlugins("library"), sel: '[data-row="library.getp"]', hint: TRY, done: () => S.sheet?.title === "Get plugins" },
  ] },
};

// ---------- state ----------
// S.tour: { name, i, base } while a guide is open. base: counts when the step began.
S.tour = null;
const curStep = () => (S.tour ? GUIDES[S.tour.name].steps[S.tour.i] : null);
const enterStep = (i) => ((S.tour.i = i), (S.tour.advancing = false), (S.tour.base = { turns: S.chat.turns.length, pins: pinCount(), starters: S.config.profiles.length <= 1 }));
// beginTour only sets the state (a redraw is on its way); startTour also redraws.
const beginTour = (k) => {
  markSeen(k);
  S.tour = { name: k, i: 0, base: {} };
  enterStep(0);
};
const startTour = (k = "setup") => (beginTour(k), render());
const endTour = (msg) => {
  // The welcome ends back on the chat: its login step left you on the site view.
  if (S.tour?.name === "setup") ((S.config.welcomed = true), (S.sv = false), saveConfig());
  S.tour = null;
  stopLoginWatch();
  if (msg) toast(msg);
  render();
};
const goStep = (i) => (enterStep(i), render());
// A step that was used moves the guide on. Called on each redraw; the tidy-up
// and the next redraw run after this one.
const tourAdvance = () => {
  const d = curStep();
  if (!d || !d.done || !d.done(S.tour.base)) return;
  const G = GUIDES[S.tour.name];
  const last = S.tour.i >= G.steps.length - 1;
  if (S.tour.advancing) return; // a redraw before the move on must not queue it twice
  S.tour.advancing = true;
  const at = S.tour.i;
  setTimeout(() => {
    if (!S.tour || S.tour.i !== at) return; // the guide ended or moved on by hand meanwhile
    if (d.after) d.after();
    if (last) endTour(G.title + " guide done");
    else goStep(S.tour.i + 1);
  }, 0);
};

// The first visit to a place opens its guide (never over help or another guide).
const maybeTour = () => {
  if (S.tour || S.help || document.querySelector(".ask")) return; // never over help, a question or another guide
  if (S.config.welcomed && !seen().setup) seen().setup = true; // set up before the guides existed
  const top = S.sheet?.title;
  if (!seen().setup) beginTour("setup");
  else if (!seen().chat && !S.drawer && !S.sheet && !S.siteMenu && !S.sv) beginTour("chat");
  else if (!seen().list && S.drawer && !S.sheet && S.chats.length) beginTour("list"); // it needs a chat to pin
  else if (!seen().plugins && top === "Plugins") beginTour("plugins");
};

// ---------- the welcome's site and login ----------
const tourSite = { pick: null, login: 0 }; // login: 0 not yet, 1 waiting, 2 logged in
let loginTimer = 0;
const stopLoginWatch = () => (clearInterval(loginTimer), (loginTimer = 0));
// While you log in on the site, the page is asked whether its chat box shows.
const watchLogin = () => {
  stopLoginWatch();
  loginTimer = setInterval(async () => {
    if (!S.tour || tourSite.login !== 1) return stopLoginWatch();
    const site = siteFor();
    if (!site) return;
    try {
      const r = await api("/api/site", { cmd: "info", site, page: S.page });
      if (r.input) ((tourSite.login = 2), stopLoginWatch(), render());
    } catch (e) {} // the page is still loading
  }, 2000);
};
// The sites the official source offers (and the ones already here), then Later.
const siteChoices = () => {
  const src = srcList()[0];
  const c = catOf(src);
  if (!c.loaded && !c.busy) loadSource(src);
  const here = [...S.plugins.values()].filter(isSite).map((p) => ({ id: p.id, name: p.manifest.name || p.id, sub: "Installed" }));
  const offered = c.plugins.filter((e) => e.kind === "site" && !S.plugins.has(e.id)).map((e) => ({ id: e.id, name: e.name || e.id, sub: e.note || (e.default ? "Tested" : "Opt in"), offer: { src, entry: e } }));
  return { list: [...here, ...offered, { id: "", name: "Later", sub: "Add one in Settings › Sites" }], busy: c.busy, error: c.error };
};
// Picking a site installs it when it isn't here, and makes it this profile's site.
const pickSite = async (ch) => {
  tourSite.pick = ch.id;
  render();
  if (!ch.id) return;
  if (ch.offer) {
    const n = await installOffers([ch.offer], { quiet: true });
    if (!n) return toast("Couldn't get " + ch.name + ". Pick it again or choose Later.", "error");
  }
  setChatSite(ch.id);
  render();
};
const siteName = () => siteFor()?.name || "your site";

// ---------- the chatting guide's starter profile ----------
// A starter is a ready-made profile. Picking one makes it the active profile (made from the
// starter the first time, found by name after that). Plain is the profile you already have.
const STARTER_CHOICES = [
  { id: "plain", name: "Plain", sub: "Just your message" },
  { id: "feedback", name: "Writing feedback", sub: "An honest editor for your text" },
  { id: "dialogue", name: "Dialogue & Role play", sub: "Dialogue scenes, or the AI plays the world and every other character" },
  { id: "story", name: "Story & Prose", sub: "A co-writer for stories, with prose and dialogue craft" },
];
const starterProfile = (ch) => (ch.id === "plain" ? S.config.profiles[0] : S.config.profiles.find((p) => p.name === ch.name));
const pickStarter = (ch) => {
  const prof = starterProfile(ch) || PP.pipeline.makeProfile(ch.name, ch.id);
  if (prof.id !== profile().id) switchProfile(prof.id);
  else render();
};
const starterBody = () =>
  h("div", { style: "display:flex;flex-direction:column;gap:6px", role: "radiogroup", "aria-label": "Starter profile" },
    ...STARTER_CHOICES.map((ch) => {
      const on = starterProfile(ch)?.id === profile().id;
      return h("button", { class: "it", role: "radio", "aria-checked": String(on), onclick: () => pickStarter(ch) },
        h("span", { class: "on" }, on ? "●" : "○"), h("div", { class: "g" }, ch.name, h("small", {}, ch.sub)));
    }));

// ---------- drawing ----------
const tourDots = (G, i) =>
  h("div", { class: "chips", style: "justify-content:center" }, G.steps.map((x, k) =>
    h("button", { class: "tdot" + (k === i ? " on" : ""), "aria-label": "Step " + (k + 1) + " of " + G.steps.length, onclick: () => goStep(k) })));
const skipBtn = () => h("button", { class: "pill", onclick: () => endTour() }, "Skip guide");

const loginBody = () => {
  const name = siteName();
  const state = tourSite.login === 2 ? "Logged in" : tourSite.login === 1 ? "Waiting for you…" : "Not logged in";
  if (!siteFor()) return h("div", { class: "sub2" }, "No site yet. Add one any time in Settings › Sites, then log in there.");
  return h("div", { style: "display:flex;flex-direction:column;gap:10px" },
    ...["Tap “Open " + name + "”", "Log in like normal. Google, email, whatever the site offers.", "Come back here. That is it."].map((x, k) =>
      h("div", { style: "display:flex;gap:10px;align-items:center;font-size:16px" }, h("span", { class: "num" }, String(k + 1)), x)),
    h("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap" },
      h("button", { class: "it prim", style: "width:auto", onclick: () => ((tourSite.login = Math.max(1, tourSite.login)), watchLogin(), showSite(), render()) }, "Open " + name),
      tourSite.login === 1 ? h("button", { class: "pill", onclick: () => ((tourSite.login = 2), render()) }, "I am logged in") : null,
      h("span", { class: "ch" + (tourSite.login === 2 ? " on" : "") }, state)));
};

const tourBody = (G, i) => {
  const d = G.steps[i];
  const last = i === G.steps.length - 1;
  const full = G.full;
  const sites = d.choice ? siteChoices() : null;
  return [
    tourDots(G, i),
    h("div", { class: "sh", style: `font-size:${full ? 26 : 17}px;margin-top:${full ? 8 : 0}px` }, d.t),
    ...d.b.map((x) => h("p", { style: `margin:0 0 4px;font-size:${full ? 17 : 15}px` }, x)),
    sites
      ? h("div", { style: "display:flex;flex-direction:column;gap:6px", role: "radiogroup" },
          ...sites.list.map((ch) => h("button", { class: "it", role: "radio", "aria-checked": String(tourSite.pick === ch.id), onclick: () => pickSite(ch) },
            h("span", { class: "on" }, tourSite.pick === ch.id ? "●" : "○"), h("div", { class: "g" }, ch.name, h("small", {}, ch.sub)))),
          sites.busy ? h("div", { class: "sub2" }, "Loading the sites…") : null,
          sites.error ? h("div", { class: "sub2 error" }, "Couldn't load the list: " + sites.error + ". Install a site from a file later in Settings › Sites.") : null)
      : null,
    d.login ? loginBody() : null,
    d.starter && S.tour.base.starters ? starterBody() : null, // asked once: not when you have profiles of your own
    d.warn ? h("div", { class: "warnbox" }, d.warn) : null,
    d.note ? h("div", { class: "sub2" }, d.note) : null,
    d.hint ? h("div", { style: "color:var(--accent);font-weight:700;font-size:14px" }, d.hint) : null,
    h("div", { style: "display:flex;gap:6px;align-items:center;margin-top:4px" },
      skipBtn(), h("div", { style: "flex:1" }),
      i > 0 ? h("button", { class: "it", style: "width:auto", onclick: () => goStep(i - 1) }, "Back") : null,
      d.done
        ? h("button", { class: "pill", onclick: () => (d.after && d.after(), last ? endTour() : goStep(i + 1)) }, last ? "Finish" : "Skip step")
        : h("button", { class: "it prim", style: "width:auto", onclick: () => (last ? endTour(G.title + " guide done") : goStep(i + 1)) }, d.next || "Next")),
  ];
};

// While you are on the site's page to log in, a small card says whether it sees you in.
const loginCard = (G, i) => [
  tourDots(G, i),
  h("div", { class: "sh", style: "font-size:17px" }, "Log in on the site"),
  h("p", { style: "margin:0 0 4px;font-size:15px" }, "Log in like normal. PromptPipe tells you when it sees you are in."),
  h("div", { style: "display:flex;gap:8px;align-items:center;font-weight:700;color:" + (tourSite.login === 2 ? "var(--ok)" : "var(--accent)") },
    h("span", { class: "dot", style: "margin:0;background:" + (tourSite.login === 2 ? "var(--ok)" : "var(--muted)") }),
    tourSite.login === 2 ? "Logged in. I can see the chat box." : "Waiting for you to log in…"),
  h("div", { style: "display:flex;gap:6px;align-items:center;margin-top:4px" },
    skipBtn(), h("div", { style: "flex:1" }),
    tourSite.login === 2
      ? h("button", { class: "it prim", style: "width:auto", onclick: () => endTour("Logged in to " + siteName()) }, "Done")
      : h("button", { class: "pill", onclick: () => ((tourSite.login = 2), render()) }, "I am logged in")),
];

// The welcome fills the screen (once you went to log in, it says whether it sees
// you in); the other guides are a card that lets the lit control be used.
const tourLayer = () => {
  tourAdvance();
  const G = GUIDES[S.tour.name];
  const i = S.tour.i;
  const d = G.steps[i];
  // The site view covers the app and the real page sits in it: the welcome's login card goes
  // under the page (siteViewFoot) and any other guide waits until you are back.
  if (S.sv) return null;
  if (G.full) return h("div", { class: "layer tourl full" }, h("div", {}, ...(d.login && tourSite.login >= 1 && siteFor() ? loginCard(G, i) : tourBody(G, i))));
  return h("div", { class: "layer tourl pass" }, h("section", { class: "sheet", role: "dialog", "aria-label": "Quick start: " + d.t }, ...tourBody(G, i)));
};

// ---------- the spotlight ----------
// The lit control is on screen: it has a size, sits inside the window, and nothing covers it
// (a drawer or sheet over it counts as "not on screen": blocking then would trap every tap).
const tourTarget = () => {
  const d = curStep();
  const t = d && d.sel && document.querySelector(d.sel);
  if (!t) return null;
  const r = t.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) return null;
  const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(x, y);
  return top && (t.contains(top) || top.closest(".tourl")) ? t : null;
};
// Light up the step's control. If it isn't on screen nothing is dimmed or blocked: the card
// says so and offers "Take me there" (the step's `go`).
const tourSpot = () => {
  for (const el of document.querySelectorAll(".tourhl, .tourdim")) el.classList.contains("tourdim") ? el.remove() : el.classList.remove("tourhl");
  const d = curStep();
  if (!d || !d.sel || S.sv) return;
  // The control is scrolled into view once, when the step starts (it may be further down a list).
  const key = S.tour.name + S.tour.i;
  if (S.tour.scrolled !== key) {
    const raw = document.querySelector(d.sel);
    if (raw) ((S.tour.scrolled = key), raw.scrollIntoView({ block: "nearest" }));
  }
  const t = tourTarget();
  const lay = document.querySelector(".tourl");
  const card = lay && lay.querySelector(".sheet");
  if (!t) {
    if (card) {
      const note = h("div", { class: "tournote" }, "That control is not on this screen.", d.go ? h("button", { class: "pill", onclick: () => ((S.tour.scrolled = null), d.go(), render()) }, "Take me there") : null);
      card.insertBefore(note, card.lastElementChild);
    }
    return;
  }
  t.classList.add("tourhl");
  const r = t.getBoundingClientRect(), pad = 4;
  const x0 = r.left - pad, y0 = r.top - pad, x1 = r.right + pad, y1 = r.bottom + pad;
  // The dim is only a picture: a layer with a hole at the control, that never takes a tap.
  app.append(h("div", { class: "tourdim", style: `clip-path:polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${x0}px ${y0}px,${x0}px ${y1}px,${x1}px ${y1}px,${x1}px ${y0}px,${x0}px ${y0}px)` }));
  lay?.classList.toggle("ontop", (r.top + r.bottom) / 2 > innerHeight / 2); // a control low down: the card goes to the top
};
// Block by identity, never by screen area: while a step is lit, only the lit control and the
// card take taps. A step whose control isn't on screen blocks nothing.
const tourBlock = (e) => {
  if (!S.tour || S.sv) return;
  const t = tourTarget();
  if (!t || e.target.closest(".tourl") || t.contains(e.target)) return;
  e.stopPropagation();
  e.preventDefault();
};
for (const n of ["click", "pointerdown", "pointerup"]) document.addEventListener(n, tourBlock, true);
// Esc ends the guide.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.tour) { e.stopPropagation(); e.preventDefault(); endTour(); } }, true);

// ---------- Help › Quick start ----------
const openQuickStartList = () =>
  openSheet("Quick start", () => [
    ...Object.entries(GUIDES).map(([k, G]) =>
      item({ id: "qs.qs_" + k, label: G.title, sub: G.sub + " · 3 steps", right: seen()[k] ? "Seen" : "New", onclick: () => {
        S.dd = {};
        S.siteMenu = false;
        if (k === "plugins") return (openPlugins("profile"), startTour(k));
        S.sheet = null;
        S.drawer = k === "list";
        syncLayer();
        startTour(k);
      } })),
    item({ id: "qs.qsall", label: "Show every guide again", sub: "They open the first time you visit each place.", onclick: () => (resetSeen(), (S.config.welcomed = true), (seen().setup = false), closeSheet()) }),
  ], { back: () => openSettingsGroup("Help", settingsBody("Help")) });

// On the site view, while you log in: the card under the page says whether it sees you in.
siteViewFoot.push(() => {
  const d = curStep();
  return d && d.login && S.tour.name === "setup" && tourSite.login >= 1 && siteFor() ? h("section", { class: "svfoot" }, ...loginCard(GUIDES.setup, S.tour.i)) : null;
});
