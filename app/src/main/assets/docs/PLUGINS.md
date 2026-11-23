# Writing promptpipe plugins

A plugin is a folder with a `plugin.json` and its files. The app itself is plugins too (the ones
tagged `runtime`), so everything here is what the app's own code uses. Install yours from a link
(a GitHub folder, a `plugin.json`, a `.zip`), from an AI's answer, or put it in your plugins
folder; the catalogue only lists signed plugins.

## plugin.json

```json
{
  "id": "word-count",
  "name": "Word count",
  "version": "1.0.0",
  "description": "Notes how many words each reply has.",
  "tags": [],
  "pp": 1,
  "min_app": "1.0.0",
  "files": ["main.js", "GUIDE.md"],
  "guide": "GUIDE.md",
  "settings": [
    { "key": "minimum", "type": "number", "label": "Only note replies longer than", "default": 0 }
  ]
}
```

- `tags` say what it is: none (a **block** plugin: it goes into a profile and has a toggle),
  `provider` with `web` or `api`, `theme` (CSS only), `passive` (commands only, no block),
  `runtime` (part of the app; `ui` too for the screen).
- `pp` is the version of `PP` it was written for; `min_app` the oldest app it runs in.
- `files` load in order: `.js` runs in its own scope, `.css` joins the screen, anything else is
  content you read with `PP.content_read(id, file)`. A provider's `content_script` files are
  handed to the site's page instead (below).
- `settings` are `Setting_Def`s: `key`, `type` (`toggle`, `choice` with `choices: [{ value,
  label }]`, `number`, `text`, `list`), `label`, `description`, `default`, and `old_keys` when you
  rename one. A block plugin's settings are kept per profile, a provider's per provider.

## main.js

```js
"use strict";
const ID = "word-count";

const reply_after = (reply, context) => {
  const words = reply.split(/\s+/).filter(Boolean).length;
  const minimum = PP.plugin_setting_get(PP.state_get(), context.chat, ID, "minimum");
  if (words > minimum) context.notes.push(`Word count: ${words}`);
  return reply;
};

PP.plugin_set({ hooks: { reply_after } });
```

`PP.plugin_set` takes any of:

- `hooks`: functions the app calls (below);
- `commands`: `[{ id, label, place, key, run(state, data) }]`, listed in Find, help and the keys.
  `place` puts them in a menu: `"Chat"` (the chat's sheet), `"Reply"` (a reply's ⋯ sheet; `data`
  is `{ turn }`), `"Settings › <section>"`;
- `sheets`: `{ name: (state, data) => ({ title, rows }) }`, opened with `PP.sheet_open(name,
  data)`;
- `functions`: shared with other plugins as `PP.<name>`;
- `events`: `{ event_name: handler }` (`http_received`, `share_received`, `page_changed`,
  `reply_changed`, `job_changed`).

## Hooks

The ones marked *send* run only for plugins whose block is on in the chat's profile, in the
profile's order, each one's output feeding the next.

| Hook | Called with | Returns |
|---|---|---|
| `block_text` *send* | `context`: `chat`, `profile`, `message`, `count`, `first`, `depth` (the "at depth N" prompts), `note(text)` | the block's text, or `{ text, depth_used }` |
| `send_before` *send* | the text, `context` (+ `pick: { i, n }` when set to "only the blocks I pick") | the changed text |
| `reply_after` *send* | the reply (Markdown), `{ chat, notes }` | the reply as shown (push to `notes` to explain) |
| `chat_route` *send* | `null`, `{ chat, message }` | `{ url: "new" \| <site chat>, provider, profile }` or nothing |
| `turn_render` | the turn, `{ chat, turns, index }` | `{ before, after }`: screen parts around it |
| `chat_section_format` | `[]`, `{ chat }` | `[{ plugin, title, text }]`: a folded section of the chat file |
| `chat_section_parse` | the section's text as edited, your data | your new data |
| `chat_send` (api providers) | the text, `context` + `progress({ reply, thinking })` | `{ reply, thinking, model }` |
| `model_list` (api providers) | `state`, `chat` | `{ models, model, options }` |
| `app_start` | — | — (once, after the app has loaded) |

## What PP gives you

- **The State**: `PP.state_get()`; never change it in place. Records change through
  `PP.apply_try((state) => PP.record_set(state, { collection, id, fields }), "commit message")`
  (also `record_create`, `record_move`, `record_copy`, `record_delete`), which saves the files
  and commits.
- **Values that apply**: `PP.setting_get(state, key)`, `PP.plugin_setting_get(state, chat, id,
  key)`, `PP.profile_get(state, chat)`, `PP.provider_get(state, chat)`, `PP.model_get(state,
  chat)`.
