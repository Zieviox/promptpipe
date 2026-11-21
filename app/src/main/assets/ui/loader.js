"use strict";
// The loader: the one port each way. It routes each call to whoever answers it (the core over
// HTTP, the platform over the extension's port, the application in this page), carries events,
// holds the one State, loads the plugins in order (safe mode: the built-in ones only), runs hooks,
// and gives plugins `PP`.

(() => {
  const params = new URLSearchParams(location.search);
  const SAFE = params.has("safe");
  const CORE_CALLS = [
    "file_read",
    "file_write",
    "file_move",
    "file_delete",
    "file_list",
    "file_find",
    "catalogue_verify",
    "plugin_list",
    "plugin_write",
    "plugin_remove",
    "log_read",
  ];
  const calls = {}; // the application's calls: name → handler(data, state)
  const listeners = {}; // event name → handlers
  const hooks = {}; // plugin id → { hook name → function }
  const content = {}; // "plugin/file" → text, for content files (prose, data)
  const waiting = {}; // envelope id → { resolve, reject }
  let platform_calls = ["app_get"];
  let state = { plugins: [], sends: [], pages: [], turns: [], loaded: [], drafts: [], changes: [] };
  let redraw = () => {};
  let next = 0;

  const id_create = () =>
    `${Date.now().toString(36)}${(next += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const error_build = (code, message) => Object.assign(new Error(message), { code });

  // ---------- the port ----------

  // A call to the platform (or a page through it) goes over the extension's relay in this page.
  const port_send = (envelope) => window.postMessage({ pp: "out", envelope }, location.origin);

  // An application call that changes records answers { state, targets }: it's applied and saved
  // here (committed under the call's name), and the caller gets the rest of the answer.
  const answer_apply = async (name, answer) => {
    if (answer && answer.error) throw error_build(answer.error.code, answer.error.message);
    if (!answer || !answer.state || !answer.targets) return answer;
    await PP.record_apply(() => answer, name.replace(/_/g, " "));
    const { state: _state, targets: _targets, ...rest } = answer;
    return rest.record ?? rest;
  };

  const call_send = async (name, data = {}) => {
    if (calls[name]) return answer_apply(name, await calls[name](data, state));
    if (CORE_CALLS.includes(name)) {
      const r = await fetch("/call", {
        method: "POST",
        body: JSON.stringify({ type: "call", name, data, id: id_create() }),
      });
      const reply = await r.json();
      if (reply.error) throw error_build(reply.error.code, reply.error.message);
      return reply.data;
    }
    if (!platform_calls.includes(name) && !name.startsWith("site_")) {
      throw error_build("unimplemented", `${name} is not supported on this platform`);
    }
    const id = id_create();
    return new Promise((resolve, reject) => {
      waiting[id] = { resolve, reject };
      port_send({ type: "call", name, data, id });
    });
  };

  const event_on = (name, handler) => (listeners[name] ||= []).push(handler);

  const event_send = (name, data) => {
    for (const handler of listeners[name] || []) {
      Promise.resolve()
        .then(() => handler(data))
        .catch((e) => console.error(name, e));
    }
    if (name === "job_changed") {
      fetch("/event", { method: "POST", body: JSON.stringify({ type: "event", name, data }) });
    }
  };

  // What comes in over the relay: replies to our calls, events, and calls to the screen (Back).
  window.addEventListener("message", async (m) => {
    if (m.source !== window || !m.data || m.data.pp !== "in") return;
    const e = m.data.envelope;
    if (e.type === "reply" && waiting[e.id]) {
      const { resolve, reject } = waiting[e.id];
      delete waiting[e.id];
      return e.error ? reject(error_build(e.error.code, e.error.message)) : resolve(e.data);
    }
    if (e.type === "event") return event_send(e.name, e.data);
    if (e.type === "call") {
      const reply = { type: "reply", id: e.id };
      try {
        reply.data = await call_send(e.name, e.data);
      } catch (error) {
        reply.error = { code: error.code || "internal", message: error.message };
      }
      port_send(reply);
    }
  });

  // The core's event stream (job_received); the browser reconnects it by itself.
  const stream_open = () => {
    const stream = new EventSource("/events");
    stream.onmessage = (m) => {
      const e = JSON.parse(m.data);
      event_send(e.name, e.data);
    };
  };

  // ---------- the State ----------

  const state_get = () => state;
  const state_set = (change) => {
    state = change(state);
    redraw(state);
    return state;
  };

  // ---------- hooks ----------
  // Hooks inside a send run for the plugins whose block is on in the chat's profile, in the
  // profile's order, each output feeding the next; the others run for every plugin that has one.

  const SEND_HOOKS = ["chat_route", "block_text", "send_before", "reply_after"];

  const hook_get = (plugin, name) => (hooks[plugin] || {})[name];

  const active_list = (context) => {
    if (!PP.profile_get) return [];
    const chat = context.chat || null;
    const profile = PP.profile_get(state, chat);
    const blocks = state.config.blocks.filter(
      (b) => b.profile === profile.id && b.type === "plugin",
    );
    return [...new Set(blocks.filter((b) => PP.block_on_get(state, chat, b)).map((b) => b.plugin))];
  };

  const hook_run = async (name, input, context = {}) => {
    const ids = SEND_HOOKS.includes(name) ? active_list(context) : Object.keys(hooks);
    let value = input;
    for (const id of ids) {
      const hook = hook_get(id, name);
      if (!hook) continue;
      const out = await hook(value, { ...context, plugin: id });
      if (name === "chat_route" && out) return out;
      if (Array.isArray(input)) value = [...value, ...[].concat(out || [])];
      else if (out !== undefined && name !== "chat_route") value = out;
    }
    return value;
  };

  // ---------- plugins ----------

  const PP = {
    call_send,
    event_on,
    event_send,
    state_get,
    state_set,
    hook_run,
    hook_get,
    id_create,
    safe: SAFE,
    time_get: () => new Date().toISOString(),
    time_offset_get: () => -new Date().getTimezoneOffset(),
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    content_read: (plugin, file) => content[`${plugin}/${file}`] ?? "",
    redraw_set: (fn) => (redraw = fn),
  };
  window.PP = PP;

  const file_fetch = async (id, file) => {
    const r = await fetch(`/plugins/${id}/${file}${SAFE ? "?safe=1" : ""}`);
    if (!r.ok) throw new Error(`${id}/${file} wasn't found`);
    return r.text();
  };

  // One plugin's files: scripts run in their own scope with their own `PP` (UC42.6), styles
  // join the page, everything else is content to read.
  const plugin_load = async (plugin) => {
    const own = Object.create(PP);
    own.plugin_set = (def) => {
      Object.assign(PP, def.functions || {});
      Object.assign(calls, def.calls || {});
      for (const [name, handler] of Object.entries(def.events || {})) event_on(name, handler);
      hooks[plugin.id] = { ...(hooks[plugin.id] || {}), ...(def.hooks || {}) };
      // Commands join the screen's menus, Find and keys; sheets are opened by name.
      const commands = (def.commands || []).map((c) => ({
        place: plugin.manifest.name,
        ...c,
        plugin: plugin.id,
      }));
      PP.plugin_commands = [...(PP.plugin_commands || []), ...commands];
      PP.plugin_sheets = { ...(PP.plugin_sheets || {}), ...(def.sheets || {}) };
    };
    const page_files = [].concat(plugin.manifest.content_script || []);
    for (const file of plugin.manifest.files || []) {
      if (page_files.includes(file)) continue;
      if (file.endsWith(".css")) {
        const link = Object.assign(document.createElement("link"), {
          rel: "stylesheet",
          href: `/plugins/${plugin.id}/${file}`,
        });
        document.head.append(link);
      } else if (file.endsWith(".js")) {
        new Function(
          "PP",
          `${await file_fetch(plugin.id, file)}\n//# sourceURL=${plugin.id}/${file}`,
        )(own);
      } else content[`${plugin.id}/${file}`] = await file_fetch(plugin.id, file);
    }
    // The content script's files run in site pages, never here: kept as content to hand over.
    for (const file of page_files)
      content[`${plugin.id}/${file}`] = await file_fetch(plugin.id, file);
  };

  // The app's own plugins first, in their order, then the others. A failing plugin of yours among
  // the app's own restarts in safe mode, naming it (UC33); any other one is marked failed.
  const plugin_list_load = async () => {
    const list = (await call_send("plugin_list")).filter(
      (p) => p.manifest && (!SAFE || p.copy === "built_in"),
    );
    const runtime = (p) => (p.manifest.tags || []).includes("runtime");
    list.sort(
      (a, b) => runtime(b) - runtime(a) || (a.manifest.order ?? 50) - (b.manifest.order ?? 50),
    );
    const loaded = [];
    for (const plugin of list) {
      try {
        if (!plugin.changed_outside) await plugin_load(plugin);
        loaded.push({ ...plugin, status: plugin.changed_outside ? "changed_outside" : "loaded" });
      } catch (error) {
        if (runtime(plugin) && plugin.copy === "yours" && !SAFE) {
          location.replace(
            `/?safe=1&failed=${encodeURIComponent(`${plugin.id}: ${error.message}`)}`,
          );
          return null;
        }
        loaded.push({ ...plugin, status: "failed", error: error.message });
      }
    }
    return loaded;
  };

  // The platform answers app_get when there is one (a desktop browser has none: B5).
  const start = async () => {
    try {
      const app = await Promise.race([
        call_send("app_get").catch(() => ({})),
        PP.pause(3000).then(() => ({})),
      ]);
      platform_calls = app.calls || [];
      state = { ...state, app: { ...app, safe_mode: SAFE, failed: params.get("failed") || "" } };
      const plugins = await plugin_list_load();
      if (!plugins) return;
      state = { ...state, plugins };
      stream_open();
      if (PP.state_load) state = await PP.state_load(state);
      if (PP.app_start_run) PP.app_start_run(state).catch((e) => console.error(e));
      redraw(state);
    } catch (error) {
      // Never a blank page (R8): the reason, Retry, and safe mode.
      const app = document.getElementById("app");
      app.innerHTML =
        '<p style="padding:24px"></p><p style="padding:0 24px"><a href="/">Retry</a> · <a href="/?safe=1">Open in safe mode</a></p>';
      app.firstChild.textContent = `Could not start: ${error.message}`;
    }
  };

  start();
})();
