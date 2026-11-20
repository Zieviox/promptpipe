# Writing promptpipe plugins

A plugin is a folder in your plugin folder (`/sdcard/PromptPipe/plugins/<id>/`).
Add or edit one, then tap **Reload plugins** (Ctrl+Shift+R). No rebuild needed.

The whole app is plugins, apart from the browser and the bits that need the
phone (pages, files, git, the local server). Sending, chat files, history, the
local API and the chat screen itself are built-in plugins you can copy and
change: see [Core plugins](#core-plugins).

## Words

Every plugin is a **plugin**. Its `tags` say what else it is:

| tag | what the plugin is |
|---|---|
| (none) | works on your messages and replies: a **block** of a profile, with a **toggle** |
| `provider` | drives one AI website (DeepSeek, Qwen): selectors, maybe a content script |
| `theme` | colours: a CSS file |
| `passive` | not a block, no toggle: it only adds menu entries (Page report) |
| `core` | part of the app itself (sending, history, ...); with `ui` too: the whole screen |
| `driver` | a content script with default page commands for every provider |

And the words around them:

- **Profile**: what goes to the provider with your message: an ordered list of
  **blocks**, top to bottom, plus its plugins' settings.
- **Block**: one line of a profile: a **System prompt** (your text, or a prompt
  **linked** from the prompt library), a plugin, or **Your message**.
- **Group**: several blocks under one toggle.
- **Toggle**: a block's on/off. A profile has the default; each chat keeps its own.
  A plugin's toggle can also sit in the header.
- **Template**: a ready-made profile a new one is copied from (Plain, Writing
  feedback, Dialogue & Role play, Story & Prose).
- **Prompt library**: the System prompts you keep. A linked block sends the
  library's text, so one edit there changes every profile that links it.
- **Options**: a provider's own settings on its page (DeepSeek's DeepThink and
  Search), set before each message.
- **Page**: one of the AI website's pages the app keeps open (several for
  replies at once). The **site** is the website itself.

The quickest start is a built-in plugin: Plugins → **Copy** next to it puts an
editable copy in your folder. Your copy replaces the built-in one.

## The folder

