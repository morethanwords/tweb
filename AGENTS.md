# AGENTS.md — tweb (Telegram Web K)

Canonical instructions for **every** coding agent working in this repo (Claude
Code, Codex, Cursor, Zed, …). `CLAUDE.md` is only a pointer that imports this
file — edit AGENTS.md, never CLAUDE.md.

## Project Overview

**tweb** is a full-featured Telegram web client (https://web.telegram.org/k/) built with Solid.js and TypeScript. It implements Telegram's MTProto protocol directly in the browser (no third-party API wrappers). The codebase is large (~100k+ lines excluding vendor), mature, and highly performance-oriented.

Author: Eduard Kuzmenko. License: GPL v3.

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | Solid.js (custom fork in `src/vendor/solid/`) |
| Language | TypeScript 5.7 |
| Build | Vite 5 |
| CSS | SCSS (sass) |
| Testing | Vitest |
| Package Manager | pnpm 11 |
| Protocol | MTProto (custom implementation) |
| Storage | IndexedDB + CacheStorage + localStorage |
| Workers | SharedWorker + ServiceWorker |

## Development

```bash
pnpm install
pnpm start          # Dev server on :8080
pnpm build          # Production build → dist/
pnpm test           # Run tests (Vitest)
pnpm lint           # oxlint on the whole repo (config: .oxlintrc.json)
pnpm lint:fix       # Same, with auto-fix
```

Debug query params: `?test=1` (test DCs), `?debug=1` (verbose logging), `?noSharedWorker=1` (disable shared worker), `?noPfs=1` (turns off Perfect Forward Secrecy — temporary auth keys, `src/lib/mtproto/tempAuthKeys.ts`; on by default), `?a11y=1` (the keyboard and screen-reader layer — see "Accessibility"; off by default), `?rtl=1` (lays the app out right to left in whatever language is loaded — see "Right-to-left"), `?memoryWatch=1` (keeps a memory history of the tab — see "Memory").

### Preview

Launch an authorized local preview with `bash scripts/start-preview.sh` (never
plain `vite`) — it mints a fresh per-preview auth + picks a free port. Flags and
details: see the script header. `.claude/launch.json` wires it into Claude
Code's preview pane; other agents run the script directly and open the printed
URL with their own browser tooling.

**One preview per checkout, shared through leases.** An agent runs
`bash scripts/start-preview.sh --detach` (outside Claude Code's Bash sandbox —
inside it the script refuses, since no other process or port is visible there).
When a preview of the same checkout — so of the same branch — already runs in
the same mode, it hands back that preview's URL instead of starting a second
one; either way it returns once the preview answers. Use the URL it prints, even
if it is not the port you asked for. The caller holds a lease on what it got —
inside Claude Code the session does; an agent whose shell lives for one command
sets `TWEB_PREVIEW_HOLDER=<its name>` — and `--stop` (on `--port`, or on
everything you hold) drops yours and stops the server only when nobody else
holds it; `--list` shows what runs and for whom.
**Never stop a preview any other way** — not by pid, port, `pkill vite` or a tmux
session: another session may be using it. A separate preview (another account,
a clean origin) takes its own `--id`.

**Name it by the task.** Pass `--label '<a word or two>'` saying what the
checkout works on — not the branch name, in the language you talk to the user
in. Several previews run at once, and the label is how the user tells them
apart: the tab title starts with it, and a badge in the preview's bottom-left
corner lists every running preview by label, as does `/_previews` on any of
them. The label belongs to the checkout (`tmp/preview-label`) and outlives a
restart; pass it again to rename.

### Popup sandbox

Every popup, opened by click with mock data and **no Telegram traffic**. Two ways in:

- `?popups=1` on any dev/preview build (`.claude/launch.json` has a
  `tweb-popups` server for it — a plain vite server is enough, no auth needed).
  `src/index.ts` hands over before the session is restored, so nothing but the
  sandbox ever runs.
- `showPopupSandbox()` from the console of a running app, signed in or not. The
  panel opens over the app and closing it (×) puts the real managers back. The
  fixture peers/messages are merged into the mirrors key by key rather than
  replacing them, so a live session's own cache survives. While it is open, an
  edit a story module takes reloads the page (`?popups=1` reloads for every
  edit); the app's own edits stay hot.

Signed in, the panel offers a second data source — **My data** — which builds the
stories out of the session's own dialogs, messages and gifts instead of the
fixtures, and runs them against the real managers. Writes are held back by a
name heuristic that fails closed (`liveManagers.ts`): only `get`/`is`/`has`/`can`
… reach the real manager, everything else resolves to `undefined` and is listed
in the panel. **Let popups write** removes that guard, and then a confirm button
does the real thing — deletes, leaves, pays. Stories with no live equivalent (a
payment form, a gift code) are marked `fixtureOnly` and stay on fixtures.

Either way every `rootScope.managers` call is answered from
`src/components/popupSandbox/`.

- A **story** is one popup in one state — arguments plus the manager answers it
  needs. They live in `src/components/popupSandbox/stories/`; add a file there
  and import it from that folder's `index.ts`. Import the popup module *inside*
  `open()`, never at the top (the popup graph has import cycles).
- A story asks `open(ctx)` for a peer by KIND (`ctx.peer('channel')`), a message
  (`ctx.message()`), a chat (`ctx.chat()`) or a gift — never for a fixture by
  name. That indirection is what lets the same story render from fixtures or from
  a real account; a story that reaches into `fixtures.ts` directly cannot go live.
- Anything a story does not answer resolves to `undefined` and is listed under
  "Unanswered manager calls" in the panel — that list is the to-do for making a
  half-rendered popup complete.
- The panel's theme select switches between `system` and every shipped theme
  (`day` / `night` / `light` / `tinted`) and survives a reload — the mock
  managers discard settings writes, so it is kept in `localStorage` instead.
  The direction select beside it (`ltr` / `rtl`) is kept the same way and lays
  every story out right to left; `?rtl=1` in the URL does the same.
- Going through 200+ stories takes more than one sitting, so each row has a
  checkbox for "I have looked at this one" and the list can be sliced by it —
  **All / Unchecked / Checked**, counted within whatever the search box is
  showing. Both the marks and the chosen slice live in `localStorage`
  (`checkedStories.ts`), so the reload an edit triggers does not restart the pass.
- `window.popupSandbox` (`ready` / `show` / `hide` / `list` / `open` /
  `closePopups` / `calls` / `unhandled`) drives the same registry from a script;
  `calls` and `unhandled` follow the active data source.
  `pnpm test:popups` runs the `e2e/popupSandbox*.spec.ts` suites in headless
  Chromium (~50 s): `popupSandbox.spec.ts` opens every story and fails on one
  that throws, never becomes visible or never leaves — twice, with full and
  with reduced animations; the others drive the composer's popups.
  `pnpm test:popups:full` adds Firefox and WebKit (~3 min).
- `src/tests/popupSandboxCoverage.test.ts` fails when a module under
  `components/popups/` can open a popup and no story imports it, so a new popup
  cannot land without one. It also fails when a story builds its popup out of a
  fixture without being marked `fixtureOnly` — that mark is what keeps live mode
  from quietly showing made-up data.

### Memory

What a tab costs, and where it went. Chrome charges a tab for every SharedWorker
it hosts (MTProto, the crypto and lottie pools) and for memory no JS heap shows,
so `performance.memory` alone says little.

- `await memoryReport()` in the console: this thread's structures plus a round
  trip to every worker of the tab, and the records those workers set.
- `?memoryWatch=1` (off otherwise — a developer's own tab, never every user's):
  a sample every 15 minutes into localStorage, with what the tab was doing
  (`ctx.*`) and the records kept beside them, for as long as the URL carries the
  flag (a reload and a restored tab keep it). `memoryWatch()` in the console
  does the same until `memoryWatchStop()`. Read it with `memoryWatchSummary()`,
  `downloadMemoryWatch()`, or inside `downloadLogs()` in line with the logs.
- A worker remembers the moment a holder of its sets a record, with what it held
  then (`createPeakRecorder` in `@lib/debug/memoryStats`; the lottie heap uses it).
- From outside the page, `MemoryProbe` (`e2e/memory.helpers.ts`) reads what the
  page cannot: every isolate's heap, the renderer by allocator (a memory-infra
  dump) and the DOM's counters. `test:memory:app` is built on it.

