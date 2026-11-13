# promptpipe-plugins

Site plugins for [promptpipe](https://github.com/Zieviox/promptpipe). A site plugin teaches promptpipe how to use one AI chat website: where the message box is, how to send, and where the reply and its thinking appear.

The app installs these with one tap ("Get site plugins"). You can also install a single plugin from its folder link.

## Plugins

| Plugin | Version | Notes |
| --- | --- | --- |
| [DeepSeek](deepseek) | 1.1.1 | Exact selectors, finish detection, DeepThink and Search switches, source numbers like "-18" stripped (needs app 0.7.0-alpha7 or newer). No model name on the page, so none is shown. |
| [Qwen Chat](qwen-chat) | 1.6.0 | Exact selectors only, thinking from the current reply, stops on Qwen's error messages, shows the model name the page shows. |

## Layout

One folder per site, named by plugin id:

```
<id>/
  plugin.json   selectors for each part of the page, settings, version
  site.js       optional: code for things selectors can't do
```

Version numbers only go up. The app's updater keeps the higher number.

`index.json` lists every plugin for the app's "Get site plugins" sheet: `id`, `name`, `path` (its folder), `version` (same as its plugin.json), `default` (ticked for new users) and a one-line `note`. Change it together with the plugin.

## Updating plugins and app parts

Every plugin, including the app's own parts (`chat-ui` and the `core-*` ones), is updated from this repo: change the folder, raise `version` in its `plugin.json` **and** in `index.json`, push. The app offers the update next time it checks, and an app part needs a restart.

- `minApp` (optional, in `index.json`): the oldest app build the new version works with, like `"minApp": "0.7.0-alpha43"`. Set it whenever a plugin needs something a newer app added. Older apps then skip that update and say so.
- No `minApp`: the app just tries the update. If it can't be written, the old version stays. If it breaks while loading, the app goes back to the version before it.

## Rules for every plugin

- **Hands only.** A plugin only does what you could do yourself with your fingers on the site: type, tap, read. No hidden API calls.
- **No getting around the site's protections.** No bypassing bot checks, captchas, rate limits or safety filters.
- **Read what the page shows.** The model name, the reply and the thinking come from what is on the page, from the current reply only.
- **Strict selectors.** Exact selectors from a page report, no broad guesses. When a plugin can't find something, it says so instead of guessing.

## Use at your own risk

Using a chat website through an app may break that site's terms. Don't use an account you can't afford to lose. Use a separate account, or sign in by hand inside the app.

## License

MIT, see [LICENSE](LICENSE).
