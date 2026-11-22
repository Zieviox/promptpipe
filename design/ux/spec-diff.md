# The UI spec against the remade screen (2026-11-22)

`SPEC.md` (with `wireframe.html`) compared item by item with `runtime-screen` as built on the
`rewrite` branch. Read-only: nothing was changed. This compares what each screen has and does.
**The look matters too** (Gtex, 2026-11-22): when the screen work resumes, each screen is also
matched to the wireframe visually (layout, spacing, sizes, colours, icons) and shown side by side
in screenshots; that comparison isn't in these tables yet.

**Built** = there and as the spec says. **Partly** = there, but different or incomplete.
**Missing** = not there. **Later** = the spec itself holds it back.

## Totals

| | Built | Partly | Missing | Later |
|---|---|---|---|---|
| Items | 34 | 34 | 23 | 3 |

Decided after the comparison (2026-11-22): the spec is UX only (the words are the settled terms),
and its Quick start guides are skipped. The biggest gaps: **no button opens Settings** (only
Ctrl+, or Find), **help mode** (only in the header, no
explanations), **Find** (doesn't open the control, no settings in it), the **drawer** (no folder
editing, no drop into folders, no Settings or Quick start buttons), the **Quick edit drawer** (no
profile dropdown or renaming), and **icons** (text characters and an emoji instead of one line-icon
family).

## Rules for all of it

| Spec | Screen | |
|---|---|---|
| 2. Redraws never reset scroll or state; the chat follows only at the bottom | Preact updates in place; stays at the bottom only when already there | Built |
| 3. Phone first: every shortcut has a touch control | Most do; **Settings has no touch control at all** (Ctrl+, or Find) | Partly |
| 5. Organize, never hide: unavailable shown as unavailable | Nothing hidden by platform; not checked screen by screen | Partly |
| 6. Plain words | The settled terms ("blocks", "plugins"); the spec is UX only (decided 2026-11-22) | Built |
| 7. One line-icon family in the text colour, no emoji, sliders icon for Settings | Text characters (☰ ⌕ ⋮⋮ ↻ ⧉ ❝) and the 📌 emoji; no sliders icon | Missing |

## Header

| Spec | Screen | |
|---|---|---|
| Burger opens the chats drawer | Yes | Built |
| Chat title opens the Chat sheet | Yes | Built |
| Site pill `Site · Model ⌄` with a dropdown to switch site | Provider name, model and status dot; menu to switch, open the site, get providers | Built |
| Find button | Yes | Built |
| No ⋯ menu | None | Built |
| At large UI scale the title shrinks first | The title shortens with "…"; not checked at large scales | Partly |

## Find

| Spec | Screen | |
|---|---|---|
| Searches chats and every function | Chats, commands and messages | Built |
| …and every **setting** | Settings aren't in it | Missing |
| Each result shows its path and shortcut | Place and key shown | Built |
| Opens the screen **with the control highlighted** | Runs the command instead | Missing |
| Ctrl+K and **F3** | Ctrl+K only | Partly |
| Lists actions with no screen (Quick plugins, Bigger message box, text file, Edit this profile, Select chats, New folder) | All of these are commands, so they're found | Built |
| Empty state: **Recent** (last searches or actions) plus Try | Try only | Missing |

## Chats drawer

| Spec | Screen | |
|---|---|---|
| One list: Pinned header, folders and chats together | Yes | Built |
| Search chats and `#tag`, tag chips | Yes | Built |
| + New chat, + Folder with an **inline** create box | New chat; New folder opens a dialog | Partly |
| Per row: pin button, drag handle | Yes (pin is an emoji); the pin button always pins, there's no Unpin on the row | Partly |
| Folder row: **edit icon (rename, delete; delete moves its chats out, confirm)**, count, chevron | Chevron and "+ new chat here"; no edit, no count | Missing |
| Pinned section collapsible, always there, a drop target (drop = pin) | Shown only when something is pinned; not collapsible; not a drop target | Missing |
| Drop on a folder = into it; between rows = reorder or take out; folders reorder; several selected move together | Reorder at the top level only | Partly |
| Multi-select from a header button **or long-press**; tap a folder to select its chats | Select button only; no long-press, no folder select | Partly |
| Select bar: Pin or Unpin, Move…, Delete (confirm), Done | Pin, Move, Delete (no confirm, no Unpin), Done | Partly |
| Status per chat: "Replying…" and "Reply ready" (dot) | "answering…" and a "new" badge. No settled term covers these, so by the naming rule the spec's labels apply | Partly |
| **Settings pill bottom left** (sliders icon, update badge) | None | Missing |
| **Quick start button** next to Settings | None | Missing |

## Chat sheet

| Spec | Screen | |
|---|---|---|
| Rename, tags, Pin to top | Yes | Built |
| Copy the whole chat (Markdown), Share or export | Yes | Built |
| Move to folder (a screen) | Yes | Built |
| Sub-chats | Yes, when Sub-chats is installed | Built |
| History | The chat's commits | Built |
| "Versions and branches" row | — | Later |

