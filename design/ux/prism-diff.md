# Rewrite vs UI spec: what is missing, changed, matching

**Second pass by Prism (the UI design thread), 2026-11-22.** I checked every item of the first pass against the current `rewrite` code (plugins repo a4f17b5, screen code in runtime-screen/, 3295 lines) and against my design notes, corrected the wording items, and added section E. Gtex's rule: the NEW terms win. A new term is never a gap; it is only mapped to the old spec term. Spec Ops' wireframe v34 to v40 (starter choice, per-chat profile, long-message tuck, branches) is part of the spec now.

## 0. Terms: new word = old spec word (not gaps)
Taken from the rename list in `scripts/terms-check.py` (the full guide, `design/3-terms.md`, is not in either repo I can read, so tell me if a mapping is wrong).
- **block** = row / piece / step (a profile's line). Types: prompt, plugin, message. "Add a block" = "Add a row". "Profiles and blocks" = "Profile".
- **provider** = AI site / site plugin ("site" now only means the website). "Switch provider", "Get providers", "Profile and provider" = Switch site, Get plugins (sites), Profile and site.
- **template** = starter / preset. Plain, Writing feedback, Dialogue & Role play, Story & Prose are the starters.
- **toggle** = a plugin's on/off (old: switch, pill, block on/off). **options** = a site's settings switches.
- **tags** (provider, theme, passive, core, driver) = plugin kinds. **core plugin** = App part. **passive** = Message plugin / Tool. **plugin** = Message plugin.
- **pages** = site view tabs, so "Pages at once" = "Max replies at once" (my "page count"). Not a mismatch.
- **prompt library** = System prompts / the System prompt plugin; prompt blocks link to it.
- Still the spec's own words, so these ARE checked: Quick start (the guide) vs "?" (help mode), Find, Quick edit, Send again, Profile, Chat sheet.


Compared: Zieviox/promptpipe-plugins `rewrite` (5ad2039-era, 2026-11-22) screen code in `runtime-screen/` (screen.js, chat.js, lists.js, commands.js, sheets.js, actions.js, screen.css), `runtime-profiles/`, `runtime-records/schemas.json`, against `ui-redesign/SPEC.md`.
Read-only, by reading code. Nothing was run on a phone, so look and feel are not judged. Items marked (unverified) I could not settle from the code.
Severity: HIGH = a spec feature or rule is absent; MED = partly there or different; LOW = polish or wording.
Not counted as gaps: things the spec itself holds (Roleplay/Tavern, branching and reply versions "after release", site recommendations).

## A. MISSING (HIGH)

1. **Quick start guides are a stub.** Spec: 4 interactive guides, 3 steps each, advance when you do the real action, Skip step / Skip guide / Back / dots, "Take me there", spotlight with block-by-identity, full-screen Welcome + log-in inside the real site view. Rewrite (screen.js GUIDES): 3 short text guides (welcome, profiles, site), a bar with Next/Skip, no interactivity, no Back, no dots, no blocking, no chat-list or Plugins guide, no starter-profile choice in "Say hello", no full-screen welcome, no site pick, no log-in card ("Logged in. I can see the chat box"). Only the Welcome guide opens by itself, and only when there are no chats. Replay in Settings > Help and Find is there; chat-drawer Quick start button and help-bar Quick start button are not. Good to know: the rewrite's bar floats at the bottom and only adds a ".lit" class to the control, it blocks nothing and a missing control cannot trap a tap. That is the safe rule from the phone bug (design v36), so keep it. Still missing there: the dim around the lit control and "Take me there".
2. **Help mode "?" explains almost nothing.** Spec: card with name, plain explanation, Where, shortcut, buttons "Got it" and "Do it"; every control has its one-liner stored next to it; "?" on every sheet header; desktop hover "?"; drag and long-press blocked. Rewrite: header "?" and the setting exist, but a tap shows only the command's place and key, or "Tap it to use it once help mode is off". No Got it / Do it, no per-control text, no "?" in sheets or drawer, no hover "?" (screen.js help_explain).
3. **Settings pill in the chats drawer is missing.** Spec: Settings (sliders icon, update badge) bottom-left of the drawer. Rewrite: drawer has no Settings button at all. On a phone you reach Settings only through Find. Same for the drawer's Quick start button.
4. **Folders in the drawer are cut down** (lists.js). Missing: folder edit icon (rename, delete with confirm, chats move to top level), chat count, drop-on-folder = into it, take out of a folder by drop, folders reorder only at top level, Pinned section always present and collapsible (it only appears when something is pinned) and as a drop target, dragging a selected row moves all selected, long-press to select, tapping a folder selects its chats, Unpin in the bulk bar (only Pin), Unpin on the row (the pin button always pins).
5. **Profile dropdown missing.** Spec: inline expanding dropdown (scrollable, Edit on each row, + New, Import, Export this, Export all) in Profile and in the editor to switch profile being edited, and at the top of Quick edit ("This chat's profile · tap to switch"). Rewrite: a plain Profiles sheet listing profiles then a profile page; no dropdown anywhere.
6. **Quick edit drawer is only partly the spec.** Title = profile name works. Missing: subtitle "Quick edit · tap the name to rename", tap-title-to-rename, the profile switcher, arrows as backup to drag, "Edit profile" as a pill. The button is a plain "≡", not layers-plus. Whether the profile truly belongs to the CHAT: Ctrl+P (profile_next) and "Use this profile" set the global default `chats.profile`, not the open chat's (commands.js profile_next). (unverified for chat open/new chat flow)
7. **Replies: "Sent with" is missing.** Spec: thin "Thought for N s · sent with N" expanding to thinking, the "Sent with" list and "Show the full text". Rewrite shows only "Thought for Ns". "What will be sent" exists only in the profile page, not per reply.
8. **Switching site in a chat that already has replies does not ask.** Spec: asks, starts a new conversation on the new site, Memory carries context. Rewrite: provider menu just sets the chat's provider (chat.js pick).
9. **Background reply toast missing.** Spec: dot, "Reply ready", tappable toast. Rewrite: only a "new" badge in the list and "↓ 1 new" button in the open chat.
10. **Confirms missing where the spec asks for them.** No confirm on: Delete this chat, bulk Delete, Delete this profile, Remove plugin, Reset to first launch (sheets.js, lists.js). Spec lists confirm for delete, remove, reset.
11. **Site view gaps.** Missing "Open in PromptPipe" for tabs not linked to a chat, and an "Open chat" button for linked ones (it is only the text "Linked to …"). (lists.js site_bar_render). Tabs, dots, + new, editable URL, reload are there.
12. **Plugins screen.** Spec: Profile | Library tabs, filter chips (All, AI sites, Message plugins, Themes, Tools), update dots and badges on rows and on Settings, Update all. Rewrite: tabs "Profile and installed | Catalogue"; no chip row (a filter exists only through the provider menu), no update dots or badges, Update all only inside the catalogue tab. Third-party source: only a key-trust prompt, no red "plugins are code and can read your chats" warning. No "Official" label on the default source. Name clash across sources not asked.
13. **Plugin guide screen missing its main button.** Spec: "Copy instructions for AI" (guide + request template) then "Install the result". Rewrite: Help lists "Plugin guide"; install sheet has "Install the answer"; no copy-for-AI button found.
14. **Max replies at once ("Pages at once").** The new term stands. Still missing from the spec: the warning screen plus an "unlock" step to go above 5 (up to 10). The rewrite has only a description line (schemas.json). LOW.

## B. CHANGED OR MISMATCHED (MED)

15. **Icons.** Spec rule 7: one line-icon family, no emoji, sliders for Settings. Rewrite uses text glyphs and emoji: ☰ ⌕ ⋯ ⧉ ❝ ↻ ≡ ⤢ ⋮⋮ ☑ ☐ and the 📌 emoji (also in prompt list). No Settings icon at all.
16. **Long-message tuck.** Spec: over 8 lines or 600 characters, ~6 lines fading, a "Show more ⌄" / "Show less ⌃" line. Rewrite: over 6 lines or 500 characters; fade is there (CSS), but no visible Show more / Show less line, the whole bubble is the tap target.
17. **Find.** Matches: chats, functions, messages, place + shortcut, "Quick start" entry, actions without a screen. Missing: opening the screen with the control highlighted, F3, path shown as a real path (shows only the place text).
18. **Action row under a reply.** Collapse and the "newest / every / collapsed" setting are there. Missing: "Select text" (maybe inside More, unverified), "#N" count when collapsed (shows only ⋯), tags only when expanded works. Quick edit icon and Copy/Quote/Send again exist.
19. **Chat status words.** Spec: "Replying…" then "Reply ready" with a dot. Rewrite: "answering…" and a "new" badge. Wording may be the new vocabulary; Gtex to say. LOW.
20. **Wording is mapped, not flagged.** "block", "provider", "template", "toggle" are the new terms (see section 0). SPEC.md still says rows, site, starter; it should be updated to the new terms in a later pass rather than the app.
21. **Settings names.** "Prompt library" = the new term (was System prompts). "Pages at once" see 14. The extra Git and Credentials groups are additions: fine, but Git also appears under Chats and storage, so one place is enough. UI scale is a 60 to 200 step control, the spec has 90/100/115/130 (a superset, fine). LOW.
22. **Header pill** shows "Provider · model" with a dot: the term is new, behaviour matches. The dropdown adds "Profile and provider" and "Get providers" rows (extra). One thing to check on a phone: at large UI scale the title should shrink first, not the pill (unverified).
23. **Scroll rule.** Chat follows output only when at bottom: done (at_bottom + stay_at_bottom setting). Redraws patch in place with Preact, no snapshot needed. Risks: `at_bottom` is one global flag, not reset when you open another chat, so opening a chat while scrolled up may not land at the bottom (unverified). "Jump to latest" is "↓ 1 new", which scrolls to that turn's start, only after a reply finished.

## C. MATCHES

- Header: burger, title opens chat sheet, site pill with dropdown, Find, no ⋯ menu.
- Chats drawer basics: New chat, New folder, Select, search, #tag chips, drag grips, Pinned list when present, "On the site…".
- Chat sheet: rename, tags, pin, copy whole chat, share/export, move to folder, history, delete.
- Starters: Plain, Writing feedback, Dialogue & Role play, Story & Prose; empty Master system prompt first; Base64 off above the message (runtime-profiles/templates.json).
- Profile editor: ordered rows, drag, on/off switch, "Your message" movable, system prompts anywhere among plugins, Add, Rename, Duplicate, What will be sent, Export this, Import, Export all; send modes every / first / every N / depth N / off.
- Import name clash setting Ask / keep both / replace.
- Message bar: Quick edit opens a bottom sheet, text file, several text files, attach, bigger/smaller box (Ctrl+E) keeps the text; per-chat toggles; "use the profile's toggles".
- Site is per chat (own provider); send queue with Move up / Edit / Remove; failed sends with Check / Retry / Edit / Dismiss / Open the site / Copy page report.
- Plugins: sources with key check, default source, install from file or link, plugin page with roll back and remove, themes.
- Settings groups: Look (light/dark, accent, scale, quick actions), Sites, Chats and storage, Import and export, Local API, Advanced (reset, safe mode, core log), Help (shortcuts, quick start, show "?" setting).
- Quick edit: the per-chat toggles (a chat's own toggles start from the profile's; "Use the profile's toggles" resets them) and the "Add to your message" rows (Text file, Several text files, Attach files, Edit profile) match the design.
- The "Bigger message box" button sits in the message bar itself.
- Find: "Try" chips, results with place and shortcut, plus message search (an addition).
- Keys and Back close the top layer first; every shortcut also has a touch path except Settings, Quick start and F3 (see A3).

## D. HELD BY THE SPEC (not gaps, but one risk)

- Reply versions "< 2/3 >" and branches, sibling files, "Versions and branches" row: not built, correct per "after release". Risk: "Edit and resend" (`replaces`) and "Send again" still overwrite or duplicate; this is the bug that branching is meant to fix.
- Roleplay / Tavern: held.

## Suggested fix order (smallest big wins first)
1. Drawer: Settings pill + Quick start button, always-present Pinned, folder rename/delete, Unpin, counts.
2. Confirms (delete chat, delete profile, remove plugin, reset).
3. Help mode card (data per control) and "?" in sheets.
4. Profile dropdown + Quick edit title/subtitle/rename + per-chat profile.
5. Quick start rebuilt as interactive guides.
6. Replies: Sent with, toast, site-switch ask.
7. Plugins chips, badges, Library naming, copy-for-AI.
8. Icons (one line family), long-message line, wording.

## E. Added by Prism (second pass)
Checked against the code; not in the first pass.
1. **Find empty state has no "Recent" chips.** Spec: Recent (last searches or actions) plus Try. Rewrite has Try only (lists.js find_render). LOW.
2. **Edit profile in Quick edit is a plain row, not a pill in the header.** Spec: pill next to the title, so it stays in reach without scrolling the sheet. LOW.
3. **Reorder in Quick edit is drag only.** Spec had up/down arrows as a backup for keyboard and for people who cannot drag. Phone users can drag, so this only matters for desktop and accessibility. LOW.
4. **Starter list in the spec is out of date, not the app.** Spec says Plain, Story writing, Writing feedback, Role play. Cadence/Gtex shipped Plain, Writing feedback, Dialogue & Role play, Story & Prose. Update the spec. The starter CHOICE in the Chatting guide step 1 is still missing (see A1).
5. **Extras in the rewrite that my design never had.** Keep or drop is Gtex's call: swipe across a reply (right quotes, left copies), message search with operators ("phrase", #tag, in:folder, is:you), "Attach files", failed-send actions (Check / Retry / Edit / Dismiss / Open the site / Copy page report), send queue with Move up / Edit / Remove, Git and Credentials settings groups, themes as plugins. Swipe is the only one with a risk: a sideways swipe may fight the chat scroll on some phones (unverified).
6. **Per-chat profile.** The per-chat toggles match. Still open from A6: "Use this profile" and Ctrl+P set the global default instead of the open chat's profile; the Quick edit switcher and the rename-by-tapping-the-title are missing.
7. **Versions and branches (design v40, approved by Gtex, build after the release).** In the rewrite today "Send again" re-sends the message as a new turn and "Edit and resend" fills the box with `replaces`. When this is built it should follow SPEC.md: reply versions with "< 2/3 >", branches as sibling files (main file untouched, branch file holds only what comes after the split with a "branched from main at message N" line), and Memory builds only from the shown path.
8. **Long messages.** A mismatch to settle: wireframe/spec 8 lines or 600 characters with an explicit "Show more ⌄ / Show less ⌃" line; rewrite 6 lines or 500 characters with the bubble itself as the tap target. Which numbers win? I suggest the wireframe numbers and the explicit line, because a bubble you must know to tap is easy to miss.
9. **Welcome and log-in.** The spec has a full-screen Welcome and a log-in step inside the real site view with a "Logged in. I can see the chat box." confirmation. The rewrite's "welcome" guide is 4 pointer bubbles and has no log-in help, so a first-time user is not told they must log in on the provider's own page. This is the biggest first-run gap. HIGH (same as A1, called out because it blocks new users).

## F. Not checked
- Anything about look and feel on a phone (nothing was run).
- `design/3-terms.md` itself (not readable here); the term map in section 0 comes from terms-check.py.
- Android-only parts (permission dialogs, notifications, the site view hole): not in my design.
