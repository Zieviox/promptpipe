# promptpipe bugs

One list for every promptpipe bug. Owner: the Warden thread. If you see a bug, tell Warden; do not fix it somewhere else and do not keep a second list.

**Statuses**
- `open`: not fixed, or fixed but not understood well enough to call it fixed.
- `fixed`: changed in code, **waiting for Gtex to check it on the phone**. The commit is named.
- `verified`: Gtex confirmed it on the phone. Only Gtex can move a bug here.

A bug closes only when it is `verified`. Last checked against branch `claude/project-thread-5vu1zj` (alpha6 `aae403e` + the alpha7 batch), 2026-11-07. The rebuild waits: the UI needs a big cleanup first (Gtex, 2026-11-07).

Build the current batch: `cd /root/promptpipe && git pull origin claude/project-thread-5vu1zj && sh scripts/build-local.sh 0.7.0-alpha7-local 17`

---

## 1. Reported by Gtex on 2026-11-07 (alpha6)

| # | Bug | Status | Notes |
|---|---|---|---|
| 1 | Menus behave randomly (sheets close by themselves, Back does odd things) | fixed `a9e02a7` | Cause found and reproduced in a browser: closing a sheet ran `history.back()`, whose late "popstate" closed the *next* sheet that opened right after (any menu item that opens another menu). Sheet and drawer now share one history entry, given back one tick later and only if nothing is open. |
| 2 | Auto-scroll is random everywhere | fixed `a9e02a7` + batch 2 | Cause: every redraw rebuilt everything and only the chat list kept its scroll place. Sheets, the chats drawer and every other list jumped to the top on any background redraw. Now every list keeps its place. Chat rule, one rule everywhere: at the bottom you stay at the bottom as a reply grows; scrolled up your place never moves (jump button shows new replies). Settings › Look › Chat can turn "stay at the bottom" off. |
| 3 | Create folder doesn't work | fixed `a9e02a7` | Three causes, all reproduced: text typed into the sheet was wiped by a background redraw (then "not a valid name"), a subfolder was created but stayed hidden because its parent folder was closed, and errors were swallowed with no message. Now: typed text survives, parents open, errors show, the sheet closes only on success, a toast says "Folder created". |
| 4 | Icons and app colour themes mismatch | fixed `a9e02a7` (check which icons) | The launcher icon was blue on slate while the app is warm orange: now orange on the app's dark. The Android shell (behind the page, the site bar, status and navigation bar icons) was always dark even in light mode or with Paper: it now takes the page's background and light/dark from the theme. If you meant different icons (inside the app), say which screen. |
| 5 | Plugin update failed: "could not write system-prompt/main.js" | open | Not reproduced here (the same write works on desktop, empty files too). The message now says the OS reason, so the next failure tells us why. Please send that text if it shows again. |
| 6 | "Get site plugins" is not reachable from the Plugins sheet | fixed `a9e02a7` | Button added to the Plugins sheet. |
| 7 | Your own copies of Memory (2.2.0) and Sub-chats (1.0.0) hide the newer built-in Memory 2.4.0 and Sub-chats 1.1.0 | fixed `a9e02a7` | Found in the screenshot ("your copy (overrides built-in)"). The newer Memory pieces and Sub-chats fixes were therefore not running. The Plugins sheet now warns "yours is hiding it" with a "Use the app's" button (removes your copy). **Tap it for both.** |

## 2. Site plugins (repo Zieviox/promptpipe-plugins)