## Chats running in parallel

| Spec | Screen | |
|---|---|---|
| A background reply never moves the view; a dot | Yes ("new" badge) | Built |
| "Reply ready" **tappable toast** | No toast | Missing |
| Site per chat; a new chat uses the **last** site | Per chat; a new chat uses the default provider setting | Partly |
| Switching site in a chat with replies **asks** (new conversation, Memory carries context) | Switches without asking | Missing |

## Replies

| Spec | Screen | |
|---|---|---|
| Thin collapse "Thought for N s · **sent with N**" expanding to the thinking, the "Sent with" list and "Show the full text" | "Thought for N s" opens the thinking; "Sent with" and the full text are in the ⋯ sheet | Partly |
| Action row collapsible in place: Copy, Quote, Send again, **Select text**, tags | Copy, Quote, Send again, More, tags; no Select text | Partly |
| `#N` count when collapsed | Not shown | Missing |
| Setting: newest only / every / collapsed | Yes | Built |
| Your messages: **Copy, Edit** | Copy and Edit in the ⋯ sheet, not on the message | Partly |
| Auto-scroll only at the bottom, plus **"Jump to latest"** | "↓ 1 new" only | Partly |
| (Rule 2) Opening a chat lands at its newest message | The "at the bottom" flag isn't reset when another chat opens, so a chat opened while scrolled up elsewhere may not land at the bottom (found by Prism) | Partly |

## Message bar and Quick edit

| Spec | Screen | |
|---|---|---|
| "Quick edit and add" button opens a **bottom drawer** | Opens a sheet from the bottom | Built |
| Title = the **chat's** profile name, **tap to rename** (inline field + Save); subtitle "Quick edit · tap the name to rename" | Profile name as the title; no renaming there | Partly |
| **Profile dropdown at the top**, "This chat's profile · tap to switch" | Not there (switching is in Profiles) | Missing |
| Rows on/off, drag handle **and arrows** | Switches and drag; no arrows | Partly |
| "Your message" movable, no switch | Yes | Built |
| "Edit profile" **pill next to the title**, in reach without scrolling | A row at the bottom of the sheet | Partly |
| The profile belongs to the **chat**: switching sets the open chat's profile, new chats start with it (wireframe v38) | A chat can have its own profile, but "Use this profile" and Ctrl+P change the default for new chats, not the open chat's (found by Prism) | Partly |
| Add to your message: Text file, Several text files | Yes, plus Attach files | Built |
| Bigger box button in the bar, Ctrl+E, text kept | Yes | Built |

## Profiles

| Spec | Screen | |
|---|---|---|
| Ordered rows; "Your message" anywhere | Yes | Built |
| Drag **and arrows** | Drag only | Partly |
| **Inline dropdown**: scrollable list, Edit on each row, + New, Import…, Export this, Export all; active profile bar with Edit | A Profiles sheet with the list, templates, import and export | Partly |
| The same dropdown in the editor switches which profile is edited | Not there | Missing |
| Import and export of profiles and system prompts | Yes | Built |
| Name clash: default keep both; a question with **"don't ask again"**; Ask / Keep both / Replace in Settings | The setting and the question; no "don't ask again" | Partly |

## Plugins

| Spec | Screen | |
|---|---|---|
| Tabs **Profile \| Library** | "Profile and installed \| Catalogue" | Partly |
| Update dots and badges | None | Missing |
| Update all | Yes | Built |
| Library filter chips: All, AI sites, Message plugins, Themes, Tools | None (a filter exists in the code, not on screen) | Missing |
| Plugin page: **update**, roll back, remove (**confirm**) | Roll back and remove (no confirm); no update for one plugin | Partly |
| Several sources, Official by default | Yes; the default one is labelled "Promptpipe's own", not "Official" | Built |
| Third-party warning: only add repos from people you trust; plugins are code and can read your chats | Asks to trust the source's key; says its owner can update what you install from it, but not that plugins can read your chats | Partly |
| Name clash across sources asked | Not handled | Missing |
| Install from a **file** or a link | From a link (incl. a zip link) or an AI's answer; not from a file | Partly |
| **Plugin guide screen**: the guide, "Copy instructions for AI", "Install the result" | The guide opens from Help; installing an answer is a separate sheet; no copy button | Partly |
| "Make my copy" | "Copy to edit" exists | Later (but built) |

## Settings

| Spec | Screen | |
|---|---|---|
| Sections: Plugins, System prompts, Look, Sites, Chats and storage, Import and export, Local API, Advanced, Help | All there ("Prompt library" for System prompts; plus Git and Credentials). "Chats and storage" still mentions Git in its line though Git has its own group | Built |
| Look: light or dark, accent, **UI scale 90/100/115/130%**, quick actions | All there; scale is a number (5% steps) | Partly |
| Sites: Max replies at once, default 5, warning and unlock up to 10 | "Pages at once" (the settled name), default 5; the stage 2 decision is a warning and no hard maximum, and the warning isn't shown yet | Partly |
| Advanced: Reset to first launch **with confirm**; data stays | Reset without confirm | Partly |

