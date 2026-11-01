# Writing promptpipe plugins

A plugin is a folder in your plugin folder (`/sdcard/PromptPipe/plugins/<id>/`).
Add or edit one, then tap **Reload plugins** (Ctrl+Shift+R). No rebuild needed.

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
    "times": { "type": "number", "label": "Times", "default": 1 }
  }
}
```

- `id`: letters, digits, `-` and `_`. Same as the folder name.
- `block.place`: `toggles` (the row above the message box, the default) or `top` (the top bar). `"block": false` means no block.
- `advanced: true` puts the block in the folded **Advanced** row.
- `settings` get a settings screen built for you (the ⚙ on the block). Types: `bool`, `text`, `textarea`, `number`, `select`. Add `help` for a hint line. Settings are saved per profile.

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
  // Optional: draw your own block. ctx.pill(label) is the standard switch.
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
- `profile`: the active profile
- `note(text)`: adds a note to the message's trace

`PP` (global) has: `PP.h(tag, props, ...children)` to make elements,
`PP.md(text)` Markdown to HTML, `PP.toast(text)`, `PP.api(path, body)`,
`PP.site(cmd)` to talk to the AI page, `PP.chat`, `PP.profile`.

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

Helpers: `all(sel)`, `first(selectors)`, `textOf(el)`, `sleep(ms)`,
`typeInto(site, text)`, `waitReply(site, snapshot)`, `snapshot(site)`,
`lastReply(site)`, `lastReplyEl(site)`, `lastThinking(site)`,
`answerText(site, el)`, `list(site)`, `info(site)`, `status(text)`.
`site.settings` holds the site plugin's settings. `send` may also return
`thinking`.

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
- `/sdcard/PromptPipe/history/` chats as Markdown, a git repository
