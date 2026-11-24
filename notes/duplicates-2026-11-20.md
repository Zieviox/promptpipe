# Duplicate code report, 2026-11-20

Made with the clone-detection skill (`.claude/skills/clone-detection/`) over promptpipe and
promptpipe-plugins, branch `ccr-bb40c4f5-cvvj2n` (app 3cea212, plugins b21ce87). Read-only: nothing was changed.

## Method

The standard clone types (Roy, Cordy & Koschke 2009): Type 1 identical, Type 2 renamed, Type 3
edited ("near-miss"), Type 4 same job with different code. The weakness: CWE-1041 "Use of
Redundant Code" (CISQ maintainability).

1. Token-based: jscpd 4.0.5, minimum 30 tokens and 3 lines, Odin read as Go.
2. Token-bag (SourcererCC style): every function as a bag of tokens, pairs with overlap ≥ 0.70
   (real tokens) and ≥ 0.85 (names and literals replaced).
3. Responsibility inventory: each job searched for in every layer by its typical code
   (the list is in the skill's `jobs.md`).

## Numbers

- 12,065 lines scanned: JS 7,728, Odin 2,071, Kotlin 1,194, Python 485, CSS 434, shell 143, C 10.
- jscpd: 31 exact clones, 140 duplicated lines (1.16%). JS 1.48%, Odin 0.87%, CSS 1.84%; Kotlin,
  Python and shell 0%.
- Token-bag: 54 candidate pairs (real tokens); 249 with names replaced, almost all false positives
  (screen code built from `h(...)` calls looks alike without its names).

Copy-paste is low. The real problems are the same job written more than once, and in two places
the copies already disagree.

## Merge: real duplicates, highest risk first

| # | Job | Where | Why it matters |
|---|---|---|---|
| 1 | Files that make up a plugin | `core/install.odin:224`, `core/install.odin:266`, `promptpipe-plugins/tools/hash.py`, `ui/core.js:527` | Four lists that disagree: both install paths leave out `scripts` and css lists. This is the install-from-link bug; core plugins updated from the Library would lose their scripts. |
| 2 | Version comparison | `verNewer` (chat-ui/ui.js), `appNum` (chat-ui/plugins-screen.js), `version_newer` (core/store.odin) | They disagree on `-alphaN`. Plugin versions carry no suffix today, so no harm yet. |
| 3 | Same chat URL? | `sameUrl` in ui/core.js (compares text) and in memory and sub-chats (compares host and path); `sameHost` in core-send | Two meanings under one name (http vs https gives different answers). |
| 4 | Absolute path check | `core/store.odin:242`, `core/api.odin:176`, each inline | The api.odin copy misses a path ending in `/..`. |
| 5 | Finishing a turn (title, tags, save) | `core-send/send.js:217` and `:233` (reply and cut-short paths) | A fix to one path would miss the other. |
| 6 | Block list editor (grip, drag, toggles) | `chat-ui/profiles.js:130` (Profiles), `chat-ui/quick.js:81` (Quick edit) | The same list in two screens. |
| 7 | Drag to reorder | `startDrag` (chat-ui/drawer.js), `reorderDrag` (chat-ui/quick.js) | Same gesture; only the drop rules differ. |
| 8 | Open a guide in a sheet | `openDoc` (chat-ui/ui.js), `openGuide` (memory, sub-chats; 97% the same) | One `PP` function. |
| 9 | Page outline for diagnostics | `walk` (page-report), `outline` (qwen-chat/content.js), 86% the same | One page script helper. |
| 10 | Pick text files | `pickFiles` (ui/core.js), `pickTextFiles` (chat-ui/quick.js) | Different size limits: 5 MB and 2 MB. |
| 11 | Slug | `slug`, `fileSlug`, `promptSlug`: the same code | One function with a fallback argument. |
| 12 | Insert a block before Your message | `ui/core.js:199`, `chat-ui/prompt-library.js:82` | Belongs in the profiles module. |
| 13 | Vibrate | `Shell.kt:113`, `MainActivity.kt:117` | One function. |
| 14 | Page helpers rewritten in provider scripts | qwen-chat: `boxText`, `fillNative` (part of `typeInto`), `outline`; deepseek: `shown`, `ownText` | The page script should expose `waitFor`, the input's text, filling, and a stricter visibility check. |
| 15 | "Newest match for a list of selectors" loop | 5 copies in `ppext/content.js` (lines 151 to 222) | One helper. |
| 16 | Test harness (start the stand-in, PASS/FAIL, summary) | `scripts/ux/migration-check.js`, `scripts/ux/redraw-check.js` | One shared harness. |

## Leave: looks alike, different jobs

Listed in the skill's `accepted.md`: the Odin JSON getters, the long-poll and HTTP read loops, the
try/api/toast idiom, same-name locals (`textOf` ×3, `go`, `flip`, `pick`), the stand-in core
(a test double), small pairs with different targets, and the three escaping functions.

## Pick an owner: one job in two layers

- `secrets.json` and the chats-folder pointer are read by both Kotlin (`Store.kt`) and Odin
  (`store.odin`). Proposed owner: the core, which hands the git token to the shell with each git call.
- The built-in plugin list is read from index.json by copy-plugins.py, standin.js and
  plugin-bundle.sh. They agree; plugin-bundle.sh still has a stale "private providers" check for
  qwen-chat and deepseek.

## Side finds

- core-send's error says "tap the pill at the top": an invented word that terms-check missed.
- Installing a single plugin.json (`install.odin:224`) also ignores `scripts` and `files` (the same
  root cause as #1).

## Next

These go into the refactor design (`design/`), which removes them by giving every job one home.
