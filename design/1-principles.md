# 1. Principles (stage 1, revisited inside-out)

The rules every later stage (requirements, model, ports, adapters, functions) is checked against.
They come first because they decide what counts as a good answer.

## A full remake, designed from the requirements

- **Only the intent and the UX/UI survive** (U 2026-11-21): what the app is for, and what the
  user sees and does (screens, layout, look, gestures, wording). Everything else is new: code,
  structure, internal file formats, the plugin format, names, the plugin surface.
- **The design comes from the requirements and the screenshots, not from the code**
  (U 2026-11-21: "don't touch the code. Design from the requirements"). The design stages use
  `design/0-intent.md`, `design/2-requirements.md` and `design/ux/` only. Lessons the old app
  taught (site quirks, Android timing, bugs) are already requirements with their bug numbers.
- **Requirements win over the screenshots** where they differ (U 2026-11-21); the screenshots win
  over anything else about look and feel. There is no separate mockup.
- **No reuse of old code unless stuck** (U 2026-11-21), and then it is said in that stage's
  review (what, from where, why), never done silently.
- **The old app keeps working until the new one passes every requirement**, checked one by one;
  then the old code is removed in one change.
- **Each part is built with its checks from its first commit** (they are designed with the
  function list), so nothing is "finished later".
- **The language reference is current**: the Odin docs and library index for the compiler
  release in use (`sh scripts/odin-reference.sh`).

## Reuse first (decided 2026-11-21)

Before adding anything (a record, a field, a call, an event, a type, a file, a mechanism, a
setting), look for what already exists that can do the job, and use it. Add something new only
when using the existing thing would be counterproductive, and decide that by the standards in this
file, saying which one decided it:

- **Correctness and security** first: reuse that weakens a check or mixes trust levels is
  counterproductive (S3, S9).
- **Role interfaces**: reuse that makes a client depend on what it doesn't use is counterproductive.
- **DRY**: reuse of the same knowledge is right; reuse of look-alike code that would change for
  different reasons is not.
- **KISS**: a reuse that needs more special cases than a small new addition would is counterproductive.
- **YAGNI**: when nothing existing fits, the new addition covers today's use cases only.

**Names are reused too**: before naming anything (a term, an on-screen label, a field, a call), the
existing name comes first, in this order: the design's terms and our decisions (`3-terms.md`, the
glossary, the decisions recorded in these files), then the standard term. The screenshots are the
reference for look and behaviour, not for words: their labels are used only where the design has
no term (U 2026-11-21). A new name only when none fits, and it goes into the terms.

Examples already in the design: one set of record operations for every collection; one port each
way; one change check for every file; one `Send` record for queued, sending and failed messages; one "linked or own" rule for every
choice a chat, a profile or the app can override (D8);
the default way of using a site as an ordinary content script instead of a `driver` type.

## DRY, KISS, YAGNI