## Site view

| Spec | Screen | |
|---|---|---|
| Tabs synced with the chat view, state dots, + new tab | Yes | Built |
| Editable address, reload | Yes (and back) | Built |
| **"Open in PromptPipe"** for tabs not linked to a chat | Not there (the "On the site" sheet can open site chats) | Missing |
| **"Linked to chat" with Open chat** | Says "Linked to …" as text, no button | Partly |

## Long messages

| Spec | Screen | |
|---|---|---|
| Long = over **8 lines or 600 characters** (decided: the spec's) | Over 6 lines or 500 characters | Partly |
| About 6 lines fading out | Yes | Built |
| A **"Show more ⌄" / "Show less ⌃"** line under it | Tap the message to open it; no line | Missing |

## Versions and branches

| Spec | Screen | |
|---|---|---|
| Reply versions with "< 2/3 >", branches on Edit and resend, sibling files, Memory on the shown path | "Edit and resend" replaces the message | Later (the spec says after the release) |

## Quick start guides

Skipped (decided 2026-11-22, Gtex): the app keeps its own guides until they get an overhaul of
their own; the spec's guides are not part of this comparison.

## Help mode

| Spec | Screen | |
|---|---|---|
| "?" in the header (setting, on by default) | Yes | Built |
| "?" on **every** screen: every sheet header, the drawer, Find, Quick edit, the site view | Header only | Missing |
| Bar "Help mode. Tap anything to see what it does." | "Tap anything to learn what it does" | Built |
| Card: name, **plain explanation**, Where, shortcut | Name, where and key; no explanation | Partly |
| **"Got it"** and **"Do it"** | Neither (Done closes help mode) | Missing |
| Done or Esc leaves | Yes | Built |
| Drag and long-press blocked in help mode | Not blocked | Missing |
| **One-line explanation per control**, kept with the control's definition | None | Missing |
| Desktop: a "?" on hover | None | Missing |

## On hold in the spec

Roleplay, Characters and Tavern cards; site recommendations; folders for profiles and prompts;
export variants: not built, as the spec says.

## What decides the order (for when the screen work resumes)

1. **Reaching things**: a Settings button (the drawer's pill), Quick start in the drawer, confirms
   on Delete, Remove and Reset. Small, and today Settings can't be reached by touch.
2. **The spec's own order**: header, Find (open the control, settings in it), drawer (folders,
   pins, select), chat sheet; then Quick edit; profiles; plugins; settings; site view.
3. **Help mode**, which needs a one-line explanation for every control (data next to each
   command) before it can work as the spec says.
4. **Icons**: one line-icon family, which touches every screen, so it goes in with the parity walk.

## Merged from Prism's second pass (2026-11-22)

Prism's `rewrite-ux-diff` (written before the Quick start guides were skipped) was checked against
the code and merged into the tables above: Find's Recent chips, Unpin on a row, the status labels,
opening a chat at its newest message, the Edit profile pill, the per-chat profile, the
third-party warning's wording, the default source's label, Git mentioned twice.

Where the two passes disagreed, the code settled it: there is **no install from a file** (only a
link or a pasted answer), so that row stays Partly.

Corrections to Prism's term map (its section 0; `design/3-terms.md` is on the promptpipe repo's
design branch, `ccr-bb40c4f5-cvvj2n`): the app's own plugins are tagged **`runtime`** (not
`core`; "App part" → runtime plugin), and the `driver` type is gone (the default site routine is
the `runtime-site` plugin). The rest of the map is right.

**Questions for Gtex** from Prism's pass, **answered 2026-11-22** (see `0-intent.md`): 1 the spec's
numbers and line; 2 keep all the extras; 3 the log-in help waits for the guides' overhaul, the
Plugin guide screen stays; 4 the spec was updated.

1. **Long messages**: the spec's 8 lines or 600 characters with a "Show more ⌄ / Show less ⌃"
   line (Prism's suggestion: a bubble you must know to tap is easy to miss), or keep 6 and 500?
2. **Extras the spec never had** (keep or drop): swipe across a reply (right quotes, left copies;
   it may fight the chat's scrolling on some phones), message search with "phrase", #tag,
   in:folder, is:you, Attach files, the failed-send actions, the send queue's Move up / Edit /
   Remove, the Git and Credentials groups, themes as plugins.
3. **First-run log-in help**: the spec's full-screen welcome with log-in inside the site view was
   part of the Quick start guides, now skipped. Prism calls it the biggest first-run gap (a new
   user isn't told to log in on the provider's own page). Does it wait for the guides' overhaul?
4. **The spec's starter list** is out of date (the app ships Plain, Writing feedback, Dialogue &
   Role play, Story & Prose): update the spec, not the app.

Prism's risk on versions and branches stands: until they're built, "Edit and resend" replaces the
message and "Send again" adds a new turn, which is what branching is meant to fix.

