"use strict";
// App part: sending. The page pool (parallel site pages), the per-chat queue,
// runChat (one message through the profile's plugins to the site and back),
// PP.ask (askSite) and the model/switch choices set on the page.

// ---------- page pool ----------
// Each send takes a free site page and gives it back when done; when all are
// busy it waits its turn. A chat never has two sends at once.
const pageCount = () => Math.max(1, Math.min(4, +S.config.pages || 1));
const setPageCount = (n) => {
  S.config.pages = Math.max(1, Math.min(4, +n || 1));
  saveConfig();
  return api("/api/site/pages", { count: S.config.pages }).then(pump, (e) => toast(e.message, "error"));
};
const waiting = [];
// want: { page } for that exact page, or { url } to prefer a page already there.
const acquire = (want = {}) => new Promise((res) => (waiting.push({ want, res }), pump()));
const pump = () => {
  for (let k = 0; k < waiting.length; k++) {
    const { want, res } = waiting[k];
    const free = [...Array(pageCount()).keys()].filter((i) => !pg(i).busy);
    const ok = want.page != null ? free.filter((i) => i === want.page) : free;
    if (!ok.length) continue;
    const at = (f) => ok.find((i) => f(pg(i).url || ""));
    const i = (want.url && (at((u) => sameUrl(u, want.url)) ?? at((u) => sameHost(u, want.url)))) ?? ok[0];
    pg(i).busy = true;
    waiting.splice(k--, 1);
    res(i);
  }
  renderStatus();
};
const release = (i) => {
  pg(i).busy = false;
  pump();
};
const busyPages = () => [...Array(pageCount()).keys()].filter((i) => pg(i).busy).length;
const sameHost = (a, b) => {
  try {
    return new URL(a).host === new URL(b).host;
  } catch (e) {
    return false;
  }
};
// Load the profile's site in the background (the app starts on a blank page),
// so it is ready to log in to or send to.
const warmSite = () => {
  const s = siteFor();
  if (!s || S.site.busy || sameHost(S.site.url || "", s.url)) return Promise.resolve();
  const url = S.chat?.meta.source && sameHost(S.chat.meta.source, s.url) ? S.chat.meta.source : s.url;
  const page = S.page;
  return api("/api/site/open", { url, page })
    .then((r) => {
      Object.assign(pg(page), { connected: true, url: r.url, title: r.title });
      render();
    })
    .catch(() => {});
};
const showSite = () => {
  if (!siteFor()) return toast("Install an AI site plugin first (⋯ → Plugins)", "error");
  // Show the page the open chat is being answered on, if any.
  const t = Object.values(S.pageTurns).find((x) => S.chat?.turns.includes(x));
  if (!t) warmSite();
  return api("/api/app/action", t ? { action: "site", page: t.page } : { action: "site" }).catch((e) => toast(e.message, "error"));
};

// Model and switches chosen in the app (saved per profile) are set on the page
// before sending, when the page shows something else.
// Returns the profile's own object, so changes to it are saved with the profile.
const choicesFor = (prof = profile()) => {
  const ss = (prof.siteSettings = prof.siteSettings || {});
  ss.model = ss.model || "";
  ss.switches = ss.switches || {};
  return ss;
};
const applySiteChoices = async (site, prof, page = S.page, turn = null) => {
  const want = choicesFor(prof);
  if (!want.model && !Object.keys(want.switches).length) return;
  const cur = await api("/api/site", { cmd: "info", site, page });
  if (want.model && !(cur.model || "").toLowerCase().includes(want.model.toLowerCase())) {
    if (turn) turn.progress = "Choosing " + want.model + "…";
    else S.progress = "Choosing " + want.model + "…";
    render();
    const r = await api("/api/site", { cmd: "setModel", site, page, model: want.model });
    pg(page).model = r.model;
  }
  for (const [name, on] of Object.entries(want.switches)) {
    if ((site.switches || []).some((x) => x.name === name)) await api("/api/site", { cmd: "setSwitch", site, page, name, on });
  }
};

// A short vibration when a reply arrives, so you know without looking.
const haptic = () => api("/api/app/action", { action: "haptic" }).catch(() => {});

const rememberPrompt = (text) => {
  const list = (local("recent") || []).filter((t) => t !== text);
  list.unshift(text);
  local("recent", list.slice(0, 5));
};