## Directory Structure

```
src/
├── components/       # Solid.js UI components (.tsx)
│   ├── chat/         # Chat bubbles, topbar, sidebars
│   ├── popups/       # Modal/popup components
│   ├── mediaEditor/  # Media editing UI
│   └── ...           # 200+ feature folders
├── lib/
│   ├── appManagers/  # 55+ domain managers (chats, users, messages, etc.)
│   ├── mtproto/      # MTProto protocol implementation
│   ├── storages/     # IndexedDB/localStorage wrappers
│   ├── rootScope.ts  # Global event emitter & app context
│   └── mainWorker/   # Background worker logic
├── stores/           # Solid.js reactive stores (13 stores)
├── helpers/          # 145+ utility functions
├── hooks/            # Solid.js hooks
├── pages/            # Auth pages (login, signup, etc.)
├── config/           # App constants, state schema, emoji, currencies
├── environment/      # Browser feature detection (39 modules)
├── scss/             # Global stylesheets
├── vendor/           # Third-party forks (solid, solid-transition-group)
├── scripts/          # Build & codegen scripts
└── tests/            # Test files
```

## Path Aliases

Always use these aliases instead of relative paths:

```typescript
@components/*   → src/components/
@helpers/*      → src/helpers/
@hooks/*        → src/hooks/
@stores/*       → src/stores/
@lib/*          → src/lib/
@appManagers/*  → src/lib/appManagers/
@environment/*  → src/environment/
@config/*       → src/config/
@vendor/*       → src/vendor/
@layer          → src/layer.d.ts    (MTProto API types)
@types          → src/types.d.ts    (utility types)
@/*             → src/

// Solid.js resolves to the custom fork:
solid-js        → src/vendor/solid
solid-js/web    → src/vendor/solid/web
solid-js/store  → src/vendor/solid/store
```

## Code Style (all oxlint-enforced)

Non-obvious rules — these differ from common defaults:

- **No space after keywords**: `if(cond)`, `for(...)`, `while(...)`, `switch`, `catch` — not `if (cond)`
- **No space inside `{}` / `[]`**: `{a: 1}` and `[1, 2]` — not `{ a: 1 }`
- **No trailing comma** anywhere
- **No space before function paren**: `function foo()`
- **`return await` required inside try/catch** (`typescript/return-await` in
  `error-handling-correctness-only` mode); elsewhere return the promise
  directly (convention, not linted)

Standard defaults, also enforced: single quotes, LF + final newline, no trailing whitespace, no tabs, max 2 blank lines, `prefer-const`. 2-space indent comes from `.editorconfig` (the linter only bans tabs).

## TypeScript Notes

- `strict: true` but `strictNullChecks: false` and `strictPropertyInitialization: false`
- `useDefineForClassFields: false` — important for class field behavior
- `jsxImportSource: solid-js` — JSX is Solid.js, not React
- MTProto types live in `src/layer.d.ts` (664KB, auto-generated); import from `@layer`
- Utility types (AuthState, WorkerTask, etc.) live in `src/types.d.ts`; import from `@types`
- Global types available everywhere: `PeerId`, `UserId`, `ChatId`, `BotId`, `DocId`, `Long`, `Icon`, `ApiError`, `ErrorType`, `MaybePromise<T>`. Defined in `src/global.d.ts`.

## Key Patterns

### Solid.js Components

Components are in `.tsx` files. Props typed inline. Use `classNames()` helper for class composition:

```typescript
import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';

export default function MyComponent(props: {
  class?: string,
  children: JSX.Element
}) {
  return (
    <div class={classNames('my-class', props.class)}>
      {props.children}
    </div>
  );
}
```

### CSS Modules

Scoped styles use `.module.scss` files. Import as `styles`:

```typescript
import styles from '@components/chat/bubbles/service.module.scss';
// Usage: <div class={styles.wrap}>
```

### Solid.js Stores

Stores in `src/stores/` use `createRoot` + `createSignal` and export a hook:

```typescript
import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';

const [value, setValue] = createRoot(() => createSignal(initialValue));
rootScope.addEventListener('some_event', setValue);

export default function useValue() {
  return value;
}
```

### App Managers

Business logic lives in `AppManager` subclasses in `src/lib/appManagers/`. They communicate via `rootScope` events and are accessed via `rootScope.managers`:

```typescript
import {AppManager} from '@appManagers/manager';

export class AppSomethingManager extends AppManager {
  protected after() {
    // Initialization after state loaded
    this.apiUpdatesManager.addMultipleEventsListeners({...});
  }
}
```

All interaction with MTProto MUST go through the app managers. Managers wrap the raw APIs with a nicer interface, a caching layer, and the side-effect handling (saving peers, dispatching updates) the rest of the app expects. Managers are the source of truth.

**Strict rule — never call `apiManager.invokeApi*` directly from UI / component code.** Even though `rootScope.managers.apiManager.invokeApi(...)` runs in the worker (it goes through the manager proxy), it bypasses every wrapper: no caching, no `saveApiPeers`, no `processUpdateMessage`, no dedup with the rest of the app. If a component needs MTProto data, add (or extend) a method on the relevant `app*Manager` and call THAT from the UI:

```typescript
// ❌ wrong — UI making a raw MTProto call
const result = await rootScope.managers.apiManager.invokeApi('messages.getSearchResultsCalendar', {...});

// ✅ right — manager method wraps the call, UI invokes by domain intent
const result = await rootScope.managers.appMessagesManager.getSearchResultsCalendar({peerId, filter, offsetDate});
```

Invoking MTProto methods (inside a manager) is done via:

```typescript
// invoke normally
await this.apiManager.invokeApi('payments.checkCanSendGift', {gift_id: gift.id})
// invoke with deduplication
await this.apiManager.invokeApiSingle('payments.checkCanSendGift', {gift_id: gift.id})
// invoke and do something with the result (only available inside managers)
return this.apiManager.invokeApiSingleProcess({
  method: 'some.method',
  params: {...},
  processResult: (result) => {
    // when the result type has {chats, users} fields, use this method to save them
    this.appPeersManager.saveApiPeers(result);
    // when the result is `Updates`, use this method to handle them
    this.apiUpdatesManager.processUpdateMessage(result);
  }
});
```

### rootScope

Global event bus and context. Available everywhere:

```typescript
import rootScope from '@lib/rootScope';

rootScope.addEventListener('premium_toggle', handler);
rootScope.managers.appChatsManager.getChat(chatId);
```

IMPORTANT: `rootScope.managers.*` are asynchronous proxies to a shared worker. Every manager method returns a `Promise`, even if the manager's own methods seem synchronous.

### Managers belong to an account session

The tab switches between signed-in accounts in place (`@lib/accounts/switchAccount`), so the account a
flow started on may not be the one shown when its `await` returns.

- `rootScope.managers` (`TabManagers`) follow whichever account the tab shows, read at call time. Only
  what lives as long as the tab keeps them (the sidebars, the chat list, `appImManager`).
- Anything else holds managers bound to an account session (`AppManagers`):
  `bindManagersToSession(rootScope.managers)`. They reach the account they were taken in, and once the
  tab has switched away they send nothing and drop what comes back — an action the switch interrupted
  is not carried on. Tabs, popups and the media viewer get them from their base classes; a chat and a
  call have their own, tied to their account for good.
- A function that waits reads its managers once, before the first await, bound, and uses that after.
  `tweb/managers-before-await` (`scripts/oxlint/twebPlugin.mjs`) reports a read after an await or in a
  callback that runs later, and managers kept unbound; `TabManagers` is not assignable to `AppManagers`,
  so handing them to what keeps them asks for the binding (what only reads takes `ReadingManagers`).
- A save on a screen's way out that reads before it writes binds to the account for good
  (`bindManagersToAccount(managers, getCurrentAccount())`): the switch waits for closing screens a while only.
- A tab, a popup, the media editor or a picker asked for by a session that is over or on its way out is
  not opened (`isSessionLeaving`); hand the opener's managers on so the check knows whose it is.

### The app's top level: `hotReloadGuard`

**Strict rule — code below the app's top level never imports it.** The top level is the singletons
(`appImManager`, `appDialogsManager`, `appSidebarLeft`/`Right`, `internalLinkProcessor`), the tab registry
(`solidJsTabs/tabs`) and the popups and viewers they open (`showPremiumPopup`, `showStarsPopup`, `showForwardPopup`,
the stories viewer, `AppMediaViewer`, …). A component, popup, wrapper or tab reads them at call time from the
registry instead — never while modules are still being evaluated:

```typescript
// ❌ wrong — the whole app becomes part of this module's import graph
import appImManager from '@lib/appImManager';
import {AppSettingsTab} from '@components/solidJsTabs/tabs';

// ✅ right
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
hotReloadGuard.appImManager.setInnerPeer({peerId});
slider.createTab(hotReloadGuard.tabs.AppSettingsTab).open();
// in a Solid component, from the context:
const {appImManager} = useHotReloadGuard();
```

An import from the top level puts the whole app into the importer's graph: every test of it reruns on any edit
(`vitest --changed`), and a hot update through it re-runs the importer with fresh copies of the singletons — a
second `appImManager` while the log says "hmr update" and the page looks fine. The singletons register themselves
where they are made; everything else is registered by `@lib/solidjs/hotReloadGuardValue`, which only the app's root
imports. A new entry: its type in `hotReloadGuard.ts`, its value in `hotReloadGuardValue.ts`. A test that mocks a
top-level module hands the mock over with `registerHotReloadGuard({...})`. A value or helper that low-level code
needs from a top-level module (a constant, a pure function, a small component) moves out into a module of its own
(`@lib/appColumns`, `@components/dialogElement`, `@components/stars/starsAmount`).

`src/tests/importGraphBudget.test.ts` is the ratchet: it fails when the largest import cycle, the modules whose edit
reloads the page, or the hot updates that make a second instance of a singleton grow past
`scripts/import-graph.budget.json`. `node scripts/import-graph.mjs` (`hmr`, `why <file>`, `hazards`, `funnels`,
`tests`, `cycle` — see its header) shows what an edit reloads and why, and which import closed a cycle; lower the
budget with `check --update` when the numbers shrink.

**A module's top-level state survives a hot update by itself, in dev.** Vite re-stamps every importer of an edited
module, so a boundary that runs again runs the modules under it again too. The dev server rewrites every app module
it serves (`scripts/hot-reload-plugin.mjs` → `scripts/hot-module-transform.mjs`, kept by `@helpers/hotRegistry`) so
that the next evaluation keeps what the previous one made — nothing in the sources asks for it, and the build is
untouched:

- a top-level `const` whose value is state — anything but literal data, functions, another name for something, data
  the module changes, or what `defineSolidElement` makes (it takes the update itself) — a top-level `let` a function
  uses, and a static field made with a call are made once per page.
  An edit of the code that makes one, or of a function, table or class's static method it is made from (in any
  module), reloads the page;
- every top-level class: the first evaluation's class stays the one the instances and `instanceof` hold, and each
  later evaluation copies its methods onto it. What a live instance cannot take reloads: a constructor or field
  initializer, a method the constructor calls, a method it holds as a value (`this.x.bind(this)`, a listener), a custom
  element's lifecycle callback, a function or another class's static method its construction calls, or a factory whose
  product a method stores on it — the markup of JSX among them, which Solid hoists out of the code;
  and private members (`#x`), which another evaluation's methods cannot read — a class with them reloads whenever its
  module runs again;
- a TypeScript namespace that holds state (`I18n`) cannot be kept without its code: its module reloads when it runs
  again;