```
plugins/
  shout/
    plugin.json   what it is, its toggle, its settings
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
  "toggle": { "place": "toolbar", "label": "SHOUT" },
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
- `tags`: see [Words](#words). A plugin with none can be a block.
- Setting types: `bool`, `text`, `textarea`, `select`, `number`, and `hidden`
  (any JSON value your plugin keeps itself, set with `ctx.set`; it isn't shown
  in the ⚙ form). Settings are saved per profile.
- `toggle.place`: `toolbar` (the default: in Quick edit, next to the message box)
  or `header` (the top bar). `toggle.label` is its text.
- `settings` get a settings screen built for you (the ⚙ on the toggle). Add `help` for a hint line.
- `minApp` (optional): the oldest app version the plugin works with, e.g. `"0.7.0-alpha47"`.

## main.js

```js
PP.plugin({
  // Before your message is sent: text is everything above this plugin's block
  // in the profile (or only your message, or only the blocks picked, as the block says).
  // Return the new text.
  beforeSend(text, ctx) {
    return text;
  },
  // Or, instead of beforeSend: text of your own, put where your block is.
  // ctx.message is your message. Return "" to add nothing.
  text(ctx) {
    return ctx.settings.facts || "";
  },
  // Or named texts, each a block of its own (Add a block lists them). Memory works this way.
  texts: { facts: { name: "Facts", text: (ctx) => ctx.settings.facts || "" } },
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
  // leave it. Add plugins: "active" to keep the blocks of the profile you're on
  // (the routed profile then only gives the provider and model). The first plugin
  // (in block order) that answers wins. Not run for PP.ask or when taking a reply from the page.
  route(ctx) {
    return ctx.chat.turns.length > 40 ? { url: "new" } : null;
  },
  // Draw something above (or under) a message, like a divider. Return a node,
  // a list of nodes (drawn above), or { before, after }. Runs while the plugin is on.
  renderTurn(turn, i, ctx) {
    return ctx.turnData?.fresh ? ctx.h("hr", { title: "new site chat from here" }) : null;
  },
  // Optional: draw your own toggle. ctx.toggle(label) is the standard one;
  // ctx.flip() turns it on or off for this chat.
  // ctx.set(key, value) saves one of this plugin's settings for the profile.
  renderToggle(ctx) {
    return ctx.toggle(ctx.on ? "SHOUT on" : "shout");
  },
});
```

Hooks can be `async`. Throwing an error stops the message and shows the error.

### Profiles and blocks

What goes to the provider is built by the profile (Plugins › Profile, or Quick
edit next to the message box): its blocks, sent top to bottom.

- **System prompt**: text you wrote, or a prompt linked from the prompt library.
  *Send it*: every message, the first message of a site chat, every N messages
  (and the first), at depth N, or off. Empty ones aren't sent. *At depth N* puts
  it N messages up inside the earlier chat Memory sends (`ctx.depth`: a plugin
  that sends earlier messages places them and sets `ctx.depth.used = true`);
  otherwise it goes just before your message.
- **Plugin**: `beforeSend` changes everything above its block (or only your
  message, or only the blocks you pick: the block's *It changes* setting);
  `text()` puts its own text where its block is. `afterReply` hooks run in block
  order too.
- **Your message**: where your message goes. Move it like any block.
- **Groups**: one toggle for several blocks.

A profile owns its blocks: changing one never changes another, except through
the prompt library (a linked block). New profiles are copied from a template;
the app ships Plain, Writing feedback, Dialogue & Role play and Story & Prose.

`ctx` has:

- `settings`: this plugin's settings for the current profile
- `firstMessage`: true for the first message of a chat, and for the first
  message in a new site chat (a new sub-chat); `freshSite` is just the latter
- `chat`: the chat (`chat.meta.title`, `chat.meta.tags`, `chat.turns`)
- `profile`: the profile the message goes through; `routedProfile`: the one the
  provider and model came from (they differ when a `route` picked another)
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
| `PP.site(cmd, extra)` | a command on the shown AI page: `info`, `models`, `setModel`, `setOption`, `last`, `list`, `run` ... |
| `PP.ask(prompt, opts)` | a side request in a fresh site chat (below) |
| `PP.sheet(title, render)` / `PP.render()` | your own screen; redraw |
| `PP.chat` / `PP.profile` | the open chat; the active profile |
| `PP.settings(id)` | another plugin's settings in the active profile |
| `PP.provider` | the open chat's provider (`name`, `url`, selectors, options) |
| `PP.on(type, fn)` / `PP.emit(type, data)` | app events (below); your own events too |
| `PP.copy(text, done)` | copy through the app's clipboard (works after a wait, unlike `navigator.clipboard`); shows `done` ("Copied") or why it failed |
| `PP.confirm(text)` / `PP.askText(text, value)` | ask before something you can't undo / ask for a line of text; resolve to `true` / the text, or `null` (the app has no browser `confirm()`) |
| `PP.addPromptBlock(name, text)` | add a System prompt block (a copy of the text) to the active profile |
| `PP.profiles` | profiles, blocks and the prompt library: `templates()`, `previewMessage(profile)`, `blockName(b)`, `promptText(b)`, `library.prompts` ... |
| `PP.item(o)` | a row of a sheet, as the app draws them |
| `PP.morph(el, newEl)` | patch an element the way the screen is patched (below) |
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

The built-in Memory plugin's ☰ sheet is a full example.

A redraw patches the screen rather than rebuilding it: what `render()` returns
is compared with what is on screen and only the differences change. So a field
someone is typing in, a text selection, a scroll position or an opened fold
stays through `PP.render()` by itself. Three things follow:

- In a handler, act on the event's element (`e.currentTarget`, `e.target`) or
  find it on the page. An element you kept in a variable while building may be
  a thrown-away copy, because the one already on screen was kept. For form
  fields, the copy passes `value`, `checked`, the selection and `focus()` on to
  the kept field, so reading `input.value` when Save is tapped works.
- Give the items of a list that changes a key, `data-key` (or `data-row`), so
  each item is matched to itself.
- A value you render changes the field only when it differs from what you
  rendered last time, and never while the field has the focus: what someone
  typed is kept until you render a different value.

`data-own` marks an element whose children your own code updates (the app's
waiting reply works this way); `PP.morph(el, newEl)` patches one element the
same way the screen is patched.

### Running code in the AI page

`await PP.site("run", { code })` runs `code` inside the AI page as
`new Function("PP", "provider", code)`, with the page helpers (see Content
scripts) and the provider's description, and resolves to the object it returns.
The built-in **Page report** plugin works this way.

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
- `hooks: true` runs that profile's blocks on it too (off by default).
- It takes a free site page. Inside `beforeSend` / `afterReply` you need
  **Settings › Sites › Max replies at once** at 2 or more (the message being answered
  holds a page); with 1 page it fails with a clear error instead of hanging.
- Several `PP.ask` calls at once run in parallel, up to Max replies at once.

```js
afterReply: async (text, ctx) => {
  PP.ask("Summarise in 3 lines:\n\n" + text).then((r) => PP.toast("Memory: " + r.reply.slice(0, 60)));
  return text; // don't wait for it
},
```

## Providers

A provider is a plugin tagged `provider`, with a `provider` description instead of hooks:

```json
{
  "id": "my-ai",
  "name": "My AI",
  "version": "1.0.0",
  "tags": ["provider"],
  "contentScript": "content.js",
  "provider": {
    "url": "https://chat.example.com/",
    "input": ["textarea"],
    "send": ["button[type=submit]"],
    "stop": ["button[aria-label*='stop' i]"],
    "reply": [".markdown"],
    "user": [".user-message"],
    "chatLinks": ["a[href*='/chat/']"],
    "model": [".model-name"],
    "thinking": [".reasoning"],
    "modelPicker": { "open": [".model-name"], "items": ["[role=option]"] },
    "options": [{ "name": "Search", "selector": "button", "text": "Search" }]
  },
  "settings": { "replySelector": { "type": "text", "label": "Reply selector (tried first)", "default": "" } }
}
```

Each list holds CSS selectors, tried in order. `input` is the message box,
`send` the send button (without one, Enter is pressed), `stop` is visible while
the AI is still writing, `reply` matches one reply (the newest is used),
`user` matches one of your own messages (used to import a chat's history),
`chatLinks` the chats in the site's sidebar, `model` where the model name shows,
`thinking` the model's reasoning box (kept as a foldable "Thinking" section),
`strip` elements inside a reply that are not its text (e.g. source numbers like "-18").
If no `send` selector matches, the last button after the message box is pressed.
`modelPicker` opens the site's model list (`items` are its entries); `options` are
the site's own settings: the element matching `selector` whose text contains `text`.

To find them: on the phone, open a chat on the site with a reply on screen, then
⋯ → **Copy page report**. It copies an outline of the page around the newest reply
(tags, classes, a bit of text), enough to pick selectors. On a computer, use the
browser's inspector.

### Content scripts

When selectors are not enough, `contentScript` names a file that runs **inside
the AI page** (like a browser extension's content script). It gets helpers as
`PP` and returns the commands it replaces:

```js
// content.js
return {
  // Replace sending. fallback() runs the normal selector based send.
  async send(text, provider, fallback) {
    const r = await fallback();
    return { raw: r.raw.replace(/^Thinking.*\n/, "") };
  },
  last(provider) { return { raw: PP.textOf(PP.first(provider.reply)) }; },
  list(provider) { return PP.all("nav a").map((a) => ({ url: a.href, title: PP.textOf(a) })); },
  info(provider) { return { model: PP.textOf(PP.first([".model"])) }; },
  // Not a command: the built-in send and wait ask it every moment. Return nothing, or the reason
  // the site refused the message; the send then ends at once with that reason.
  error(provider) {
    const el = PP.first([".error-line"]);
    return el ? { el, text: "My AI refused it: " + PP.textOf(el) } : null;
  },
};
```

`error` may return a text or `{ text, el }`. With `el` (the element showing the
error), an error that was already on the page before the send is taken as an
older message's and skipped. Without `el` it stops a send before typing too,
which suits something over the whole page such as a human check. A script
that waits with `PP.waitReply` itself passes the errors seen before its send
as the fifth argument (a `Set` of elements).

Helpers: `all(sel)`, `first(selectors)`, `textOf(el)` (plain text),
`toMarkdown(el)` (the element as Markdown: bold, lists, headings, code,
tables), `sleep(ms)`, `typeInto(provider, text)`, `waitReply(provider, snapshot)`,
`snapshot(provider)`, `lastReply(provider)`, `lastReplyEl(provider)`, `lastThinking(provider)`,
`answerText(provider, el)` (the reply as Markdown, without thinking inside it),
`list(provider)`, `info(provider)`, `status(text, live)`.
`provider.settings` holds the provider's settings. `send` may also return
`thinking`.

Replies are read as Markdown, so return `PP.answerText(provider, el)` rather than
`PP.textOf(el)` to keep formatting.

`status(text, { thinking, reply })` updates the line under a reply that's on
its way; with `thinking` and/or `reply` the app shows them live (thinking open,
the reply so far under it). The built-in wait does this for you.

With several site pages (Settings › Sites › Max replies at once) each page runs its own
copy of your script; nothing to change.

### Drivers

A plugin tagged `driver` with a `contentScript` replaces the default page
commands for **every** provider: same script shape as above. Order: the
provider's own script first, then drivers, then the built-in defaults. Use it to
change how sending or waiting works everywhere without copying each provider.
Drivers show under Settings › Core plugins.

## Themes

The default look follows the system's light or dark setting; Settings › Look
also has Light or dark, five accents and the text size. A theme plugin sets
its own colours instead: it only redefines the variables at the top of
`chat-ui/ui.css` (`--bg`, `--raise`, `--raise2`, `--hair`, `--focus`, `--text`,
`--muted`, `--faint`, `--accent`, `--accent-hover`, `--on-accent`, `--ok`,
`--err`, `--warn`, `--toast-*`, `--shadow*`, radii `--r*`, `--font`, `--dur`). Keep text
at 4.5:1 contrast or more.

A theme is a plugin tagged `theme`, with a CSS file:

```json
{ "id": "my-theme", "name": "My theme", "version": "1.0.0", "tags": ["theme"], "css": "theme.css" }
```

```css
/* theme.css: set the colour variables, add any other CSS you like */
:root {
  --bg: #120f0d; --raise: #1c1815; --raise2: #251f1b; --hair: #2e2723; --focus: #463b34;
  --text: #ece4dc; --muted: #a3968b; --faint: #85796f;
  --accent: #f0a35e; --accent-hover: #f5b67d; --on-accent: #120f0d;
  --ok: #9ccf7a; --err: #ff8a7a; --warn: #f0c86e;
}
```

Pick it in Settings → Look (also UI scale there, or Ctrl+= / Ctrl+-).
Paper and Ember are built-in examples.

## Core plugins

The app itself is built-in plugins tagged `core` (the screen is tagged `ui` too):

| id | what it does | gives (top-level names) |
|---|---|---|
| `core-markdown` | Markdown to HTML | `mdToHtml` |
| `core-chatfile` | the chat file format | `ChatFile.toMd`, `fromMd`, `parseFront` |
| `core-profiles` | profiles, blocks, groups, toggles, templates, the prompt library | `activePlugins`, `pluginOn`, `setPluginOn`, `buildMessage`, `forChat`, `PP.profiles` |
| `core-send` | page pool, queue, sending, `PP.ask` | `runChat`, `askSite`, `acquire`, `release`, `pageCount`, `setPageCount`, `warmSite`, `showSite`, `applyProviderChoices` ... |
| `core-history` | chat files, folders, git, tags | `newChat`, `openChat`, `saveChat`, `startNewChat`, `moveChat`, `deleteChat`, `loadTree`, tag functions ... |
| `core-jobs` | other apps' requests (local API) | `runJob` (on the `job` event) |
| `chat-ui` | the whole screen | see The screen below |

Under them is the core (`/ui/core.js`, not a plugin): `S` (all state:
`S.config`, `S.chat`, `S.chats`, `S.plugins`, `S.pages` ...), `h`, `api`,
`toast`, `PP`, `on`/`emit`, plugin settings (`profile()`, `settingsFor`,
`providerFor`, `runHooks`, `runRoute`, `hookCtx`), tags (`hasTag`, `isProvider`,
`isTheme`, `isPassive`, `isCore`), and `siteCmd`/`openSite`. Its `activePlugins`,
`pluginOn`, `setPluginOn` and `buildMessage` do nothing until core-profiles replaces them.

How core plugins load:

```json
{ "id": "core-send", "name": "Sending", "version": "2.0.0", "tags": ["core"], "order": 20, "scripts": ["send.js"], "css": [] }
```

- They load once, at start, before anything shows, in `order` (low first).
  They're plain scripts sharing one scope: what one declares at top level
  (`const runChat = ...`) the ones after it, and the screen, use directly. Start
  each file with `"use strict";`, and pick top-level names no other core plugin uses.
- A core plugin does its startup in `on("start", fn)` (load data) and
  `on("ready", fn)` (after all of them started), not at top level.
- To change one: Settings › Core plugins › **Copy**, edit it in your plugin
  folder, then **Restart app** (core plugins don't reload with Reload plugins). Keep
  the names the others use (the table above); add what you like.
- A new one needs no built-in to replace: give it a new id and an `order`.

### The screen

The plugin tagged `core` and `ui` is everything you see. It assigns the core's
screen functions (they start as do-nothing versions):

`render()`, `renderStatus()`, `openSheet(title, render)`, `rerenderSheet()`,
`closeDrawer()`, `scrollDown()`, `fillComposer(text, mode)`,
`markUnseen(chat, turn)`, and optionally `toast(text, kind)`. Draw into `app`
(the `#app` element).

