# Jobs to inventory (pass 3)

For each job: the typical code to search for (ripgrep patterns), and what the last run found. Search all layers: `core/*.odin`, `app/src/main/java/**/*.kt`, `ui/core.js`, `ppext/content.js`, every plugin, `scripts/`, the plugins repo's helper scripts (`hash.py`).

| Job | Search for | Last run (2026-11-20) |
|---|---|---|
| Files that make up a plugin | `"main"`, `"contentScript"`, `"scripts"`, `"css"`, `"files"` near a manifest | 4 lists that disagree: install.odin ×2 (no `scripts`, no css list), tools/hash.py and core.js (all of them) |
| Version comparison | `split(/[.-]/)`, `alpha`, `version_newer`, `semver`, `parseInt` on versions | verNewer (ui.js), appNum (plugins-screen.js), version_newer (store.odin): differ on `-alphaN` |
| Same URL / host / site name from a URL | `new URL(`, `.host`, `replace(/[?#].*$/`, `(www\|chat)\.` | sameUrl ×3 with two meanings, sameHost (send.js), siteLabel/siteName |
| Path safety (relative and absolute) | `"/../"`, `".."`, `safe_rel`, `safe_name`, `history_path` | safe_rel/safe_name in files.odin, plus two inline absolute-path checks (store.odin, api.odin) that differ |
| Slugs and file names | `normalize("NFKD")`, `[^\w\s-]` | slug, fileSlug, promptSlug: identical |
| Picking files | `type: "file"`, `input.files`, `f.text()` | pickFiles (core.js, 5 MB), pickTextFiles (quick.js, 2 MB) |
| Drag to reorder / move | `setPointerCapture`, `pointermove`, `translateY` | startDrag (drawer.js), reorderDrag (quick.js) |
| Opening a guide or doc in a sheet | `GUIDE.md`, `.md")`, `PP.md(`, `openDoc` | openDoc (ui.js), openGuide (memory, sub-chats) |
| Page outline for diagnostics | `aria-label`, `data-testid`, `depth >`, `className.trim()` | walk (page-report), outline (qwen-chat) |
| Typing into the site's input | `execCommand("insertText"`, `Object.getOwnPropertyDescriptor(proto, "value")` | typeInto (content.js), fillNative/fillKeyboard (qwen-chat) |
| Text of an element / without buttons | `cloneNode(true)`, `innerText \|\| textContent`, `querySelectorAll("button` | textOf (content.js, exposed), boxText (content.js inner, qwen-chat), ownText (deepseek), codeText |
| Visibility | `getClientRects().length`, `getComputedStyle` | visible (content.js, exposed), shown (deepseek, stricter), visible (sub-chats) |
| Waiting for something on the page | `waitFor`, `await sleep(`, polling loops with `Date.now() + ms` | waitFor in content.js only (not exposed to provider scripts) |
| Finding the newest match for a list of selectors | `for (const s of provider.` + `all(s)` | 5 copies in content.js (snapshot, lastThinking, pickAll, lastReplyEl, lastReply) |
| Adding a block to a profile | `blocks.findIndex((b) => b.type === "message")`, `splice(` | core.js addPromptBlock, prompt-library.js |
| Block list editor | `data-blk`, `data-qp`, `blockEls`, `forChat` | profiles.js editor, quick.js Quick edit |
| Finishing a turn (title, tags, save) | `chat.meta.title ===`, `tagsForNewMessage`, `saveChat(` | send.js success path and cut-short path |
| Vibration | `Vibrator`, `vibrate`, `haptic` | Shell.kt vibrate, MainActivity.kt haptic |
| Secrets and folder pointer files | `secrets.json`, `history-folder` | read by both Store.kt and store.odin |
| Built-in plugin list | `builtin`, `index.json`, `qwen-chat deepseek` | copy-plugins.py, standin.js, plugin-bundle.sh (stale private-provider check) |
| Outbound HTTP | `HttpURLConnection`, `fetch_url`, `fetch(` to remote hosts | Shell.kt fetch is the only client (the core relays to it): fine |
| Long-poll / wait loops in the core | `deadline`, `time.diff(time.now()` | poll_events, shell_next, relay wait (bridge.odin): accepted |
| Test harness (start stand-in, PASS/FAIL) | `spawn(process.execPath`, `PASS `, `results.push` | migration-check.js, redraw-check.js |
| Escaping | `&amp;`, `quote ::`, `esc(` | Hub.kt, md.js, jsonx.odin quote: different jobs, accepted |
| Tags on plugins | `tagsOf`, `hasTag`, `m.tags` | hasTag (core.js, installed plugins), tagsOf (plugins-screen.js, catalogue entries) |