- **Your data per chat** (a JSON file beside the chat's): `PP.chat_data_get(state, chat_id, id)`,
  and `PP.chat_data_set(state, chat_id, id, data)` inside `PP.apply_try`.
- **Asking the AI on the side**: `await PP.message_send({ message, profile, plain })` sends to a
  fresh, unsaved site chat and gives back `{ reply, thinking }`; `plain` leaves out the profile's
  blocks.
- **Calls** to the app and the platform: `await PP.call_send(name, data)`, e.g. `http_fetch`
  (`url`, `method`, `headers`, `body`, `credential`: the name of a credential the platform adds
  for its hosts; you never see its value; `stream: true` with an `id` sends each line as
  `http_received`), `clipboard_write`, `picker_open`, `content_export`.
- **The screen**: `PP.html` (htm with Preact: components are plain functions, no state of their
  own), `PP.item_render({ label, sub, right, onClick })`, `PP.markdown_render(text)`,
  `PP.toast(text, error)`, `PP.dialog_open({ title, value, ok, choices, command, data })`,
  `PP.sheet_open`, `PP.sheet_close`, `PP.command_run(id, data)`.
- `PP.id_create()`, `PP.time_get()`, `PP.pause(ms)`, `PP.content_read(id, file)`.

## Providers

A web provider is mostly data: where the site is and how to find its parts.

```json
"tags": ["provider", "web"],
"files": ["site.js"],
"content_script": "site.js",
"provider": {
  "url": "https://chat.example.com/",
  "selectors": {
    "input": ["textarea"], "send": ["button[type=submit]"], "stop": [".stop"],
    "reply": [".answer"], "user": [".question"], "thinking": [".thoughts"],
    "strip": [".citation"], "model": [".model-name"], "chat_links": ["a[href*='/c/']"]
  },
  "model_picker": { "open": [".model-name"], "items": ["[role=option]"] },
  "options": [{ "name": "Search", "selector": "button", "text": "Search" }],
  "accepts": { "types": [], "max": 0 },
  "settle_ms": 2000
}
```

A message plugin that adds to what's sent can also take its part off again with a `sent_unwrap`
hook (text in, text out): adding a site's messages to a chat uses it to show your own text.

`accepts` says which attachments the plugin really sends (MIME patterns like `image/*`, and how
many). Leave `max` at 0 until your `site_send` (or `chat_send`) uploads them: the app then tells
the user at once that this provider can't take attachments, instead of sending without them.

Each selector list is tried in order. The app's own routine (`runtime-site`) types, sends, waits
and reads the reply as Markdown; a content script replaces only what the site needs. It runs in
the site's page and returns stages:

```js
// site.js: runs in the page, never in the app's screen; it can't see credentials.
const error_find = () => {
  const alert = document.querySelector("[role=alert]");
  return alert && alert.textContent.includes("limit") ? { el: alert, text: alert.textContent } : null;
};
const site_send = async (data, provider) => {
  document.querySelector(".popup-close")?.click(); // the site's own quirk
  return PP.defaults.site_send(data, provider); // then the usual way
};
return { error_find, site_send };
```

Stages: `site_send`, `site_read`, `site_model_list`, `site_model_set`, `site_chat_list`,
`error_find` (a refusal or a human check: text, or `{ el, text }`), `report_build` (your own page
report), `site_shown` (the site view shows or hides your page, `{ shown }`, told before it's shown:
close what you opened over the chat), `site_back` (Back in the site view: close a panel of the
site's that's open over the chat and answer `{ closed: true }`, else the site view closes).
`PP.view_shown()` says whether you're being looked at: never open anything over the chat then. `PP.defaults` holds the stages as they were before your script, `PP.stages` as they are
now; `PP.pause(ms)` waits. When a site changes, **Copy page report** (the provider's sheet) gives
whoever fixes the plugin an outline of the page.

An `api` provider has no page: its `chat_send` and `model_list` hooks talk to the service through
`http_fetch` (see the OpenAI-style API plugin).

## Themes

A theme is CSS that sets the screen's colour tokens under its own id:

```css
:root[data-theme="my-theme"] { --bg: #101418; --raise: #182028; --text: #e8eef4; --accent: #7fb8ff; }
```

The tokens: `--bg`, `--raise`, `--raise2`, `--line`, `--focus`, `--text`, `--muted`, `--accent`,
`--on-accent`, `--ok`, `--error`, `--warn`, `--scrim`.

## Publishing a catalogue

To offer your plugins as a source others can add: put each plugin in its own folder in a GitHub
repository, copy `scripts/catalogue_build.py` and `scripts/catalogue_sign.py` from
promptpipe-plugins, run `catalogue_sign.py --new-key` once (it writes `catalogue.pub`; keep the
private keys it prints), then `catalogue_build.py` and `catalogue_sign.py` after each change, and
commit `catalogue.json`, `catalogue.json.sig` and `catalogue.pub`. People add the repository in
Plugins › Catalogue › Sources and accept your key once.