// A chat's sends go one after another (several chats run side by side).
const chatQueues = new WeakMap();
const oneAtATime = (chat, fn) => {
  const prev = chatQueues.get(chat) || Promise.resolve();
  const run = prev.then(fn, fn);
  chatQueues.set(chat, run.catch(() => {}));
  return run;
};

// Send one message in `chat` through the profile's plugins and save the turn.
// follow: don't send; take the reply the site is already giving (Check / Add
// from page), on `onPage` (the shown page unless given).
// Messages sent while one is on its way wait in the chat's queue (shown under
// the chat, where they can be edited or taken out) and go out in order.
const runChat = (chat, prompt, prof = profile(), follow = false, onPage = null) => {
  const q = follow ? null : { you: prompt, at: iso() };
  if (q) (chat.queued = chat.queued || []).push(q);
  if (q && S.chat === chat) render();
  return oneAtATime(chat, async () => {
    if (q) {
      const k = chat.queued.indexOf(q);
      if (k < 0) throw Object.assign(new Error("taken out of the queue"), { quiet: true });
      chat.queued.splice(k, 1);
    }
    // A plugin may choose the profile and the site chat for this message.
    const route = follow ? null : await runRoute({ chat, prompt, profile: prof }, prof).catch((e) => (toast("route: " + e.message, "error"), null));
    // plugins: "active" keeps the steps (Base64 ...) of the profile you're on;
    // the routed profile then only gives the site and model.
    const hookProf = prof;
    if (route && route.profile) prof = S.config.profiles.find((p) => p.id === route.profile || p.name.toLowerCase() === String(route.profile).toLowerCase()) || prof;
    const site = siteFor(prof);
    if (!site) throw new Error("this profile has no AI site plugin (Profiles sheet)");
    // Where to send: the route's choice, else the chat's link, else a fresh site chat.
    // A link to another site than the profile's (a switched profile) starts fresh.
    let target = route && route.url ? (route.url === "new" ? site.url : route.url) : chat.meta.source || site.url;
    if (!sameHost(target, site.url)) target = site.url;
    const turn = { at: iso(), you: prompt, sent: "", raw: "", reply: "", profile: prof.name, tags: [], notes: [], data: {}, pending: true, progress: "Waiting for a free site page…" };
    if (route) turn.notes.push(`${pluginName(route.by)} chose ${route.url === "new" ? "a new site chat" : route.url || "the profile " + prof.name}`);
    chat.turns.push(turn);
    const trace = [{ label: "You", text: prompt, notes: [] }];
    S.traces.set(turn, trace);
    render();
    const page = await acquire(follow ? { page: onPage ?? S.page } : { url: target });
    turn.page = page;
    S.pageTurns[page] = turn;
    turn.progress = "";
    render();
    try {
      // Be on this chat's page on the site, or on a fresh chat for a new one.
      // (When following, stay on whatever the page shows now.)
      const here = pg(page).url;
      if (follow) {
      } else if (!sameUrl(here, target)) await openSite(target, page, turn);
      if (!follow) await applySiteChoices(site, prof, page, turn);
      const steps = route && route.plugins === "active" ? hookProf : prof;
      // A brand-new site chat (new chat or new sub-chat) hasn't seen any
      // first-message setup yet (system prompt "first message only" ...).
      const freshSite = !follow && sameUrl(target, site.url);
      const ctx = { chat, turn, page, url: pg(page).url, profile: steps, siteProfile: prof, firstMessage: chat.turns.length === 1 || freshSite, freshSite, notes: turn.notes };
      turn.sent = prompt ? await inHooks(() => buildMessage(prompt, ctx, trace, steps)) : "";
      turn.progress = (follow ? "Reading the reply on " : "Sending to ") + site.name + (pageCount() > 1 ? ` (page ${page + 1})` : "") + "…";
      render();
      const started = Date.now();
      const w = S.config.wait || {};
      const idleMs = (+w.idleMin || 0) * 60000;
      const maxMs = (+w.maxMin || 0) * 60000;
      // The app itself waits as long as the page may (a week when there is no limit).
      const r = await api("/api/site", { cmd: follow ? "follow" : "send", site, page, text: turn.sent, idleMs, maxMs, timeout: maxMs ? maxMs + 60000 : 7 * 86400000 });
      if (follow && !prompt) {
        // Added from the page: your side is whatever the page shows, decoded like a reply.
        turn.sent = r.you || "";
        turn.you = r.you ? await inHooks(() => runHooks("afterReply", r.you, { ...ctx, notes: [] }, [], steps)).catch(() => r.you) : "(from the page)";
        turn.notes.push("added from the page");
      }
      ctx.url = r.url; // afterReply sees the site chat the reply came from
      turn.secs = Math.max(1, Math.round((Date.now() - started) / 1000));
      turn.raw = r.raw;
      if (r.thinking) turn.thinking = r.thinking;
      trace.push({ label: "Raw reply", text: r.raw, notes: [] });
      try {
        turn.reply = await inHooks(() => runHooks("afterReply", r.raw, ctx, trace, steps));
      } catch (e) {
        turn.reply = r.raw;
        turn.error = e.message;
        trace.push({ label: "Error", text: e.message, error: true, notes: [] });
      }
      Object.assign(pg(page), { connected: true, url: r.url, title: r.title, model: r.model });
      if (!sameUrl(r.url, site.url)) chat.meta.source = r.url;
      else if (chat.meta.source && !sameHost(chat.meta.source, site.url)) chat.meta.source = ""; // the old link was another site
      chat.meta.ai = site.name;
      if (r.model) chat.meta.model = r.model;
      chat.meta.profile = prof.name;
      if (!chat.meta.title || chat.meta.title === "New chat") chat.meta.title = (turn.you || "Chat").split("\n")[0].slice(0, 60);
      delete turn.pending;
      turn.tags = tagsForNewMessage(chat);
      await saveChat(chat, `chat: ${chat.meta.title} (#${chat.turns.length})`, [tagsFile()]);
      haptic();
      markUnseen(chat, turn);
      return turn;
    } catch (e) {
      // Nothing came back: the message moves to the chat's failed list (not
      // saved to the file), where it can be retried, checked or edited.
      chat.turns.splice(chat.turns.indexOf(turn), 1);
      (chat.failed = chat.failed || []).push({ you: prompt, error: e.message, at: turn.at, page });
      throw e;
    } finally {
      if (S.pageTurns[page] === turn) delete S.pageTurns[page];
      delete turn.progress;
      delete turn.live;
      release(page);
      render();
    }
  });
};