| # | Bug | Status | Notes |
|---|---|---|---|
| 8 | DeepSeek source numbers like "-18" in replies | fixed (plugins repo `deepseek 1.1.1`, app `a9e02a7`) | New `strip` selector list; DeepSeek strips its citation marks. Needs the alpha7 app and "Get site plugins" to take 1.1.1. |
| 9 | DeepSeek shows "writing… 204 chars" / Stop waiting after the reply finished | fixed (DeepSeek 1.1.0) | Finish = the newest message has its "Read aloud" button. Gtex's phone test pending. |
| 10 | Qwen plugin very buggy: crashes on some inputs, thinking from an older message, waits forever after an error, loose selectors | fixed (Qwen 1.6.0, PR #1 merged 2026-11-07) | No live phone test yet. |
| 11 | A second user could not get Qwen to work at all; Qwen says "You do not have permission" | open | Most likely a guest (not logged in): Qwen refuses guest sends. Plugin shows Qwen's own message. Gtex wants guests to work: not possible if Qwen refuses. |
| 12 | "Copy page data" / Copy page report copies nothing | fixed `f6bc52e` (alpha5) | One native clipboard path. Phone test pending. |
| 13 | Model detection wrong everywhere (shows the requested model, loose matching, badge text in the name) | fixed (Qwen 1.6.0; DeepSeek has no model on its page, shows none) | Phone test pending. |
| 14 | DeepSeek "Stop waiting" did nothing; idle/max wait limits never reached the plugin | fixed (DeepSeek 1.1.0 / Qwen 1.6.0) | Phone test pending. |
| 15 | DeepSeek thinking: only the last of several thinking blocks kept; reply selector also grabbed thinking | fixed (DeepSeek 1.1.0) | Phone test pending. |
| 16 | DeepSeek filter "rescue" brings back replies the site removed | not fixing | Decided by Gtex 2026-11-06 (rebuilt plugins leave it out; Gtex's own 0.1.2 copy untouched). Do not re-open. |
| 17 | Qwen sends nothing (text sits in the box, arrow does nothing) | fixed (Qwen 1.2.0+, 1.6.0) | Phone test pending. Originally 2026-11-01. |
| 18 | Qwen replies cut off after a few characters; Qwen read the whole box (thinking card, "Select text" labels) | fixed (Qwen 1.3.0 to 1.6.0) | Phone test pending. |
| 19 | Qwen thinking does not come through / live thinking | fixed (Qwen 1.5.0+, app live thinking) | Never verified on the real site. |
| 20 | Qwen model picking is a guess | open | Needs a page report if it fails. |
| 21 | DeepSeek 1.1.x may not match the new core's page helpers | open | Courier's heads-up; check on the phone. |

## 3. Core and alpha builds

| # | Bug | Status | Notes |
|---|---|---|---|
| 22 | 0.7.0-alpha1 white screen: core did not start on Android (thread-local data aligned to 8, arm64 needs 64) | verified | Fixed in `214c793`; Gtex's alpha3 phone test passed (core answers, TLS 0x40). Needs Android 10+. |
| 23 | App's own server calls needed no key; API token optional | fixed `d22816f`/`19b1c0d` (alpha1+) | Random key on every call, Host check. Not separately confirmed by Gtex. |
| 24 | core.log not readable from Termux (private folder) | fixed `ee729f9` | Settings › Advanced › Core log. |
| 25 | Android 8 and 9 not supported (new core) | open (deferred by Gtex) | Keep 10+ for the alpha; widen later. |
| 26 | Plugin-update rollback and drag-to-reorder missing | open (deferred) | Rows move with ↑↓ for now. |

## 4. Chat UI and everyday use (older reports)

| # | Bug | Status | Notes |
|---|---|---|---|
| 27 | Chat keeps scrolling to the bottom / jumps from the top on every refresh (2026-11-01) | fixed `a9e02a7` | Same fix as #2. The 0.5.8 "replies never move the chat" attempt did not cover redraws. |
| 28 | Too many random buttons in the wrong places | fixed `aae403e` (alpha6) | One message menu, + menu, grouped Settings. Phone check pending. |
| 29 | Copy/paste and keyboard use "a massive pain" | copy fixed `f6bc52e`; keyboard open | Copy has one native path. Keyboard handling has not been specially reworked. |
| 30 | Thinking display and message display bugs | fixed `aae403e` | One "Thinking · last line" that unfolds. Phone check pending. |
| 31 | Tagging very hidden | fixed `f6bc52e` | Tag chips filter the chats list. |
| 32 | Site view hard to reach and unclear | fixed `f6bc52e` | Site sheet from the header. |
| 33 | Themes partly hard-baked (default look in chat-ui CSS, native start screen and site bar, ~17 colours skip the variables) | open | Native part fixed in `a9e02a7` (#4). The default theme still lives in chat-ui CSS and ~17 colours skip the variables. Rebuild: every colour a variable, every theme a plugin. |
| 34 | System prompt can only go in one place in the plugin order | fixed `b18b971` (pipeline) | Gtex: "it's working", wants a talk with Hearth. |
| 35 | Keyboard covers the text input bar | fixed (IME inset, 2026-10-30) | Never confirmed. |
| 36 | False "message box not found" / "Not sent" while logged in | fixed (waits up to 15 s) | Never confirmed. |
| 37 | Retry button unreadable (dark on dark) | fixed (contrast; Retry itself confirmed working) | Look changed again in 4a: check the colour. |
| 38 | Send fails with System prompt on (longer message left in the box) | fixed (waits for Send, retries once) | Never confirmed. |
| 39 | Blank white/gray page that never recovers | fixed (auto reload + Reload button) | Never confirmed. |
| 40 | Message timeout killed long replies | fixed (no timeout by default, Stop waiting) | Never confirmed. |
| 41 | App does not detect that the chat was sent/is running | fixed (Check button, safer detection) | Never confirmed. |
| 42 | Red "redeclaration" error after installing a plugin | fixed (own scope per plugin, 0.5.7) | Never confirmed. |
| 43 | Can't select text / see the selection | fixed (Select box, 0.5.8) | Never confirmed. |
| 44 | Reply formatting broken vs the site | fixed (Markdown, 0.5.8) | Never confirmed. |
| 45 | Plugin buttons look like plain text; app icon ugly | fixed (0.5.8, new icon again in `a9e02a7`) | |
| 46 | `PP.ask` from a plugin step with one site page hangs | fixed (clear error, 0.5.8) | |
| 47 | Base64 "�" garbage at the end of decoded replies | fixed (Base64 1.1.0) | Never confirmed. |
| 48 | Unsent messages/drafts live in browser storage, not the chat files | open | Raised 2026-11-06, no fix. Rebuild: store in the chat folder. |
| 57 | Selecting and copying text didn't work (2026-11-07) | fixed (alpha7 batch 2) | Two causes: a long-press on a reply opened the message menu at 550 ms, on top of the phone's own long-press selection; and any redraw cleared a selection. Long-press now only selects (the menu is the ⋯ button; right-click on desktop). A selection in a reply, and the cursor and selection in a field, now survive a redraw. |
| 58 | Your own messages have no copy option | fixed (batch 2) | Tap your message: Copy, Send again, Edit. (The reply's menu also had "Copy your message", hidden two taps deep.) |
| 59 | No way to copy or export the whole chat | fixed (batch 2) | Menu: "Copy the whole chat" and "Share or export the whole chat…" (Android share sheet). Also in a chat's actions in the chats list: Copy chat, Share chat. Copies the chat's Markdown, the same text as its file. |
| 60 | Turning plugins on and off resets the sheet's place; you scroll again | fixed (batch 1 + 2) | Same cause as #2. Tested: toggling keeps the place. A different sheet opening now starts at its top; the same sheet redrawn keeps its place. |
| 61 | Editing a system prompt scrolls too far from it | fixed (batch 2) | Edit now brings the editor into view and puts the cursor in it. |
| 62 | System prompts need a collapse | fixed (batch 2, System prompt 2.1.0) | Library entries are folded to one line; tap to unfold; Fold all / Unfold all; "+ New prompt" is folded until you want it. |
| 64 | Hold (long-press) no longer selects text; thinking glitches while a reply comes in (2026-11-07) | fixed (batch 3) | Causes, both reproduced: the long-press opened the message menu (fixed in batch 2); and every chunk of a streaming reply rebuilt the live box, so an unfolded Thinking closed again within 0.1 s and any selection was torn out. The live box is now built once and updated in place (an unfolded fold stays open, even through a full redraw), and while you select text in it the box waits and then catches up. |
| 63 | The UI needs a massive cleanup | open | Gtex, 2026-11-07. Plan is a separate redesign pass before any rebuild. |

## 5. Sub-chats, Memory, pipeline

| # | Bug | Status | Notes |
|---|---|---|---|
| 49 | Plugins (e.g. Base64) are active in a sub-chat but not used (same profile at top and in the sub-chat) | open | Loom's guess was plugin order. Likely cause now: your old Sub-chats 1.0.0 copy hid the newer built-in (#7). Retest after "Use the app's". |
| 50 | Switching a chat to a profile on another site reopens the old site's chat and drives it with the new site's controls | open | Planned: a safety check in the app plus Sub-chats auto-new-chat. No explicit fix recorded. |
| 51 | System prompt "first message only" skipped sub-chats | fixed (Sending 1.0.1, `ae33e9e`) | Phone check pending. |
| 52 | Memory needs a you/AI split and to fit with system prompts | fixed `ee729f9` | Pieces Pinned facts, Your side, AI side, Recent messages. Only active if #7 is done. |
| 53 | A Memory test needs updating for Memory 2.2 | open | Loom's. |

## 6. Build, install and tooling (not app bugs, kept so they are not lost)

| # | Bug | Status | Notes |
|---|---|---|---|
| 54 | Local build slow / silent, memory limits, GeckoView re-download | fixed (`scripts/build-local.sh`, status line, GeckoView reuse) | `GECKOVIEW=latest` to update. |
| 55 | Termux clips long pastes | fixed (use scripts) | |
| 56 | APK attachment only previews on the phone; GitHub rejects files over 100 MB | worked around | Build locally now. |

## 7. Not bugs / decided

- DeepSeek filter rescue: declined, do not re-open (#16).
- "Looks the same" after alpha3: expected, the new look came in step 4.
- Old 0.6.0.7 outside bundle: reference only.
- Loom's Marginal items (save crash, Hunspell) belong to Marginal, which is parked.

---

## 8. Planned batch (from Gtex, 2026-11-07 04:01; work starts after the usage reset)

Not started. Same statuses as above. Fixes first, then the release items.

### Fixes

| # | Item | Status | Notes |
|---|---|---|---|
| 65 | Adding a folder still gives an error | open | Gtex still gets an error (probably on alpha6/7). Alpha8's fix made errors visible and fixed three causes, but this one is not understood. **Need the exact error text** (it shows in a red toast). Check on alpha8 first. |
| 66 | Can't switch sites under the profile dropdown | open | Not looked at yet. Reproduce in the browser first. |
| 67 | Can't even switch profile from the dropdown | open | Not looked at yet. Likely the same cause as #66. Reproduce first. |
| 68 | Menu holds duplicates and items that belong in the main UI | fixed (waiting for Gtex phone check) | Alpha9 (UI redesign step 1): the ⋯ menu is gone. Find (magnifier, Ctrl+K, F3) lists every function and setting once, with its path and shortcut, and flashes the control. |
| 69 | Plugins should be on top | open | Presumably the Plugins entry first in the menu and Settings. Confirm what "on top" means (menu order, or the plugin switches above other rows). |
| 70 | The whole system-prompt stack can only go in one place; can't decide which system prompt applies before or after which plugin | open | Cause known from the code: the System prompt plugin is one pipeline step, so its whole stack is sent as a unit. Fix: each stacked prompt becomes its own pipeline piece (the way Memory's pieces work), placeable anywhere. |

### Release items (after the fixes)

| # | Item | Status | Notes |
|---|---|---|---|
| 71 | Website page with quick guides | open | Release blocker. Separate thread later. |
| 72 | Easy download button | open | Release blocker. Separate thread later. |
| 73 | Error when clicking Update plugins | open | Related to #5 (could not write system-prompt/main.js). Alpha8 now says why; need that text. |
| 74 | Update plugins is hidden and minimized too far | open | Make it a visible control (Plugins sheet, top), not buried in Settings. |
| 75 | Profile export, one profile and all | open | New. |
| 76 | A button to reset the app to a first launch without losing data | open | New. First-run welcome again; chats, settings and plugins stay. |
| 77 | A new git push with updates to check | open | APP self-update (not only plugins). The app checks the repo for new pushes and offers the update (as the plugin bundle update does). Confirmed by Gtex. | Gtex (15:15) approved the full design: the app checks GitHub releases on Zieviox/promptpipe for a newer version, downloads the APK, and opens the Android installer. The user taps Install; "install unknown apps" permission needed once. Needs builds published as GitHub releases, so also add a simple way to publish the local build as a release (a script and a step on the PP commands page). Distinct from the plugin bundle update. Do not start before Gtex says go.
| 78 | Import and export for system prompts | open | New. The library of system prompt pieces needs import (file or paste) and export (one piece, all). Fits with the pieces rework (#69). |
| 79 | No visible option to save chats and their git history to a folder of my choice | open | Step 3/5 of the redesign: "Chats and storage" gets the folder chooser. Alpha9 only adds Move to folder in the Chat sheet and the drawer. |

---

## What the blind rebuild must get right

Every fixed bug above came from one of these. Build them in from the start.

0. **Fix causes, not symptoms.** Bugs 1-3 and 64 were all one disease: a screen that is thrown away and rebuilt, then patched to remember. In this branch the remembering (`snapshotView` / `restoreView` in chat-ui) is a stopgap and the live reply box is the model to copy: build nodes once, update them in place, never rebuild what a person is touching. No guard layers on top of a design that needs them.
1. **A redraw never resets anything.** Scroll place of every list, focus, text selection, typed text and folded/unfolded state must survive. Best: update in place and never rebuild what the person is using; if a screen is rebuilt, carry all of it over. (Bugs 2, 3, 27, 57, 60.)
2. **Layers are a stack, not a pile of history calls.** Sheets, menus and the chats list are one stack with one back-button entry. Closing and opening in the same moment must be safe. (Bug 1.)
3. **Never swallow an error.** Every action that can fail says so on screen, with the reason, and leaves the person where they were. A button that does nothing is the worst bug. (Bugs 3, 5.)
4. **Chat scroll has one rule:** stay at the bottom only if you were there; never move a reader who scrolled up. (Bug 2.)
5. **Nothing the person made may be silently hidden by something older.** A user copy of a plugin that hides a newer one must be shown and fixable. Prefer "newest wins" with a visible override. (Bug 7.)
6. **Every colour is a theme variable,** including the native shell, launcher icon and system bars. A theme is a plugin, the default included. (Bugs 4, 33.)
7. **Site plugins read one message at a time** (thinking, reply and model inside the same message), have exact selectors only, and have a `strip` list for parts that are not text (source numbers). Finish detection is an explicit page signal. Stop and the idle/max limits reach the plugin. (Bugs 8-10, 13-15.)
8. **Unfinished work lives in the chat folder,** not in browser storage: queue, drafts, unsent messages. (Bug 48.)
9. **Copy is one native path** that works long after the tap. (Bug 12.)
10. **A missing feature is shown unavailable and says why,** never hidden. Errors from the OS (file writes, git) carry the OS reason.
11. **Test in a real browser against the real core** before handing over: the whole app runs on a desktop with the core binary, so scroll, sheets, folders and plugin install can be checked there first.
12. **Version rule:** a bundled plugin or part that changes gets a new version, or the updater and user copies will ignore it.