- a module that accepts its own updates (`import.meta.hot.accept()`, or solid-refresh's for components): an export its
  importers hold — a function, a table, a re-export — that changed reloads.

A closure made before the update — a listener added inside a method, a callback handed to another module — keeps the
code it captured until a reload (but for a dynamic `import()`, which always loads the latest version), and what a method that already ran built (DOM, an instance's state) stays as built —
construction included past the constructor's own code and the methods it calls directly: what those call in turn
runs at other times too (`ChatBubbles.constructBubbles` reaches `renderMessage`), and an edit of it applies from its
next call. A module an edit leaves with no importer is dropped, and its `hotEffect`s are undone.
`e2e/popupSandboxHotRerun.spec.ts` (in `test:popups`) and `test:hot:app` run every module the sandbox, or a signed-in
boot, loads once more with the same code, as a hot update does, and fail on a reload none of these rules asks for.

What a module *does* at its top level runs again with it, and is left to the module: a listener goes through
`hotListen(import.meta.hot, rootScope, 'event', onEvent)`, any other setup with a cleanup (an interval, a window
listener with options, a root with effects) through `hotEffect(import.meta.hot, () => cleanup)` (`@helpers/hotModule`),
so the new one replaces the old. A top-level statement that acts on kept state (`promise.resolve()`,
`Tab.prototype.init = ...`, `if(...) set.add(...)`, `Object.assign(state, ...)`) is kept with it, and so is a table it reads: it runs once per
page, and an edit, an addition or a removal of one reloads. A custom element: `define` behind `if(!customElements.get(TAG))`, instances built by
`new (customElements.get(TAG) as typeof X)()` (a `static create()`), since a re-run module's class is unregistered.

A reload the page asks for goes through the dev server, so the log says "page reload <file> (<reason>)" —
`import.meta.hot.invalidate()` does not reload, it re-runs the importers. A module a worker imports never mentions
`import.meta.hot` (it would pull Vite's client into the worker), and `@helpers/hotRegistry`, which every module
imports, neither does nor imports anything, nor needs timers: an AudioWorklet, which has none, runs it too.

### Media devices (camera / microphone)

**Strict rule — never call `navigator.mediaDevices.getUserMedia` directly when you need a camera or microphone. Use `getStream` from `@lib/calls/helpers/getStream`.** It is the single chokepoint for every `getUserMedia` in the app (calls, voice notes, round-video notes), so two things happen for free:

- It honours the device the user picked in **Settings → Speakers and Camera** (`appSettings.callDevices.cameraId` / `microphoneId`).
- It self-heals a stale selection: if the saved device is gone it strips the `deviceId`, clears the now-dead `callDevices.*` entry, and retries on the OS default — incrementally, so a still-valid device survives when only the other one is stale.

```typescript
import getStream from '@lib/calls/helpers/getStream';

// ❌ wrong — ignores the chosen device, no fallback
const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});

// ✅ right — selected device + self-healing fallback
const stream = await getStream({video, audio});
```

For the standard call-tuned video/audio constraints (which already inject the selected device), build them with `getVideoConstraints()` / `getAudioConstraints()` from the same folder; otherwise pass your own constraints and `getStream` handles acquisition + device fallback.

### Object URLs (`blob:`)

Shared blob URLs (thumbnails, avatars, backgrounds — anything minted by the
worker) are revocable: the worker's LRU may evict and revoke them at any time
(30 s grace after eviction). The rule is not enforced by types or lint, and
getting it wrong fails rarely and unreproducibly — so pick the right case
consciously:

- **Rendering an image** (`<img>`, canvas, one-shot CSS): just use the URL
  from the manager (`downloadMediaURL` / `cacheContext.url`). No bookkeeping —
  a decoded bitmap survives revocation, and a later re-render simply
  re-requests a fresh URL.
- **Handing the URL to something that will RESOLVE it later** — a playing or
  looping media element (seek/loop re-read the blob), MediaSession artwork,
  long-lived CSS background: take `pinObjectURL(url)` from `@helpers/objectUrl`
  and call the returned unpin in the consumer's cleanup (usually
  `middleware.onClean`). A missing pin breaks playback only after the URL is
  evicted — i.e. almost never in testing, occasionally in production.
- **Tab-local one-off URL** (editor previews, probes, worklet scripts): create
  it through an `ObjectURLScope` and dispose the scope. Never pass a tab-minted
  blob URL to the worker (`setSharedObjectURL` accepts worker-minted URLs
  only — a tab's URL dies with the tab).

### Highlighting text in rendered DOM

**Strict rule — never wrap matched text in `<span>`/`<mark>` or synthesize
`messageEntityHighlight` entities to point at a piece of rendered text. Use
`highlightText()` from `@helpers/dom/textHighlight`** (options and modes are
documented in the file; styles in `scss/partials/_textHighlight.scss`).

### Animation levels

Interface animations have three levels (`liteMode.getAnimationLevel()`): **0**
off, **1** reduced, **2** full. Reduced is "Interface Animations" on with
"Motion Effects" off in Power Saving, or the OS reduce-motion preference under
`?a11y=1` (`liteMode.isMotionHeldBySystem()`; level 0 stays the switch that
turns everything off). It follows the platforms' Reduce Motion: control feedback
(colour, toggle knob, checkbox tick, the press highlight — a ripple that does not
spread, only fades), fades and spinners stay, and so does something growing or
shrinking where it stands (a block entering or leaving the flow, a section
expanding, a field following its content) — a fade at a size that changes at
once opens a hole before it or leaves one after. Slides and zooms become
crossfades; what travels (a position, a reorder, a flight to a new place),
scrolling and the window's own layout (columns, sidebars) change at once, and
changing digits are replaced in place rather than rolled; decorative effects
(shake, shimmer, pops, hover zooms, looping waves) go. One shift is kept on
purpose: the bubbles stepping aside for the selection checkboxes — short, the
user's own doing, and worse as a jump.

- **JS:** `isAvailable('animations')` is level 1 and up, `isAvailable('motion')`
  level 2. Gate movement on `motion`, growth on `animations`. Code that waits
  for a `transitionend` or `animationend` must be gated on the same level as the
  CSS that fires it — an event that never comes leaves things stuck at level 1.
- **SCSS:** the body carries `animation-level-0`, or every level up to the
  current one, so `@include animation-level(1)` is reduced and full, `(2)` full
  only, `(0)` off only, `animation-level-below(2)` off and reduced,
  `animation-level-only(1)` reduced alone. A fade or a size goes under `(1)`,
  movement under `(2)`. A transition list that does both is written once, with
  `animation-level-transition(...)`, which hands reduced the part that does not
  move (fades, colours, sizes and margins; transforms, positions, padding and
  font size move); an icon swapped in a button uses `animation-level-icon-in` /
  `-out`. The mixin does not touch the states: where a hidden state is an offset
  or a scale, neutralise it below level 2 (`transform: none`), or hiding makes it
  jump before it fades — but only where something else (`visibility`,
  `pointer-events`, `display`) keeps the hidden element from being clicked; one
  that `scale(0)` alone hides is better gone at once. In a `.module.scss` use
  the `-global` mixins (`$global: true` for the transition one): a plain
  `animation-level(...)` gets its body class hashed and never matches.
- **Durations:** a fade has no distance for the eye to follow, so at level 1 it
  is short — 150–200 ms, going quicker than coming. The shared timings
  (`--transition-standard-*`, `--ripple-duration`) shorten themselves there
  (`base.scss`), for the growth they time as well; a fade that stands for a
  movement keeps to that range rather than inheriting the movement's length
  (an ambient fade of its own, a background settling, may take longer).
- **Shared pieces already follow the levels:** `TransitionSlider` (every type
  crossfades at level 1), `fastSmoothScroll`, `smoothScrollBehavior()`,
  `AnimationList` (keyframes without what moves, by `reducedKeyframes`),
  `HeightTransition`, `crossfadeContent`, the popup and menu CSS.

### Settings tabs are indexed for search

Settings has a search over every screen and row, and its index is **generated
from the tabs themselves** (`src/scripts/generate_settings_search.js` →
`src/lib/settingsSearch/generated.ts`, rebuilt by the Vite plugin on build and on
every settings-tab edit). A new tab or row is picked up with no bookkeeping —
*if* it follows the conventions the extractor reads. When adding to Settings,
check the things it cannot guess:

- **Declare the tab in `solidJsTabs/tabs.ts`** — `scaffoldSolidJSTab({title: 'LangKey', getComponentModule: () => import(...)})`. The export name becomes the section id and `title` its heading; a tab declared elsewhere, or without a title key, never appears in results.
- **It has to be reachable.** The tree is built from the tab constructors an indexed tab references in a row that opens them (`makeSubTabConfig(icon, 'Key', Tab, tab)`, `addRow(..., () => createTab(Tab))`). A tab nothing opens is dropped.
- **A tab that needs a payload needs an opener.** The search opens a section directly, passing the class's `getInitArgs` when it declares one; anything else `open()` requires goes in `SECTION_OPENERS` (`@lib/settingsSearch/openers.ts`), or the result opens an empty screen. A tab that only makes sense inside a flow (wizard steps, detail views) belongs in `NON_NAVIGABLE_SECTIONS` in the same file — it and everything under it leave the results.
- **Rows come from the labels a tab renders**: `<Row.Title>{i18n('K')}</Row.Title>`, `<Section name="K">`, title-ish props and option lists, `ButtonMenuToggle` items. Titles computed at runtime, and labels that exist only in a row's context menu, are not indexed. Captions, notices and input labels are excluded by the generator's deny lists — extend those there instead of contorting a tab.

Two things travel with a new setting:

- **Synonyms are language-pack strings, never build-time text** — add `'<TitleKey>.SearchKeywords'` (comma-separated) to `lang.ts` so every language gets its own from the server.
- **Deep links** live in `src/scripts/in/settings-links.csv`, the `tg://settings/...` table shared with the other clients. A link points at its control instead of performing the action, the way tdesktop does (`edit/log-out` opens the header menu and flashes the item); where another client's behaviour differs, follow that client. Paths the index cannot address are cases in `internalLinkProcessor`.

`src/tests/settingsSearchIndex.test.ts` fails if the checked-in index is stale, holds anything but identifiers, or drops a link from the table — run it after touching a settings tab.

### Imports from `@layer`

All MTProto types come from `@layer`:

```typescript
import {Message, Chat, User, InputPeer} from '@layer';
```

## CSS / SCSS

- Global styles in `src/scss/`
- Component-scoped styles in `.module.scss` next to component files
- BEM-like class naming convention
- CSS variables used for theming

## Important Files

| File | Purpose |
|---|---|
| `src/index.ts` | App entry point, account/auth init |
| `src/lang.ts` | All i18n strings (232KB) |
| `src/layer.d.ts` | MTProto API types (auto-generated, 664KB) |
| `src/types.d.ts` | Utility/app types |
| `src/global.d.ts` | Global interface augmentations |
| `src/config/state.ts` | Application state schema |
| `src/config/app.ts` | App constants |
| `src/lib/rootScope.ts` | Global event emitter |
| `vite.config.ts` | Build configuration |
| `.oxlintrc.json` | oxlint config (style rules via `@stylistic/eslint-plugin` jsPlugin) |

## Agent Workflow

- **Never duplicate code.** Before adding logic, helpers, components, styles, or
  constants, search the codebase for an existing implementation and reuse or
  extend it. Every final review must explicitly check the completed change for
  duplicated code and remove any duplication found.
- **A fix is as small and as local as what it is for.** A one-off need — one
  item, one case, one rename — never goes into a mechanism shared by everything
  (a loop over every item, a global stylesheet, a shared helper): there it is
  paid on every pass and drags guards in after it. If it fits nowhere else, say
  where it belongs (the server, a config) and ask.
- **Every final review also checks the change's performance** — above all
  animations and anything that touches style or layout:
  - A forced synchronous layout — reading `offsetWidth`, `clientWidth`,
    `getBoundingClientRect()` or `getComputedStyle()` after a DOM write, or
    `void el.offsetLeft` to restart a transition — is fine for a one-off heavy
    animation: a popup opening, a page switching, once per user action. It is
    not on a hot path — a chat-list row, an incoming update, the unread counter —
    nor in an animation that stands in many places and fires often: there every
    read goes before any write (`sequentialDom.measure` → `mutate`), and what
    has to be styled before its transition waits a frame instead of reflowing.
    Read only inside `measure(cb)` and write only inside `mutate(cb)`; their
    promise says no more than "done" — code after `await measure()` is not
    held to the read phase, and one more `await` puts it after the writes.
  - Animate `transform` and `opacity`. A layout property (`width`, `height`,
    `max-width`, `top`…) relays out on every frame — keep it to the one element
    that needs it.
  - What every row of a list wears is paid per row: mount the animation's DOM
    only while it moves, and skip what is out of sight, in a hidden tab, or
    with animations off (`liteMode`).
  - Measure rather than guess: CDP `Performance.getMetrics` (`LayoutCount`,
    `RecalcStyleCount` and their durations) around the change, with and without
    it, and with many items changing at once. A cost that matters gets a
    regression check (e.g. `e2e/dialogUnreadCounter.spec.ts` counts the
    layouts read while the counts of many rows change).
- **Every final review also checks the change in RTL** — mirrored, next to
  LTR, as "Right-to-left (RTL)" below describes. A screen that only works
  left to right is not finished.
- **After every context compaction, reread this entire `AGENTS.md` before
  continuing work.** A compacted context or summary does not replace the
  canonical instructions in this file.
- **Heavy test suites belong to the final review only — and only those the
  change touches.** `test:a11y`, `test:focus`, the Playwright e2e configs and a
  full `vitest run` take a minute or more each — never run them after every
  small change. While iterating, check the change live in the preview, or run
  the one test file that covers it (plus `tsc` when types changed). At the
  final review (task wrap-up, or a review is asked for) run a suite only if it
  can observe what changed: `test:popups` / `test:a11y` /
  `test:focus` cover the popup sandbox and the sign-in screens, their `:app`
  variants the signed-in client, `test:editor:e2e` the composer, `test:peek:app`
  the hold-to-peek on photos (`components/mediaPeek`), `test:viewer:app` the
  media viewer's paging (`components/mediaViewer`), `test:calls` the calls'
  noise suppressor (`lib/calls/noiseSuppression`), `test:memory:app` what a long
  session leaves in memory (caches, players, registries, the workers), `test:hot:app` (with `test:popups`, and
  `test:calls`, whose worklet runs the registry) the dev server's hot updates (`scripts/hot-*.mjs`,
  `@helpers/hotRegistry`, `@helpers/hotModule`). A change none
  of them exercises (chat-only styling, a manager fix) skips them. Report what
  ran, and what was skipped and why.
- **Heavy runs wait their turn on a shared machine.** Every Playwright run and a
  full `vitest run` take their workers from one budget for the whole machine —
  75% of the CPUs, shared by every checkout and worktree
  (`scripts/test-queue.sh`) — so suites from parallel sessions run one after
  another instead of starving each other into timeouts. A run may print
  `[test-queue] … waits for its turn` and sit there: start suites in the
  background, never kill a waiting run to retry it, and see who is ahead with
  `bash scripts/test-queue.sh`. A Playwright run narrowed to some files or
  tests gets at most 4 workers unless `--workers` says otherwise, so a few of
  them share the machine; vitest on a few files does not queue at all.
  The full run of a release build (`node build.js`) goes ahead of every
  waiting run, though never ahead of a running one
  (`TWEB_TEST_QUEUE_PRIORITY=1` — that build's alone, never set it for a
  suite of your own). `TWEB_TEST_QUEUE=0` runs without the queue; CI never
  queues.
- **A code review goes to Codex first.** Asked to review a change, an agent
  other than Codex does not review its own work: it hands the change, and what
  it is for, to Codex (GPT) with `scripts/codex-review.sh`, then checks each
  finding against the code before fixing or reporting it — the `codex-review`
  skill (`.claude/skills/codex-review/SKILL.md`) has the steps. Only when Codex
  is unavailable (the script exits 3: not installed, signed out, every model
  refused) does the agent review the change itself, and its report says so.
- **"Финализируй" (`/finalize`) means review, fix and commit.** It is the
  explicit request to commit that the rule under "What NOT to Do" waits for,
  and it covers only the change at hand: review it as above, fix what the review
  confirms, run the tests the final review calls for, and commit it as one
  commit of only that change — never pushed. A fix the code and the rules
  already settle is made without asking; a question only the user can answer
  holds the commit until they have answered and said to commit. The steps are in
  `.claude/skills/finalize/SKILL.md`.

## Accessibility (a11y) is part of every UI feature

**Every new or changed interface must include accessibility in its design,
implementation, and review.** Apply the requirements below to the affected flow
before calling the feature complete.

**The layer is off by default and on with `?a11y=1` (`Modes.a11y`)** until it
settles. With the flag off the client must look and behave as it did before the
layer; with it on, as described below. So every addition that someone without
assistive technology can notice goes behind `Modes.a11y`, read at call or render
time: tab stops, `.focus()` and focus restoration, focus traps, key handlers and
key routing, `inert`, element swaps to `<button>`, reduced motion, and focus
rings (scope CSS with `:where(.a11y)` / `:global(:where(.a11y))`, which keeps
specificity). ARIA names, roles and `.sr-only` text stay on either way. The shared
helpers (`createFocusTrap`, `buttonKeyDown`, `ensureButtonSemantics`,
`attachTabList`, `attachPickerGrid`, `handleMenuKeyDown`,
`updateScrollRegionFocusable`, `attachClickEvent`'s keyboard click) already check
the flag, and a control that becomes a native `<button>` only with the layer is
an `A11yButton` (`@components/a11yButton`; imperatively `Button(..., {asDiv:
!Modes.a11y})`). The a11y and focus suites open their pages with `?a11y=1`, and a
unit test of the layer imports `@/tests/helpers/a11yLayer`.

- **Start with native semantics.** Use buttons for actions, links for navigation,
  and native form controls where possible. Preserve label/control associations;
  never nest interactive controls. Expose names, values, errors, and states
  (disabled, expanded, selected, checked, loading) through native attributes or
  appropriate ARIA. Reuse visible labels and localized strings from `lang.ts`;
  give icon-only controls meaningful names and hide decorative icons from AT.
- **Preserve established presentation and behavior.** Reuse native caret and
  existing field-focus styling instead of adding a second outline. Avoid blanket
  restyling, tab stops on layout wrappers, and live regions around long content.
  Opt into focusable reading/scrolling regions deliberately; keep contrast
  enhancements behind the user's setting. Check that keyboard guards preserve
  existing editor shortcuts as well as protecting other focused controls.
- **Reuse the shared interaction layer.** Search for existing button, row, input,
  menu, tab, navigation, and focus helpers before adding behavior. Extend those
  helpers when needed. Do not copy Enter/Space handlers into individual controls
  or implement separate business logic for keyboard activation. Native buttons
  already handle keyboard activation; custom widgets should share their
  navigation logic. Global shortcuts must respect focused controls and editors.
- **Make every action usable with a keyboard.** Keep a logical focus order and
  visible focus indicators. Follow the relevant widget's arrow/Home/End behavior
  through shared helpers; avoid positive `tabindex`. Inactive or hidden panels
  must not leave controls in the tab order or accessibility tree; use the
  existing visibility/`inert` mechanism, not `aria-hidden` alone.
- **Handle focus across the full lifecycle.** Dialogs need appropriate initial
  focus, modal containment, and restoration on close. Menus and dismissible
  overlays need consistent Escape behavior, including nested overlays and an
  opener that has been removed. Reuse the existing overlay/focus lifecycle.
  For UI that can move into Document PiP, use the owning/active document for
  creation, listeners, focus, and cleanup; support moving back to the main tab.
- **Preserve visual accessibility.** Check text, controls, and focus contrast in
  the shipped themes, support zoom and narrow layouts, avoid color-only cues,
  and respect reduced-motion preferences.
- **Verify the affected flow in the browser preview.** Exercise opening,
  changing, submitting/cancelling, and closing with Tab/Shift+Tab, Enter/Space,
  arrows, and Escape as applicable; check focus restoration and pointer/touch
  behavior too. Run the relevant existing accessibility checks (in the final
  review — see Agent Workflow) and add focused regression coverage for shared
  or complex interaction changes. Include
  responsive/PiP states when the feature supports them.
- **Report what was actually verified.** Distinguish automated checks (including
  Axe), fixture tests, authenticated UI checks, and screen-reader testing.
  Check screen-reader names, roles, states, and announcements for affected
  custom interactions when available, and explicitly record untested cases.
  Passing Axe or source review alone does not establish full accessibility.

## Right-to-left (RTL) is part of every UI feature

Arabic, Persian, Hebrew and the other right-to-left languages lay the whole
client out mirrored. **Every new or changed interface must work right to left**:
design it, build it and check it that way before calling it done — the same as
accessibility, never a follow-up. What mirrors and what does not follows the
common bidirectional guidelines (Material Design's Bidirectionality, Apple's
Right to left, the W3C's internationalization notes) — never another Telegram
client, whose RTL support is incomplete.

- **How the direction is set.** `I18n.applyDirection()` (`@lib/langPack`) puts
  `dir`, `lang` and `.is-rtl` on `<html>` on every language apply, by the
  server's word on the language (`langPackLanguage.rtl`, kept with the pack as
  `rtl`), or by its code (`isRTLLangCode`) for a pack without it. A switch in Settings → Language flips the
  running app without a reload, so nothing may decide the direction once, at
  load or at construction: read `I18n.isRTL()` (a signal; `I18n.getIsRTL()`
  outside a reactive scope) when laying out. `?rtl=1` forces RTL in any
  language, `I18n.forceRTL(true | false | undefined)` flips it live from the
  console, and the popup sandbox has a direction switch next to its theme.
- **CSS is logical, not physical.** `margin-inline-*`, `padding-inline-*`,
  `inset-inline-*`, `border-inline-*`, `text-align: start | end`, logical corner
  radii (`border-start-start-radius` …). Physical `left` / `right` only for a
  coordinate that is physical: a position JS measured, `left: 50%` centring,
  full width. Movement along the line multiplies by `var(--reflect)` (`1` / `-1`):
  `translateX(calc(100% * var(--reflect)))`, gradient angles
  `calc(90deg * var(--reflect))`, a shimmer or loading sweep running from the
  inline start; origins use `--transform-origin-inline-start` / `-end`. Where nothing logical exists (`background-position`, `clip-path`,
  shadows), override under `.is-rtl &`. Never set a logical property and its
  physical twin for the same side in one block: production's lightningcss
  emits the lowered logical rule after the block with a higher specificity, and
  the physical one silently loses in the build only (logical radii become
  `:lang()` rules — one reason `<html lang>` must be right).
- **Icons.** Glyphs that point along the line (arrows, back, send, reply,
  forward, undo, list bullets) are listed in `src/iconsReverse.ts`; `Icon()` and
  `<IconTsx>` give them `.icon-mirror`, which the stylesheet flips in RTL (with
  `scale`, so it composes with a `transform` animation). A new directional icon
  goes into that list; a glyph that points along the line in one place only (the
  logo as a send plane) takes the class `icon-mirror` there — never a hand-made
  `scaleX(-1)`.
- **JS geometry and input.** `getBoundingClientRect()`, `clientX`, `offsetLeft`
  and `style.left` are physical: mirror whatever is measured from "the start" of
  a row, and prefer writing logical styles (`style.insetInlineStart`) or a CSS
  variable the stylesheet applies logically. `scrollLeft` is `0` at the start
  and negative toward the end in RTL. In a horizontal widget ArrowRight means
  "previous" and ArrowLeft "next" (`getInlineArrowKeys()`); horizontal swipes
  and drags (swipe-to-reply, swipe-back, tab swipes) flip their sign
  (`handleTabSwipe` already does).
- **Sequences page in reading order.** The media viewer, stories, the profile
  photo carousel, slideshows and any other gallery or carousel put the next item
  at the inline end — on the left in RTL: its arrow, the side a click goes on by,
  ArrowLeft, a swipe to the right and the slide all point that way, and a
  progress that counts steps (the stories strip) fills from the right. One
  inside content of its own direction (a page's or a rich message's slideshow)
  pages that way. Outgoing messages sit on the left.
- **Text.** Content whose direction is unknown — names, messages, captions —
  gets `dir="auto"` (`setDirection()` / `setInnerHTML()`); strings that are
  always left to right — phone numbers, codes, card numbers, URLs, standalone
  @usernames, signed amounts, code — get `dir="ltr"`; parts joined into one line
  are isolated (`unicode-bidi: isolate`) so one RTL part does not reorder its
  neighbours. A string an RTL pack lacks falls back to English, which `I18n`
  puts in a left-to-right isolate inside its element (`untranslatedKeys`), the
  spaces that join it to its neighbours left outside. The composer lays a draft
  out in the direction it is sent in (`editorDocumentRtl`, the first block with
  text), not the interface's.
- **What is not mirrored.** Media playback — seek and progress bars, voice
  waveforms, video timelines, play / rewind / forward — runs left to right: it
  follows the tape, not the reading direction. Put the attribute `dir="ltr"` on
  the control (icons inside a `[dir="ltr"]` island are not mirrored) and keep its
  geometry physical. Media content, stickers, illustrations, avatars, QR codes,
  maps, charts and graphs, clocks and anything that turns clockwise, check marks
  and digits stay as they are. Value sliders (volume, sizes, colours) do mirror;
  a native `<input type="range">` takes its arrow keys through
  `onRangeInlineArrowKey` (WebKit steps a right-to-left range by the keys'
  sides, not by its direction).
- **Verify it.** Look at the change in the preview with `?rtl=1` (or flip
  `I18n.forceRTL()` and back) side by side with LTR: layout, open/close and
  slide animations, menus and tooltips opening toward the right side, scrolling
  strips, keyboard and swipe directions. For an RTL language's own text, switch
  the language to Arabic or Persian in Settings — on the preview's built bundle
  (`?static=1`): the dev server lays the local English strings over the
  server's pack. The direction switch
  itself is covered by `src/tests/langDirection.test.ts`, and
  `e2e/popupSandboxRtl.spec.ts` (part of `test:popups`) opens every popup story
  in both directions and fails on a box that does not stand mirrored, and checks
  that a value slider runs from the right.

## What NOT to Do

(Style rules are in "Code Style"; the import-alias, `invokeApi`-from-UI, and
`getUserMedia`-via-`getStream` rules are in "Path Aliases", "App Managers", and
"Key Patterns → Media devices" — not repeated here.)

- **Never commit on your own initiative — only when explicitly asked.**
  Iterating on a feature must not produce a trail of commits: keep the work in
  the working tree, and when asked to commit, fold the whole feature into ONE
  commit (directly on master, no feature branch) unless told otherwise.
- Do not add `oxlint-disable` (or legacy `eslint-disable`) comments without a reason
- Never hand-edit or manually run `format-lang` to regenerate `src/scripts/out/langPack.strings` — it is auto-generated from `lang.ts`/`langSign.ts` by the Vite-wired lang watcher (`watch-lang.js`) on dev-server start, on every `lang.ts` change, and on build. Edit the lang `.ts` source only.
- Never hand-edit `src/lib/settingsSearch/generated.ts` — it is the settings-search index, generated from the tabs (see "Settings tabs are indexed for search"). Change what the tabs render, or the extractor, and let it regenerate.
- Do not import from `react` or use React patterns — this is Solid.js
- Do not use heavy CSS selectors (deep descendant chains, universal `*`, expensive attribute matchers, `:not()` with complex arguments) — prefer a dedicated class on the target element
- **Never add a blocking MTProto request on the chat-open path.** `ChatInput.finishPeerChange` (and any sibling `finishPeerChange` in the chat stack) awaits a `Promise.all` before unfreezing the input — every entry there is paid in chat-open latency. Do NOT add `appPrivacyManager.getGlobalPrivacySettings`, `appProfileManager.getProfile` for unrelated peers, fresh `account.*` fetches, or any new uncached round-trip into that batch. If a feature needs server data, either: (a) read it from a manager-side cache that's already kept warm (e.g. `apiManagerProxy.getAppConfig`, `getPrivacy` after preload, cached userFull), (b) fetch it lazily AFTER the chat renders and reconcile via an event (`peer_full_update`, `privacy_update`, custom dispatched event) + a `update*` helper, or (c) preload at app startup and gate via `rootScope.premium`-style cached flags. The same rule holds for `appImManager.setPeer` listeners and `setChatListeners` — keep them event-driven, never `await managers.*` for a per-peer hot-path render.

## Running Tests

```bash
pnpm test                  # all tests
pnpm test src/tests/foo    # specific test file
```

Vitest config: `threads: false`, `globals: true`, jsdom environment, setup in `src/tests/setup.ts`.

Browser suites (Playwright):

```bash
pnpm test:popups   # every sandbox story opens and becomes visible, composer popups (~50 s)
pnpm test:popups:full  # the same in Firefox and WebKit too (~3 min)
pnpm test:editor:e2e  # the composer in its fixture page: cursor, clipboard, uploads, rich blocks (~40 s)
pnpm test:editor:e2e:full  # the same in Firefox and WebKit too (~4 min)
pnpm test:a11y     # Axe matrix, keyboard interop, contrast, media editor, stories (~2 min)
pnpm test:a11y:full  # the same, with the story sweep in all four themes (~4 min; always on CI)
pnpm test:focus    # keyboard focus is VISIBLE — sandbox stories + the sign-in screens (~50 s)
pnpm test:focus:app  # the same, for the signed-in client (needs PLAYWRIGHT_BASE_URL)
pnpm test:a11y:app   # Axe past the login screen (needs PLAYWRIGHT_BASE_URL)
pnpm test:idle:app   # the profile sidebar goes idle once open (needs PLAYWRIGHT_BASE_URL)
pnpm test:peek:app   # holding a photo peeks at it: chat, rich message, shared media (needs PLAYWRIGHT_BASE_URL)
pnpm test:viewer:app # the media viewer: its place and header, a step pressed mid-step, paging right to left, a dead picture URL, a video's stand-in (needs PLAYWRIGHT_BASE_URL)
pnpm test:calls      # the calls' noise suppressor: RNNoise in its AudioWorklet, in Chromium (~30 s)
pnpm test:memory:app # a session played several times: no isolate's heap, DOM or renderer allocator keeps growing, idle lottie heaps go back (needs PLAYWRIGHT_BASE_URL of a --static preview; ~7 min)
pnpm test:hot:app    # every module a signed-in boot loads, run again as a hot update does: no false reload (needs PLAYWRIGHT_BASE_URL)
```

`test:a11y` runs against a plain unauthenticated server, so everything past the
login screen is outside it — the chat list, a conversation, the profile sidebar,
settings. `test:a11y:app` is that half, and it needs an authorized preview for
the same reason `test:focus:app` does.

`test:a11y` runs in parallel and sweeps every popup story with Axe in one theme
(`day`): roles, names and keyboard wiring do not change with the theme, only
colour does. `test:a11y:full` (`A11Y_ALL_THEMES=1`, implied on CI) sweeps all
four — run it after touching colours or theme variables. `A11Y_THEMES=night,tinted`
picks themes, `A11Y_STORIES=a,b` picks stories, `A11Y_WORKERS` / `A11Y_STORY_PARTS`
tune the split, and `--project=chromium` drops the other engines (~70 s).
`test:popups` works the same way: parallel, the story sweep split into parts
(`POPUPS_WORKERS` / `POPUP_STORY_PARTS`), Chromium unless `POPUPS_ALL_ENGINES=1`
(`test:popups:full`, implied on CI). So does `test:focus`, on the popup suite's
kind of server (`playwright.focus.config.ts`): a part per worker but one, which
the sign-in sweep takes (`FOCUS_WORKERS` / `FOCUS_STORY_PARTS`,
`FOCUS_STORIES=a,b` picks stories).
`test:editor:e2e` too: parallel (`EDITOR_E2E_WORKERS`), Chromium unless
`EDITOR_E2E_ALL_ENGINES=1` (`test:editor:e2e:full`, implied on CI); and since its
every test opens the fixture by navigating, a Chromium worker keeps one page and
navigates it again for each test (`samePage` in `e2e/workerContext.ts`) — a new
document in a warm renderer, three times faster to open than a new page.
Playwright suites run on `vite.e2e.config.ts` — the dev server without hot
reload, so an edit made while a suite runs no longer reloads the page under it.
Each suite's server listens on a port of its checkout's own (`e2e/ports.ts`), so
the suites of different checkouts and worktrees run side by side.
The sandbox suites (`test:popups`, `test:focus`, `test:a11y`) get the app as a
bundle instead (`vite.popups-e2e.config.ts`: Vite's Full Bundle Mode, built
once as the server starts, ~25 s). Each of their tests opens the sandbox anew,
and served module by module that is ~1800 requests a page — ~25 s each with a
full run's pages at once, against ~7 s bundled. A bundle has no module URLs, so
a test that reaches into the app — a store, `rootScope`, a popup to open, a
harness of `e2e/fixtures` — calls `window.e2eImport('/src/…')` in the page,
never `import('/src/…')`; it gives the app's own instance on either kind of
server. Write the path whole, as a string in the spec: the bundle can import
only the modules some spec under `e2e/` names that way (`vite.e2e.config.ts`
reads them out), and asked for another, `e2eImport` says so.
`TWEB_E2E_BUNDLED=0` serves the modules as they are (no build, the quicker for
one spec); `popupSandboxHotRerun.spec.ts`, which runs every module again by its
URL, always has a server of that kind beside the bundle.

`test:focus` answers a question the others cannot: not whether a control has a
name and a role, but whether a person pressing Tab can *see* where they are. It
photographs each control holding focus and again a moment after focus is
dropped, and a pair of frames that do not differ is a control with no visible
indicator. Reading computed styles instead does not work — a ring can live on a
pseudo-element or a sibling, and an outline on an `opacity: 0` overlay is
painted and invisible. It waits for nothing by the clock: each stop runs the
transitions it set off to their end and waits for the control to hold still.
Findings come with cropped before/after screenshots, so judge them by eye
rather than trusting the heuristic. The signed-in half needs
an authorized preview:

```bash
bash scripts/start-preview.sh --detach    # prints the URL, say http://localhost:9001
PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:focus:app
PLAYWRIGHT_BASE_URL=http://localhost:9001 pnpm test:a11y:app
```

## Agents & shared tooling

Skills and commands live **in the repo** as the single source; per-agent
integration only points at them:

- **Skills** — `.claude/skills/*/SKILL.md` (standard Agent Skills format:
  `name` + `description` frontmatter, optional bundled scripts). Claude Code
  discovers them automatically. Codex discovers them via symlinks in
  `~/.codex/skills/` pointing at these directories. An agent without skill
  auto-discovery should still open the matching SKILL.md and follow it when a
  task fits its description. Paths inside skills are relative to the repo root.
- **Commands / prompts** — `.claude/commands/*.md` are slash-command prompt
  files (`$ARGUMENTS`-style placeholders); Codex reads them via symlinks in
  `~/.codex/prompts/`. Exception: `forge.md` is Claude-Code-only — it depends
  on a Claude statusline usage gate and will not work elsewhere.
- **Tool-name mapping** — skill/command texts may name Claude Code tools.
  Substitute your agent's equivalent: "Agent tool" / "subagent" / `Explore`
  → spawn a sub-task or do the search inline; browser-pane `preview_start`
  → run `bash scripts/start-preview.sh --detach` and open the printed URL;
  `AskUserQuestion` → ask in chat.
- `.claude/launch.json` (preview servers) and `.claude/settings.local.json`
  (permissions) are Claude-Code-specific; the Codex counterpart is
  `~/.codex/config.toml`.

Re-create the Codex symlinks on a new machine (run from the repo root):

```bash
mkdir -p ~/.codex/skills ~/.codex/prompts
for s in graphify run-build tg-port-feature tweb-bugs tweb-mtproto-debug; do
  ln -sfn "$(pwd)/.claude/skills/$s" ~/.codex/skills/$s
done
for c in planner task refactor-popup-procedural; do
  ln -sfn "$(pwd)/.claude/commands/$c.md" ~/.codex/prompts/$c.md
done
```