// Plugin hooks that run while a page is held. PP.ask from inside them needs a
// second page, or it would wait for itself forever.
let hookDepth = 0;
const inHooks = async (fn) => {
  hookDepth++;
  try {
    return await fn();
  } finally {
    hookDepth--;
  }
};

// PP.ask: a side request for plugins, in a fresh chat on its own page; not
// saved as a chat. opts: { profile: name, hooks: true to run the profile's plugins }.
const askSite = async (prompt, opts = {}) => {
  const prof = S.config.profiles.find((p) => opts.profile && p.name.toLowerCase() === String(opts.profile).toLowerCase()) || profile();
  const site = siteFor(prof);
  if (!site) throw new Error("PP.ask: this profile has no AI site plugin");
  if (hookDepth > 0 && pageCount() === 1) throw new Error("PP.ask inside a plugin step needs 2 or more site pages (Settings › Site pages at once)");
  const page = await acquire({ url: site.url });
  try {
    const quiet = {}; // progress of side requests isn't shown under the message box
    await openSite(site.url, page, quiet);
    await applySiteChoices(site, prof, page, quiet);
    const ctx = { chat: null, profile: prof, firstMessage: true, notes: [] };
    const text = opts.hooks ? await inHooks(() => buildMessage(prompt, ctx, [], prof)) : prompt;
    const w = S.config.wait || {};
    const maxMs = (+w.maxMin || 0) * 60000;
    const r = await api("/api/site", { cmd: "send", site, page, text, idleMs: (+w.idleMin || 0) * 60000, maxMs, timeout: maxMs ? maxMs + 60000 : 7 * 86400000 });
    Object.assign(pg(page), { connected: true, url: r.url, title: r.title, model: r.model });
    const reply = opts.hooks ? await inHooks(() => runHooks("afterReply", r.raw, ctx, [], prof)) : r.raw;
    return { reply, raw: r.raw, thinking: r.thinking || "", url: r.url, page };
  } finally {
    release(page);
  }
};

on("start", async () => {
  if (pageCount() !== (S.app.pages || []).length) await setPageCount(pageCount());
});
on("ready", () => warmSite());
on("pluginInstalled", () => warmSite());