- **DRY (Don't Repeat Yourself).** Every item of knowledge has one source: a data shape, a rule,
  a list, a limit. DRY is about knowledge, not identical text: two functions that look alike but
  would change for different reasons stay apart.
- **KISS (Keep It Simple).** The fewest moving parts that meet the requirement: plain data and
  plain functions, no frameworks, no class hierarchies in app code, no build stage for plugins.
  When two designs meet the requirements, the one with less code and fewer concepts wins.
- **YAGNI (You Aren't Gonna Need It).** Build only what a current requirement needs. Being ready
  for another platform means clean ports now, not a desktop platform now. A setting, option,
  port call or extension point exists only when a use case uses it.

Order when they conflict: correctness and security first, then KISS, then DRY (a small, clear
repetition beats a clever shared abstraction), then YAGNI decides what is built at all.

## Inside-out: the application, its port, its adapters

The standard shape is **Ports and Adapters** (hexagonal architecture, Alistair Cockburn, 2005):

- **The application** is in the middle: the logic that makes the use cases happen (sending,
  profiles, chats and history, the queue, plugins and the catalogue, jobs). It knows nothing
  about Odin, Kotlin, GeckoView, JGit or the DOM.
- **One port each way**, a message protocol (decided 2026-11-21): the outside calls the
  application through one, the application calls the outside through the other, always with the
  same envelope. A port may be a message protocol in Ports and Adapters; per-topic ports would only
  be groups of names around the same mechanism.
- **One table of calls is the contract** (`4-ports.md`): each call's name, data, events and who
  answers it. The same data routes the calls, checks them at the boundary, answers "not supported
  on this platform" (P5), and gives the stand-ins for testing.
- **Every library goes through an adapter**, the languages' own libraries included (U 2026-11-21):
  Odin's `core:*` packages, the browser's APIs, Android's. Application code never calls a library
  directly, so no library's conventions or types leak into it.
- **Adapters** connect a port to a technology: the core (Odin) adapts files and the local API's
  HTTP; the platform (Kotlin) adapts GeckoView, JGit, the key store and the phone's services; the
  screen adapts the DOM; the page script adapts a site's page.

Three rules make it work:

- **The dependency rule** (Robert C. Martin, *Clean Architecture*; the Dependency Inversion
  Principle): the application defines its ports; adapters conform to them. What a "page" offers
  is decided by the use cases, never by what GeckoView happens to have.
- **Role interfaces** (Martin Fowler; the Interface Segregation Principle, "no client should be
  forced to depend on methods it does not use"): each use case uses only the calls it needs, and
  the table shows which. A library feature that no call needs is not wrapped at all.
- **The anti-corruption layer** (Eric Evans, *Domain-Driven Design*): an adapter translates the
  library's meaning into the application's words and nothing more ("the translator should just
  translate"). Its interface is entirely in the application's terms; the application never sees a
  session, a delegate, an intent or an exception.

## Functional core, imperative shell

Inside the application the same split again (Gary Bernhardt's "functional core, imperative
shell"):

- **Pure functions** do all the deciding: data in, data out; nothing read but the arguments,
  nothing changed but the return value. Building a message from blocks, parsing a chat file,
  deciding which plugin files to fetch, comparing versions, planning a move: all pure.
- **A thin effect layer** calls the driven ports to carry out what the pure functions decided.
- So the application is tested without a phone, a browser or a network, by giving its pure
  functions data and its ports stand-ins.

## Stateless functions, state as data (data-oriented design)

- **Functions are stateless**: no hidden state in closures, module variables or objects.
- **State is plain data in one place per process** (the screen's state record in the screen
  view; the core's own small record; the platform's; each page script's). Plain records and
  arrays, keyed by id, never object graphs with methods.
- **State changes in one place**: an apply function takes the state and a change record and
  returns the next state. The screen is drawn from the state (`view = f(state)`), with a DOM
  morphing library keeping the redraw cheap and keeping what the person is doing (typing,
  selection, scroll).
- **Data-oriented design**: design the data first (its shape, its one owner, how it flows), then
  the functions that transform it. Derived values are computed, not stored twice.

## The main sequence, hooks and events

- **The main sequence** is the chain of calls that carries out one use case from start to end.
  Inside it, functions call each other and return results, in order.
- **Hooks** are stages plugins add *inside* a sequence (before send, after reply), run in order,
  each one's output feeding the next. Hooks return values.
- **Events** are for everything outside the sequence: something happened and others may want to
  know (a reply grew, a page loaded, a plugin was installed). The observer pattern, as delegates
  in Unity and C# and signals in Godot. The emitter doesn't know the listeners; listeners can't
  change its result; names are past tense (`job_received`) or `_changed` (`reply_changed`), one `_changed` event per
  record with a state field rather than one event per state.
  The outside reports back through events (a page's progress, a download's parts).
- Events never replace a return value: if the caller needs the answer, it's a call.

## Errors are data

- Functions return a value or an error, as data: Odin's `(value, err)`; in JS
  `{ ok: true, value }` or `{ ok: false, error: { code, message } }` across a port.
- Throwing is only for bugs, not for things that can happen (no network, a refused file).
  Adapters catch the library's exceptions and return error data.
- An error message says what happened and what to do, in the glossary's words.

## Names

- **Noun first, then the verb** (`file_write`, `chat_create`, `page_open`), in `snake_case` in every
  language (decided 2026-11-20). The noun is the module, so its functions sort together and
  autocomplete lists them after the noun. One noun per module, one verb per meaning (the closed
  verb list in the terms).
- **One name per job across every layer**: a call keeps its name from the application through the
  port to the adapter (`file_write` is `file_write` in the runtime, on the bus and in the core).
- Only glossary words and standard programming terms; no invented words. A name that needs a
  comment to be understood gets a better name.

## Plugins keep the app updatable

- The application lives in **runtime plugins** (JS, updatable from the catalogue without a new
  APK). The adapters that must be native or trusted live in the **core** (Odin: files, the local
  API's HTTP, plugin verification) and the **platform** (Kotlin: pages, the repository, credentials,
  the phone's services). The **loader** starts the runtime.
- `PP` is the driving port for plugin authors: named, versioned, documented. No plugin depends on
  another plugin's internal names.

## Checks keep the rules

Each rule that can be checked has a check: terms-check (one vocabulary), clone-detection (DRY), the
size count against the budget, the application's tests with stand-in ports, the adapters' own
tests, and the screenshots for the screen. A change is done when its checks pass.

## Sources

- [Hexagonal architecture (Wikipedia)](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)), [Cockburn's book draft](https://alistaircockburn.com/code%20hexarch%20book%20v0.9a.pdf)
- [The dependency rule](https://milanjovanovic.tech/blog/dependency-rule-clean-architecture), [Interfaces are owned by high-level modules](https://mikhail.io/2016/05/dependency-inversion-implies-interfaces-are-owned-by-high-level-modules/)
- [Fowler: Role Interface](https://www.martinfowler.com/bliki/RoleInterface.html), [Interface segregation principle](https://www.wikipedia.org/wiki/Interface_Segregation_Principle)
- [Anti-corruption layer (Microsoft)](https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer), [Evans on legacy systems](https://domainlanguage.com/wp-content/uploads/2016/04/GettingStartedWithDDDWhenSurroundedByLegacySystemsV1.pdf)