A whole working screen, as an example:

```js
// plugins/mini-ui/ui.js  (plugin.json: { "id": "mini-ui", "name": "Mini UI",
//   "version": "1.0.0", "tags": ["core", "ui"], "scripts": ["ui.js"] })
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

With more than one screen installed, Settings › Core plugins › **App screen**
picks which one runs (restart to switch). Copying `chat-ui` and changing it
is the easy way to restyle or rearrange the built-in screen.

### Safe mode

If a core plugin of yours fails to load, the app restarts in **safe mode**: only
built-in plugins, with a banner and a note saying which one failed. Fix or
remove it, then **Leave safe mode**. Settings › Core plugins › **Restart in safe
mode** does it by hand (the address is `/?safe=1`).

## Plugin updates

Every plugin, the built-in ones included, lives in the
[promptpipe-plugins](https://github.com/Zieviox/promptpipe-plugins) repo; its
`index.json` is the catalogue, and marks the plugins that ship with the app
(`"builtin": true`). An APK carries a copy of those as they were when it was built.

Plugins › Library checks the sources (the official one and any you add) for
newer versions, once a day and when you open it; **Update all** takes them. A
plugin whose `minApp` is newer than your app waits for an app update.

A fallback: each release also carries a plugin bundle,
`promptpipe-plugins-<version>.zip` (`bundle.json` plus one folder per plugin).
Settings › Core plugins › **Update plugins** downloads it, or once a day if you
switch that on there; a plugin from it is used when its version is newer than the built-in one. Your
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
- a `plugin.json` URL (the files named in `main`, `contentScript`, `css` and `files` are fetched next to it)
- a `.zip` with a `plugin.json` inside

Or copy the folder into your plugin folder yourself (Termux:
`cp -r shout /sdcard/PromptPipe/plugins/`) and Reload.

## Where things are

- `/sdcard/PromptPipe/plugins/` your plugins
- `/sdcard/PromptPipe/config.json` profiles and plugin settings (plain JSON)
- `/sdcard/PromptPipe/history/` chats as Markdown, a git repository; the prompt
  library is `prompt-library.json` there; a chat's `.memory/<chat path>/` folder
  is for plugins' files about it (hidden from the chat list, moved and deleted
  with the chat)

App routes plugins can call with `PP.api`: `/api/app`, `/api/config`,
`/api/plugins` (`?builtin=1`), `/api/plugins/install` `{url}`,
`/api/plugins/update` `{repo, force}`, `/api/plugins/bundle`,
`/api/history/tree`, `/api/history/file?path=`, `/api/history/save`
`{files, moves, delete, message}`, `/api/site` `{cmd, provider, page}`,
`/api/site/open` `{url, page}`, `/api/site/pages` `{count}`,
`/api/app/action` `{action: "site" | "openUrl" | "haptic" | "pickPlugin" ...}`.
