# PromptPipe UI redesign: spec for implementation

> **HOLD (Gtex 2026-11-07): do NOT build the Roleplay / Characters / Tavern import-export work yet.** Skip the sections "Characters: Tavern card support" and "Roleplay plugin = SillyTavern support" below until PromptPipe has a fully released alpha with a GitHub Pages site. Only the basic design (the wireframe) stays as reference. Everything else in this spec is in scope.


Source of truth: the interactive wireframe (live: https://claude.ai/artifact/TcV1HiJYxyeevdzcZMgBbA, v23).
Local copy: `wireframe.html` (open in a browser) and `wireframe-script.js` (its logic) in this folder.
Baseline screenshots of the current app: `/mnt/project-files/promptpipe/screens/alpha6/` (sheet: https://claude.ai/artifact/F1oy3VPd8Wq18PZWAMV26g).
Every decision below was made by Gtex on 2026-11-07. Where this text and the wireframe differ, ask Gtex.

## Rules that apply to all of it (Gtex)
1. Fix root causes. Guards and workarounds only when there is no real solution; no stacks of guards.
2. Redraws never reset scroll or state anywhere. The chat stays where it is unless already at the bottom (then it follows new output). The wireframe's `render()` rebuilds everything, so it snapshots the scroll of every scrollable element (by DOM path) and restores it while the same view stays open; changing view starts at the top on purpose. In the app prefer updating in place; keep a generic restore only as the fallback.
3. Phone first: nothing keyboard-only. Every shortcut has a touch control. Desktop stays keyboard drivable.
4. Data-oriented, functional style: flat data, pure functions, side effects at the edges. Third-party libs behind our own thin wrappers.
5. Organize, never hide. A feature a platform cannot do is shown as unavailable, never removed.
6. Plain words: no "pieces". Say "rows" and "message plugins" ("Adds text" / "Changes text").
7. One line-icon family in the text colour. No emoji glyphs. Settings icon is the sliders icon (the gear looked like a pin).
8. Bugs found on the way go to BUGS.md as usual.

## Header
Burger (chats drawer), chat title (opens the Chat sheet), site pill (`Site · Model ⌄`, dropdown to switch site), Find button. No ⋯ menu. At large UI scale the title shrinks first; pill and Find stay visible.

## Find (Blender F3 style)
Always visible. Searches chats and every function and setting. Each result shows its path and shortcut, and opens the screen with the control highlighted. Desktop: Ctrl+K and F3. Also lists actions that have no screen (Quick plugins, Bigger message box, Put a text file in the box, Edit this profile, Select chats, New folder).

## Chats drawer (burger)
- One compact list: Pinned header, folders and chats together.
- Search chats and `#tag` filter, tag chips, + New chat, + Folder (inline create box).
- Per row: pin button, drag handle. Folder row: edit icon (rename, delete; delete moves its chats to top level, with confirm), count, chevron.
- Pinned section collapsible, always present, also a drop target (drop = pin). Pinned chats show only there.
- Drag and drop: drop on a folder = into it; between rows = reorder or take out of a folder; folders reorder too. Works with several selected chats: dragging one selected row moves all.
- Multi-select: check button in the header or long-press. Tap rows, tap a folder to select its chats. Bar: Pin or Unpin, Move…, Delete (confirm), Done.
- Status per chat: "Replying…" and "Reply ready" (dot). Settings pill bottom left (sliders icon, update badge).
- Later (not now): same folders for profiles and system prompts if lists get long.

## Chat sheet (tap the title)
Rename, tags, Pin to top, Copy the whole chat (Markdown), Share or export, Move to folder (screen), Sub-chats, History. Later: export choice Clean / With thinking / Full file, also per chat in the list.

## Chats run live in parallel
A background reply never moves the view: a dot, "Reply ready", and a tappable toast. Site is per chat (not per profile); a new chat uses the last site; switching site in a chat that already has replies asks (new conversation on the new site, Memory carries context). Idea kept, not built: a profile may recommend a site, shown as a hint when starting a new chat with that profile, never forced.

## Replies
Thin collapse "Thought for N s · sent with N": expands to the thinking and the "Sent with" list (profile rows used) plus "Show the full text". Action row under a reply is collapsible in place (Copy, Quote, Send again, Select text, tags only when expanded; `#N` count when collapsed). Setting: quick actions on newest reply only / every reply / collapsed. User messages: Copy, Edit. Auto-scroll only when at bottom, plus "Jump to latest".

## Message bar
- Layers+plus button (label "Quick edit and add") opens a bottom drawer, not a screen. Title = active profile name, subtitle "Quick edit". Rows of the active profile in order: switch on or off, drag handle and arrows to reorder, "Your message" is a normal movable row without a switch. "Edit profile" pill. Bottom section "Add to your message": Text file, Several text files.
  - Update (wireframe v38, Gtex 2026-11-08, built in the app e7f88a7): the profile belongs to the CHAT. The drawer title is the chat's profile name and tapping it renames the profile (inline field + Save); subtitle "Quick edit · tap the name to rename". At the top of the drawer sits the profile dropdown (same as in Profile and site) with the sub line "This chat's profile · tap to switch". Opening a chat makes its profile the active one, and new chats start with it. Switching sets the open chat's profile, and that chat's own switches start over from the new profile.
- Bigger/smaller message box button inside the bar (Ctrl+E). The typed text is kept.

## Profiles ("Profile" replaces "pipeline")
A profile is an ordered list of rows: system prompts and message plugins, with "Your message" movable anywhere (SYS prompts can sit before or after any plugin). Drag and drop with arrows as backup.
- Profile dropdown expands inline (scrollable list, Edit on each row, + New, Import…, Export this, Export all). The active profile bar has its own Edit button when collapsed. The same dropdown inside the editor switches which profile is edited. Dropdowns close on navigation.
- Export and import of profiles and system prompts. Name clash on import: default keep both; a question with "don't ask again"; the setting (Ask / Always keep both / Always replace) lives in Settings › Import and export.

## Plugins screen
Tabs Profile | Library, update dots and badges, Update all. Library: filter chips (All, AI sites, Message plugins, Themes, Tools). Sites are plugins too. Plugin page: update, roll back, remove (confirm), and later "Make my copy".
- Several plugin sources (repo links). Default `Zieviox/promptpipe-plugins` (Official). Third-party sources show a warning. Name clash across sources is asked.
- Install from a file or link.
- Plugin guide screen: the guide, a "Copy instructions for AI" button (guide plus a request template, usable for AI or by hand), and "Install the result".

## Settings
Plugins, System prompts, Look (light or dark, accent, **UI scale 90/100/115/130%**, quick actions), Sites (**Max replies at once**: default 5, warning and unlock up to 10), Chats and storage, Import and export, Local API, Advanced (Reset to first launch with confirm; data stays), Help.

## Site view
Tabs synced with the chat view, state dots, + new tab, editable URL, reload, "Open in PromptPipe" for tabs not linked to a chat, "Linked to chat" with Open chat.

## Not in this round
Roleplay plugin (Tavern cards, lorebooks, personas, presets, chats, groups): ON HOLD until a fully released alpha with a GitHub Pages site.
Site recommendations, folders for profiles and system prompts, export variants, "Make my copy", desktop layout work. Do not build them unless Gtex asks.

## Suggested order for Warden
1. Header, Find, drawer (folders, pins, select), chat sheet.
2. Message bar drawer and big box.
3. Profile model, dropdown, drag and drop, import and export.
4. Plugins screen, sources, Plugin guide.
5. Settings reshuffle, UI scale, Max replies.
6. Site view tabs and parallel chats polish.
Show Gtex each step on the phone; he verifies before a bug or step is closed.

## Long messages (wireframe v39, from Spec Ops, built but held for the release)
- YOUR message counts as long when it is over 8 lines or 600 characters. It shows about 6 lines fading out at the bottom, with a small "Show more ⌄" line under it (same style as "Sent with"). Tapping opens the message in full and the line becomes "Show less ⌃". AI replies are never tucked. Wireframe example: the Feedback on chapter 3 chat.

## Versions and branches (wireframe v40, Gtex 2026-11-08, approved, build after the release)
Problem (Gtex): "Retry keeps the old try instead of branching". Retry must never overwrite or silently drop a reply, and chats need branching.
- **Reply versions (Send again / Retry).** Sending again keeps the old reply as an earlier version. The new reply is the shown version, and a small switcher "< 2/3 >" sits in the reply foot (also in the expanded actions row). The arrows page through versions; only the shown version counts as history for what comes next. Toast: "New version 2. The earlier one is kept."
- **Branches (Edit and resend).** Editing one of your messages and sending does not overwrite it. It starts a branch from that message: the old message with everything after it is kept as branch 1, the edited message with its new reply is branch 2. Your message shows a switcher "< Branch 2/2 >" above it; switching changes your message and every message after it. Toast: "New branch. The earlier one is kept."
- **Rules.** Only the shown branch and versions are sent to the site and to Memory. A reply version is a leaf: a message sent after it continues from the shown version. Sub-chats (continuing from a chosen reply) are a different thing and stay as they are.
- **Memory and other plugins (asked by Warden, #93).** Memory, summaries and any plugin that reads history use ONLY the shown path: the shown version of each reply and the shown branch of each edited message. Earlier versions and other branches are left out, as if they were not in the chat. Switching a version or branch changes what the next send uses; Memory must not keep summaries of hidden versions as if they were live (rebuild or ignore from the branch point).
- **Saved files (DECIDED by Gtex 2026-11-08, "the safe route").** The main chat stays ONE file, untouched by branching. Every branch is a SIBLING file next to it that holds only the part after the split, plus one line at the top: "branched from main at message N" (N = the message it splits from). A reply version made with Send again is stored the same way: a sibling file that starts at that reply, branched from main at that message (assumption by Prism, to keep one rule; Gtex can change it). The main chat is branch 1 and is never rewritten. Which branch or version is shown is a small setting kept per chat (not inside the main file). Plain readers and Git history see every file. Naming and the exact header line are Warden's call.
- **Plugins reading a branch.** The history for a branch = main up to and including message N, then the branch file. Memory and other plugins build from that, never from the other branches. Memory data for a branch lives under the branch's own name so switching branches never mixes summaries.
- **Build timing.** After the release (Gtex 2026-11-08).
- **Chat sheet.** A row "Versions and branches" explains the arrows (Send again keeps the old reply; Edit and resend branches).
- **Wireframe.** In the sample chat: expand a reply and tap Send again for the version switcher; tap Edit and resend on your first message, change the text and send for the branch switcher. Only the first branch point works in the wireframe.

## Quick start: interactive guides (rewritten 2026-11-07, wireframe v34; Gtex)
Not one long tour. Four short guides, three steps each, each opening the FIRST time the user visits that place (remembered in storage; shown once). Interactive: the user does the real action, the guide advances by itself when it sees it done. Nobody remembers a lecture. Every step also has Skip step, Skip guide, and Back; dots jump.
1. **Welcome and log in** (first launch, FULL SCREEN, its own section): Welcome; Pick a site (Qwen Chat, DeepSeek, Later); Log in. Log-in copy stays short and plain (young-reader friendly): why ("PromptPipe has no AI of its own. It uses the chat site for you, like you would."), big numbered 1-2-3 (tap Open site, log in like normal, come back), status Not logged in / Waiting / Logged in, reminder: you log in on the site's own page, use an account you can afford to lose, sites may limit automated use. VERIFY "not in a PromptPipe form" against the real app before shipping.
   **The log-in happens INSIDE the real site view** (Gtex 2026-11-07): tapping Open Site shows the site's own login page in the normal site view (tabs, address bar), with a small guide card at the bottom: "Log in like normal. PromptPipe tells you when it sees you are in." The site plugin reports when the chat box appears; the card then turns green: "Logged in. I can see the chat box." with Done (back to the chat). A manual "I am logged in" fallback stays for sites where detection fails. On a real first launch the site view should show only the one login tab (the wireframe shows its demo tabs).
2. **Chatting** (first time the chat screen shows after setup; wireframe v37, Gtex 2026-11-08): the first step, "Say hello", shows a short starter-profile list in its card before the user types: Plain (preselected, "Just your message"), Story writing, Writing feedback, Role play. Tapping one makes it the active profile. Asked once only: skip the list if the user already has more than the default profile. The guide stays 3 steps. Then: send a message (advances when sent); tap Find (advances when it opens, then closes it); tap Quick edit (advances when it opens, then closes it).
3. **Chat list** (first time the list opens): pin a chat; tap the select check; type in search. Mentions that drag handles move chats and folders.
4. **Plugins** (first time Plugins opens): open the Library tab; tap Update all (skipped if nothing to update); Plugins from friends: "A repo is a list of plugins. A friend can send you a link. Tap Get plugins, then Sources." with a warning box: only add repos from people you trust, plugins are code and can read your chats, never add one from a random site.
Spotlight and blocking rule (rewritten after the phone bug, Spec Ops + Gtex 2026-11-07): block by IDENTITY, never by screen rectangles. While a spotlight step runs, a capture-phase listener (click, pointerdown, pointerup) ignores any tap whose target is not inside the lit control or the guide card; the dim is only a visual (a big shadow on the lit control). Why: the earlier version drew four invisible rectangles around the control. When the control was not on screen, or the layout moved (scroll, keyboard, rotation), the rectangles blocked the whole screen. Rules: (1) if the lit control is not on screen (missing, hidden, zero size, outside the screen), block NOTHING and dim nothing; the card says "That control is not on this screen" with "Take me there" (each step has a `go` that opens the right place) and Skip step; (2) the control is scrolled into view once when the step starts; (3) the card always has Skip guide, and Esc ends the guide; (4) no step may wait on something that cannot happen, and every interactive step has Skip step; (5) a guide never starts while another overlay (sheet, confirm, help) is open. The card moves to the top when the lit control is in the lower half.
Replay: Settings > Help > Quick start lists the guides (Seen or New) with "Show every guide again"; the chat list has a Quick start button next to Settings; the help-mode bar has Quick start; Find has "Quick start guides"; the Plugins header has a play button for the plugins guide; Reset to first launch clears the seen marks. Preview in the wireframe: add #tour to its link to reset the seen marks.
Open: where the starting profile choice (Plain, Story writing, Writing feedback, Role play) belongs now that the welcome guide has only site and log in.

## Help mode, the "?" (added 2026-11-07)
A "?" button in the header and in every sheet header (setting: Settings > Help > Show the ? button, on by default; off removes the button). Tap it to enter help mode: a bar says "Help mode. Tap anything to see what it does." Tapping any control shows a card instead of acting: name, plain explanation, "Where" (settings path) and shortcut, buttons "Got it" and "Do it" (leaves help mode and performs the action). Done button or Esc leaves. Drag and long-press are also blocked in help mode. The wireframe has real text only for the main controls; for the build, every control and row needs its one-line explanation, kept next to the control's definition (data, not a separate list).
Update (Gtex 2026-11-07): the "?" must be in reach on EVERY screen (header, chats drawer, Find, Quick edit drawer, every sheet, site view). On desktop, hovering any item shows a small "?" at its corner (mouse only, off when the ? setting is off); clicking it opens the explanation card for that item without entering help mode.

Naming (Gtex 2026-11-07): "Quick start" = the guided walkthrough (first launch, then replayable). "?" = explain any item. Two different things, never merge them. Quick start entry points: first launch and Reset to first launch, a Quick start button in the chats drawer next to Settings, Settings > Help > Quick start, a Quick start button in the help-mode bar, and Find ("Quick start tutorial").

## LATER, ON HOLD: Characters: Tavern card support (added 2026-11-07, wireframe v29; Gtex: its own section, feeds system prompt rows)
Own section: Settings › Characters (not inside System prompts). Based on Scout's notes (/tmp memory pp-import-export-formats): V1 (6 fields), V2 (`chara_card_v2`, PNG tEXt chunk `chara`, base64 JSON), V3 (`chara_card_v3`, tEXt chunk `ccv3`; prefer it when both exist); embedded lorebook = `character_book`; standalone lorebook = SillyTavern World Info JSON. Verify the formats against official docs before building.
- **Characters list:** Import a card, New character, your characters (format badge, about N words, lorebook count), roleplay settings (your name replaces `{{user}}`; `{{char}}` = card name; lorebook look-back in messages; lorebook size limit in words), note "Cards are read, never run" (scripts and extensions in a card are ignored; unused fields are kept and exported back unchanged).
- **Import:** PNG or JSON or link. A preview screen first: name, detected format, fields found, lorebook entry count, greeting count, fields PromptPipe does not use (kept untouched), size in words with a "long card" warning above about 1500 words. Name clash keeps both (follows the profile clash setting).
- **Card page:** avatar (from the PNG) and name; Add to this profile; Start a new chat with it (pick an opening); Turn into system prompts (plain editable SYS prompt rows from the parts that are on; the card stays); the parts that are sent, each with words and an on/off switch (Description, Personality, Scenario, Example dialogue, card's own system prompt, post-history instructions); Lorebook; total words per message; Edit fields; Export as PNG, JSON V2, JSON V3; Duplicate; Delete.
- **Lorebook:** entries added to a message only when a keyword appears in the last N messages; "Always on" entries every time; per-entry switch; add, import World Info, export.
- **Feeds the profile (system prompt rows):** "Add a row" lists Characters; it adds ONE "Character: Name" row, movable like any row, with an Open-the-card button. At send time the row expands to the enabled parts as system prompt text (in the order above), then lorebook hits up to the size limit. Shows in "Sent with" and Quick edit like other rows.
- **Open questions for Gtex:** (1) A site chat cannot receive an AI greeting. Proposal: the opening is shown locally as the first message and sent once as context in the first message. (2) Ship Characters as a built-in app part (the plugin way) so the base app stays small? (3) Lorebook keyword scanning also covers regex or secondary keys later, not now.
Decision (Gtex 2026-11-07): Characters is a PLUGIN and upgradable. It appears in Plugins › Library like any plugin (update dot, update, roll back, remove, on/off) and Settings › Characters shows an Update badge. Public base app plugin (non-site plugins live in the base repo). Updating never touches cards and lorebooks (user data). If the plugin is removed, the Settings entry stays and says Characters is not installed, with a one-tap Get (never hidden).

## LATER, ON HOLD: Roleplay plugin = SillyTavern support (update 2026-11-07, wireframe v32; replaces the narrower "Characters" plugin)
Gtex: support everything from SillyTavern that can work, not only characters, all through ONE upgradable base plugin ("Roleplay", public base app). Settings › Roleplay hub:
- Library: Characters (cards V1/V2/V3, PNG/JSON; screens as in the Characters section above), Lorebooks (standalone SillyTavern World Info, per-book on for every chat, same entry screen as a card's lorebook), Personas (name + short description; `{{user}}` becomes the active persona's name), Groups (several characters in one chat; turn order: take turns, I choose, whoever I name).
- Bring in and take out: Presets (SillyTavern prompt manager and instruct presets import as a PROFILE: each prompt becomes a matching row, character, scenario, persona and world info map to Character, Persona and Lorebook rows; sampler settings are kept but not used because chat sites do not take them), Chats (import and export SillyTavern chat JSONL; branches become sub-chats; imported chats go to a folder).
- Settings: lorebook look-back, lorebook size limit, "Show the opening in the chat" (decided: the character's opening shows locally as the first message and is sent once as context).
- "What PromptPipe uses and ignores" screen. Used: cards, lorebooks, personas, presets, author's note and depth prompts (as rows with "At depth N"), chats and branches, groups. Kept in the file, never run: sampler settings, regex scripts, extensions, voice, images, expression sprites. Nothing is thrown away; exports return unknown fields unchanged. Unsupported things are listed, never hidden.
- Profile rows: "Add a row" gets a Roleplay section: Persona, Lorebooks, Characters; each is one movable row (Open-the-card button on character rows).
- Content stays the user's own business: PromptPipe imports and runs the text; it does not tune or ship prompts meant to get around a site's filters.

Quick start rule (found on Gtex's phone 2026-11-07): during a guide nothing outside the lit control may be pressable. Taps must never reach the app underneath (the earlier version let taps through and opened the chat list behind the card). Only the lit control accepts a tap, and only on interactive steps.
