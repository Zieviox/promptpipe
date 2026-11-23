"use strict";
// In each site's page: join the platform's port, run only the content scripts the app hands
// this page (S9: never code from the website), and answer the `site_*` calls with their stages.
// It reports the page's address as it changes, and whether the chat box shows (ready).
(() => {
  if (window.top !== window || window.__pp) return;
  window.__pp = true;
  let port = null;
  let stages = {};
  let cancelled = false;
  let provider = null;

  const send = (message) => port && port.postMessage(message);
  // Whether the app's site view is showing this page now (the screen says so with `site_shown`):
  // a provider never opens anything over the chat while you're looking.
  let shown = false;
  const helpers = {
    view_shown: () => shown,
    event_send: (name, data) => send({ type: "event", name, data }),
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    cancelled: () => cancelled,
  };

  // The handed scripts, in order; each returns the stages it adds or replaces. `PP.stages` is
  // every stage as it is now; `PP.defaults` the ones before this script (a provider's script
  // calls the default routine's through it).
  const script_run = (data) => {
    provider = data.provider;
    stages = {};
    for (const code of provider.scripts || []) {
      const added = new Function("PP", "provider", code)({ ...helpers, stages, defaults: { ...stages } }, provider);
      Object.assign(stages, added || {});
    }
    return { stages: Object.keys(stages) };
  };

  const call_run = async (m) => {
    const reply = { type: "reply", id: m.id };
    try {
      if (m.name === "script_run") reply.data = script_run(m.data);
      else if (m.name === "site_stop") (cancelled = true), (reply.data = {});
      else if (m.name === "site_shown") {
        shown = !!(m.data && m.data.shown);
        reply.data = stages.site_shown ? (await stages.site_shown(m.data, provider)) || {} : {};
      }
      else {
        const stage = stages[m.name];
        if (!stage) throw Object.assign(new Error(`${m.name} isn't in this page's scripts`), { code: "unimplemented" });
        if (m.name === "site_send") cancelled = false;
        const result = await stage(m.data, provider);
        reply.data = Array.isArray(result) ? { list: result } : result || {};
      }
    } catch (error) {
      reply.error = { code: error.code || "internal", message: String(error.message || error) };
    }
    send(reply);
  };

  let tries = 0;
  const connect = () => {
    try {
      port = browser.runtime.connectNative("pp");
    } catch (error) {
      return retry();
    }
    port.onDisconnect.addListener(() => ((port = null), retry()));
    port.onMessage.addListener((m) => m.type === "call" && call_run(m));
    send({ type: "hello", url: location.href, title: document.title });
  };
  const retry = () => ++tries < 40 && setTimeout(connect, Math.min(500 * tries, 5000));
  connect();

  // Single-page sites change the address without loading a page; and the chat box may show late.
  let last = { url: location.href, ready: null };
  setInterval(() => {
    const ready = !!(stages.ready_get && provider && stages.ready_get(provider));
    if (location.href !== last.url || ready !== last.ready) {
      last = { url: location.href, ready };
      helpers.event_send("page_changed", { url: last.url, title: document.title, ready });
    }
  }, 1500);
})();
