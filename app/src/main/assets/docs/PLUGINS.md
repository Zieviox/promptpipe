# Writing promptpipe plugins

A plugin is a folder in your plugin folder (`/sdcard/PromptPipe/plugins/<id>/`).
Add or edit one, then tap **Reload plugins** (Ctrl+Shift+R). No rebuild needed.

The whole app is plugins, apart from the browser and the bits that need the
phone (pages, files, git, the local server). Sending, chat files, history, the
local API and the chat screen itself are built-in plugins you can copy and
change: see [App parts](#app-parts). Plugin kinds:

| kind | what it is |
|---|---|
| (none) | steps: hooks on your messages and replies, a block, menu entries |
| `site` | an AI site: selectors, maybe a site script |
| `driver` | default page commands for every site |
| `theme` | a CSS file |
| `core` | an app part (sending, history, ...) |
| `ui` | the app's whole screen |

The quickest start is a built-in one: Plugins → **Copy** next to it puts an
editable copy in your folder. Your copy replaces the built-in one.

## The folder

```
plugins/
  shout/
    plugin.json   what it is, where its block goes, its settings
    main.js       the code (hooks)
```

## plugin.json

```json
{
  "id": "shout",
  "name": "Shout",
  "version": "1.0.0",
  "description": "Upper-cases the reply.",
  "main": "main.js",
  "block": { "place": "toggles", "label": "SHOUT" },
  "advanced": false,
  "settings": {
    "exclaim": { "type": "bool", "label": "Add !!!", "default": true },
    "suffix": { "type": "text", "label": "Text to add", "default": "" },
    "style": { "type": "select", "label": "Style", "options": { "up": "UPPER", "low": "lower" }, "default": "up" },
    "notes": { "type": "textarea", "label": "Notes", "default": "" },
    "times": { "type": "number", "label": "Times", "default": 1 },
    "picked": { "type": "hidden", "default": [] }
  }
}
```

- `id`: letters, digits, `-` and `_`. Same as the folder name.
- Setting types: `bool`, `text`, `textarea`, `select`, `number`, and `hidden`
  (any JSON value your plugin keeps itself, set with `ctx.set`; it isn't shown
  in the ⚙ form). Settings are saved per profile.
- `block.place`: `toggles` (the row above the message box, the default) or `top` (the top bar). `"block": false` means no block.
- `advanced: true` puts the block in the folded **Advanced** row.
- `settings` get a settings screen built for you (the ⚙ on the block). Add `help` for a hint line.

## main.js

```js
PP.plugin({
  // Before your message is sent. Return the new text.
  beforeSend(text, ctx) {
    return text;
  },
  // After the reply arrives. Return the new text (this is what you see and what is saved).
  afterReply(text, ctx) {
    const out = ctx.settings.style === "up" ? text.toUpperCase() : text.toLowerCase();
    return ctx.settings.exclaim ? out + "!!!" : out;
  },
  // Buttons under every reply, even when the plugin is off. run gets the raw reply.
  messageActions: [{ label: "Shout this", run: (raw, ctx) => raw.toUpperCase() }],
  // Entries in the ⋯ menu, even when the plugin is off.
  menu: [{ label: "Shout the last reply", run: () => PP.toast(PP.chat.turns.at(-1)?.reply.toUpperCase() || "nothing yet") }],
  // Before a message goes out: pick the profile and the site chat for it.
  // Return { profile: "name or id", url: "https://..." | "new" }, or nothing to
  // leave it. The first plugin (in order) that answers wins. Not run for
  // PP.ask or when taking a reply from the page.
  route(ctx) {
    return ctx.chat.turns.length > 40 ? { url: "new" } : null;
  },
  // Draw something above (or under) a message, like a divider. Return a node,
  // a list of nodes (drawn above), or { before, after }. Runs while the plugin is on.
  renderTurn(turn, i, ctx) {
    return ctx.turnData?.fresh ? ctx.h("hr", { title: "new site chat from here" }) : null;
  },
  // Optional: draw your own block. ctx.pill(label) is the standard switch.
  // ctx.set(key, value) saves one of this plugin's settings for the profile.
  renderBlock(ctx) {
    return ctx.pill(ctx.on ? "SHOUT on" : "shout");
  },
});
```

Hooks can be `async`. Throwing an error stops the message and shows the error.
Plugins that are on run in the order shown in the Plugins screen (move them with ↑ ↓).

`ctx` has:

- `settings`: this plugin's settings for the current profile
- `firstMessage`: true for the first message of a chat
- `chat`: the chat (`chat.meta.title`, `chat.meta.tags`, `chat.turns`)
- `profile`: the profile the message goes through
- `note(text)`: adds a note to the message's trace
- `turn`: the message being answered (`you`, `sent`, `raw`, `reply`, `at`, `data`)
- `page`: the site page it's on (0, 1, ...)
- `url`: the site chat's address (in `afterReply`, where the reply came from)
- `turnData`: what this plugin saved on this message, or `undefined`
- `setTurnData(value)`: save this plugin's own notes on the message (any JSON).
  They're stored in the chat file (`"data": { "<plugin id>": value }` in the
  message's `pp:turn` line) and come back as `ctx.turnData` / `turn.data[id]`.

`route(ctx)` gets `chat`, `prompt`, `profile` and `settings`;
`renderTurn(turn, i, ctx)` gets `chat`, `settings`, `turnData`, `h` and `render`.

```js
// Remember which site chat each message went to.
afterReply(text, ctx) {
  ctx.setTurnData({ url: ctx.url });
  return text;
},
```

### `PP` reference

| | |
|---|---|
| `PP.plugin(def)` | register this plugin's hooks |
| `PP.h(tag, props, ...children)` | make an element (`onclick`, `class`, `html` ...) |
| `PP.md(text)` | Markdown to HTML |
| `PP.toast(text, kind)` | a short message; `kind` `"error"` for errors |
| `PP.api(path, body)` | call the app (GET without body, POST with); see Where things are |
| `PP.site(cmd, extra)` | a command on the shown AI page: `info`, `models`, `setModel`, `last`, `list`, `run` ... |
| `PP.ask(prompt, opts)` | a side request in a fresh site chat (below) |
| `PP.sheet(title, render)` / `PP.render()` | your own screen; redraw |
| `PP.chat` / `PP.profile` | the open chat; the active profile |
| `PP.settings(id)` | another plugin's settings in the active profile |
| `PP.sitePlugin` | the active profile's site (`name`, `url`, selectors) |
| `PP.on(type, fn)` / `PP.emit(type, data)` | app events (below); your own events too |
| `PP.safe` | true in safe mode |

### App events: `PP.on`

`PP.on(type, fn)` runs `fn(event)` when the app says something. Types:
`start` and `ready` (at start), `plugins` (plugins loaded or reloaded),
`site` (a site page loaded or changed), `shown` (the site view switched page),
`job` (another app's request to the local API), `share` (text shared to the
app), `pluginInstalled`, `pluginBundle`. `PP.emit("my-plugin:thing", data)`
sends your own. Listeners go away when plugins reload, so register them in
main.js.

### Your own screens: `PP.sheet`

`PP.sheet(title, render)` opens a bottom sheet. `render()` returns an array of
elements (made with `PP.h`) and runs again whenever you call `PP.render()`, so
keep state in variables and redraw:

```js
let n = 0;
const open = () => PP.sheet("Counter", () => [
  PP.h("p", {}, `Tapped ${n} times`),
  PP.h("button", { class: "primary", onclick: () => (n++, PP.render()) }, "Tap"),
]);
```

The built-in System prompt plugin (stack + library) is a full example.

### Running code in the AI page

`await PP.site("run", { code })` runs `code` inside the AI page as
`new Function("PP", "site", code)`, with the page helpers (see Site scripts)
and the site plugin's selectors, and resolves to the object it returns. The
built-in **Page report** plugin works this way.

### Keeping files

Plugins can keep data as files in your history folder (git keeps every
version): read with `PP.api("/api/history/file?path=my-plugin.json")` (its
`text` is `null` when the file doesn't exist), write with
`PP.api("/api/history/save", { files: [{ path, text }], message })`.

### Side requests: `PP.ask`

`await PP.ask(prompt, { profile, hooks })` sends `prompt` in a fresh chat on
the site and resolves to `{ reply, thinking, url }`. It is not saved as a chat
and doesn't show up in the open one. Use it for jobs next to the main
conversation, like "summarise this into memory".

- `profile`: a profile name (default: the active one).
- `hooks: true` runs that profile's plugins on it too (off by default).
- It takes a free site page. Inside `beforeSend` / `afterReply` you need
  **Settings › Site pages at once** at 2 or more (the message being answered
  holds a page); with 1 page it fails with a clear error instead of hanging.
- Several `PP.ask` calls at once run in parallel, up to the page count.

```js
afterReply: async (text, ctx) => {
  PP.ask("Summarise in 3 lines:\n\n" + text).then((r) => PP.toast("Memory: " + r.reply.slice(0, 60)));
  return text; // don't wait for it
},
```

## AI sites

A site plugin has `"kind": "site"` and a `site` block instead of hooks:

```json
{
  "id": "my-ai",
  "name": "My AI",
  "version": "1.0.0",
  "kind": "site",
  "siteScript": "site.js",
  "site": {
    "url": "https://chat.example.com/",
    "input": ["textarea"],
    "send": ["button[type=submit]"],
    "stop": ["button[aria-label*='stop' i]"],
    "reply": [".markdown"],
    "user": [".user-message"],
    "chatLinks": ["a[href*='/chat/']"],
    "model": [".model-name"],
    "thinking": [".reasoning"]
  },
  "settings": { "replySelector": { "type": "text", "label": "Reply selector (tried first)", "default": "" } }
}
```

Each list holds CSS selectors, tried in order. `input` is the message box,
`send` the send button (without one, Enter is pressed), `stop` is visible while
the AI is still writing, `reply` matches one reply (the newest is used),
`user` matches one of your own messages (used to import a chat's history),
`chatLinks` the chats in the site's sidebar, `model` where the model name shows,
`thinking` the model's reasoning box (kept as a foldable "Thinking" part).
If no `send` selector matches, the last button after the message box is pressed.

To find them: on the phone, open a chat on the site with a reply on screen, then
⋯ → **Copy page report**. It copies an outline of the page around the newest reply
(tags, classes, a bit of text), enough to pick selectors. On a computer, use the
browser's inspector.

### Site scripts

When selectors are not enough, `siteScript` names a file that runs **inside
the AI page**. It gets helpers as `PP` and returns the commands it replaces:

```js
// site.js
return {
  // Replace sending. fallback() runs the normal selector based send.
  async send(text, site, fallback) {
    const r = await fallback();
    return { raw: r.raw.replace(/^Thinking.*\n/, "") };
  },
  last(site) { return { raw: PP.textOf(PP.first(site.reply)) }; },
  list(site) { return PP.all("nav a").map((a) => ({ url: a.href, title: PP.textOf(a) })); },
  info(site) { return { model: PP.textOf(PP.first([".model"])) }; },
};
```

Helpers: `all(sel)`, `first(selectors)`, `textOf(el)` (plain text),
`toMarkdown(el)` (the element as Markdown: bold, lists, headings, code,
tables), `sleep(ms)`, `typeInto(site, text)`, `waitReply(site, snapshot)`,
`snapshot(site)`, `lastReply(site)`, `lastReplyEl(site)`, `lastThinking(site)`,
`answerText(site, el)` (the reply as Markdown, without thinking inside it),
`list(site)`, `info(site)`, `status(text, live)`.
`site.settings` holds the site plugin's settings. `send` may also return
`thinking`.

Replies are read as Markdown, so return `PP.answerText(site, el)` rather than
`PP.textOf(el)` to keep formatting.

`status(text, { thinking, reply })` updates the line under a reply that's on
its way; with `thinking` and/or `reply` the app shows them live (thinking open,
the reply so far under it). The built-in wait does this for you.

With several site pages (Settings › Site pages at once) each page runs its own
copy of your script; nothing to change.

### Site drivers

A plugin with `"kind": "driver"` and a `siteScript` replaces the default page
commands for **every** site: same script shape as above. Order: the site
plugin's own script first, then drivers, then the built-in defaults. Use it to
change how sending or waiting works everywhere without copying each site
plugin. Drivers show under Settings › App parts.

## Themes

A theme is a plugin with `"kind": "theme"` and a CSS file:

```json
{ "id": "my-theme", "name": "My theme", "version": "1.0.0", "kind": "theme", "css": "theme.css" }
```

```css
/* theme.css: set the colour variables, add any other CSS you like */
:root {
  --bg: #0b0c0f; --raise: #14161b; --raise2: #1b1e25; --hair: #23262e;
  --text: #e6e7ea; --muted: #8b909c; --faint: #5d626d;
  --accent: #8f9cff; --accent-bg: #8f9cff1f; --ok: #6fd3a0; --err: #ff8a8a; --warn: #e7c46a;
}
```

Pick it in Settings → Look (also UI scale there, or Ctrl+= / Ctrl+-).
Paper and Ember are built-in examples.

## App parts

The app itself is built-in plugins with `"kind": "core"` (and one `"kind": "ui"`):

| id | part | gives (top-level names) |
|---|---|---|
| `core-markdown` | Markdown to HTML | `mdToHtml` |
| `core-chatfile` | the chat file format | `ChatFile.toMd`, `fromMd`, `parseFront` |
| `core-send` | page pool, queue, sending, `PP.ask` | `runChat`, `askSite`, `acquire`, `release`, `pageCount`, `setPageCount`, `warmSite`, `showSite`, `applySiteChoices` ... |
| `core-history` | chat files, folders, git, tags | `newChat`, `openChat`, `saveChat`, `startNewChat`, `moveChat`, `deleteChat`, `loadTree`, tag functions ... |
| `core-jobs` | other apps' requests (local API) | `runJob` (on the `job` event) |
| `chat-ui` | the whole screen | see The UI below |

Under them is the core (`/ui/core.js`, not a plugin): `S` (all state:
`S.config`, `S.chat`, `S.chats`, `S.plugins`, `S.pages` ...), `h`, `api`,
`toast`, `PP`, `on`/`emit`, plugin settings (`profile()`, `settingsFor`,
`siteFor`, `runHooks`, `runRoute`), and `siteCmd`/`openSite`.

How parts load:

```json
{ "id": "core-send", "name": "Sending", "version": "1.0.0", "kind": "core", "order": 20, "scripts": ["send.js"], "css": [] }
```

- They load once, at start, before anything shows, in `order` (low first).
  They're plain scripts sharing one scope: what a part declares at top level
  (`const runChat = ...`) the parts after it, and the UI, use directly. Start
  each file with `"use strict";`.
- A part does its startup in `on("start", fn)` (load data) and
  `on("ready", fn)` (after all parts started), not at top level.
- To change one: Settings › App parts › **Copy**, edit it in your plugin
  folder, then **Restart app** (parts don't reload with Reload plugins). Keep
  the names the other parts use (the table above); add what you like.
- A new part needs no built-in to replace: give it a new id and an `order`.

### The UI

The `"kind": "ui"` plugin is everything you see. It assigns the core's
screen functions (they start as do-nothing versions):

`render()`, `renderStatus()`, `openSheet(title, render)`, `rerenderSheet()`,
`closeDrawer()`, `scrollDown()`, `fillComposer(text, mode)`,
`markUnseen(chat, turn)`, and optionally `toast(text, kind)`. Draw into `app`
(the `#app` element).

A whole working screen, as an example:

```js
// plugins/mini-ui/ui.js  (plugin.json: { "id": "mini-ui", "name": "Mini UI",
//   "version": "1.0.0", "kind": "ui", "scripts": ["ui.js"] })
"use strict";
render = () => {
  const box = h("textarea", { rows: 3, placeholder: "Message" });
  const send = () => runChat(S.chat, box.value).catch((e) => e.quiet || toast(e.message, "error"));
  app.replaceChildren(
    h("h1", {}, S.chat.meta.title),
    ...S.chat.turns.map((t) => h("div", {}, h("p", {}, h("b", {}, "You: "), t.you), h("div", { html: mdToHtml(t.reply || t.progress || "…") }))),
    box,
    h("button", { onclick: send }, "Send"),
  );
};
renderStatus = () => render();
on("ready", () => render());
```

With more than one UI plugin installed, Settings › App parts › **App screen**
picks which one runs (restart to switch). Copying `chat-ui` and changing it
is the easy way to restyle or rearrange the built-in screen.

### Safe mode

If a part of yours fails to load, the app restarts in **safe mode**: only
built-in plugins, with a banner and a note saying which one failed. Fix or
remove it, then **Leave safe mode**. Settings › App parts › **Restart in safe
mode** does it by hand (the address is `/?safe=1`).

## Plugin updates

Each release carries a plugin bundle, `promptpipe-plugins-<version>.zip`:
`bundle.json` plus one folder per plugin. The app downloads it from the latest
release (once a day at start, or Settings › App parts › **Update plugins**) and
uses a plugin from it when its version is newer than the built-in one. Your
own plugins folder still wins, and safe mode uses only what came with the app.
Restart the app after an update.

If the download fails: **Download the zip**, then **Install the zip** (or
Plugins › Install from a file): a bundle is recognised and installed whole.
Make one with `sh scripts/plugin-bundle.sh <version>` in the repo.

## Plugin guides

A plugin can carry its own guide: put a `GUIDE.md` in its folder. Every file
in a plugin's folder is served at `/plugins/<id>/<file>`, so the plugin can
show it with `fetch("/plugins/<id>/GUIDE.md")` and `PP.md` in a sheet.
Built-in guides:

- **Memory**: [plugins/memory/GUIDE.md](/plugins/memory/GUIDE.md) (levels of
  detail, the `.memory/` files, Sub-chats)
- **Sub-chats**: [plugins/sub-chats/GUIDE.md](/plugins/sub-chats/GUIDE.md)
  (new site chats inside a chat; a full example of `route`, turn data and
  `renderTurn`)

Plugins can share pure helpers on `PP`: Sub-chats sets `PP.subChats`
(`segments(chat)`, ...) and Memory sets `PP.memory` (`plan`, `lodFromMd`, ...).

## Installing someone else's plugin

Plugins → **Install from a file** and pick a `.zip` (with a `plugin.json`
inside) or a lone `plugin.json`. Or paste a link → **Install**. Accepted links:

- a GitHub folder: `https://github.com/user/repo/tree/main/plugins/shout`
- a `plugin.json` URL (the files named in `main`, `siteScript`, `css` and `files` are fetched next to it)
- a `.zip` with a `plugin.json` inside

Or copy the folder into your plugin folder yourself (Termux:
`cp -r shout /sdcard/PromptPipe/plugins/`) and Reload.

## Where things are

- `/sdcard/PromptPipe/plugins/` your plugins
- `/sdcard/PromptPipe/config.json` profiles and plugin settings (plain JSON)
- `/sdcard/PromptPipe/history/` chats as Markdown, a git repository; a chat's
  `.memory/<chat path>/` folder is for plugins' files about it (hidden from the
  chat list, moved and deleted with the chat)

App routes plugins can call with `PP.api`: `/api/app`, `/api/config`,
`/api/plugins` (`?builtin=1`), `/api/plugins/install` `{url}`,
`/api/plugins/update` `{repo, force}`, `/api/plugins/bundle`,
`/api/history/tree`, `/api/history/file?path=`, `/api/history/save`
`{files, moves, delete, message}`, `/api/site` `{cmd, site, page}`,
`/api/site/open` `{url, page}`, `/api/site/pages` `{count}`,
`/api/app/action` `{action: "site" | "openUrl" | "haptic" | "pickPlugin" ...}`.
