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
pnpm lint           # ESLint on src/**/*.ts
```

Debug query params: `?test=1` (test DCs), `?debug=1` (verbose logging), `?noSharedWorker=1` (disable shared worker).

### Preview

Launch an authorized local preview with `bash scripts/start-preview.sh` (never
plain `vite`) — it mints a fresh per-preview auth + picks a free port. Flags and
details: see the script header. `.claude/launch.json` wires it into Claude
Code's preview pane; other agents run the script directly and open the printed
URL with their own browser tooling.

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

## Code Style (all ESLint-enforced)

Non-obvious rules — these differ from common defaults:

- **No space after keywords**: `if(cond)`, `for(...)`, `while(...)`, `switch`, `catch` — not `if (cond)`
- **No space inside `{}` / `[]`**: `{a: 1}` and `[1, 2]` — not `{ a: 1 }`
- **No trailing comma** anywhere
- **No space before function paren**: `function foo()`
- **No `return await`** — return the promise directly

Standard defaults, also enforced: 2-space indent, single quotes, LF + final newline, no trailing whitespace, max 2 blank lines, `prefer-const`.

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
| `eslint.config.mjs` | ESLint flat config |

## What NOT to Do

(Style rules are in "Code Style"; the import-alias, `invokeApi`-from-UI, and
`getUserMedia`-via-`getStream` rules are in "Path Aliases", "App Managers", and
"Key Patterns → Media devices" — not repeated here.)

- **Never commit on your own initiative — only when explicitly asked.**
  Iterating on a feature must not produce a trail of commits: keep the work in
  the working tree, and when asked to commit, fold the whole feature into ONE
  commit (directly on master, no feature branch) unless told otherwise.
- Do not add `eslint-disable` without a reason
- Never hand-edit or manually run `format-lang` to regenerate `src/scripts/out/langPack.strings` — it is auto-generated from `lang.ts`/`langSign.ts` by the Vite-wired lang watcher (`watch-lang.js`) on dev-server start, on every `lang.ts` change, and on build. Edit the lang `.ts` source only.
- Do not import from `react` or use React patterns — this is Solid.js
- Do not use heavy CSS selectors (deep descendant chains, universal `*`, expensive attribute matchers, `:not()` with complex arguments) — prefer a dedicated class on the target element
- **Never add a blocking MTProto request on the chat-open path.** `ChatInput.finishPeerChange` (and any sibling `finishPeerChange` in the chat stack) awaits a `Promise.all` before unfreezing the input — every entry there is paid in chat-open latency. Do NOT add `appPrivacyManager.getGlobalPrivacySettings`, `appProfileManager.getProfile` for unrelated peers, fresh `account.*` fetches, or any new uncached round-trip into that batch. If a feature needs server data, either: (a) read it from a manager-side cache that's already kept warm (e.g. `apiManagerProxy.getAppConfig`, `getPrivacy` after preload, cached userFull), (b) fetch it lazily AFTER the chat renders and reconcile via an event (`peer_full_update`, `privacy_update`, custom dispatched event) + a `update*` helper, or (c) preload at app startup and gate via `rootScope.premium`-style cached flags. The same rule holds for `appImManager.setPeer` listeners and `setChatListeners` — keep them event-driven, never `await managers.*` for a per-peer hot-path render.

## Running Tests

```bash
pnpm test                  # all tests
pnpm test src/tests/foo    # specific test file
```

Vitest config: `threads: false`, `globals: true`, jsdom environment, setup in `src/tests/setup.ts`.

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
  → run `bash scripts/start-preview.sh` and open the printed URL;
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

<!-- rtk-instructions v2 -->
## RTK — token-optimized commands

Prefix every shell command with `rtk`, including each command inside `&&`
chains: `rtk git add . && rtk git commit -m "msg"`. RTK applies a filter when it
has one, otherwise passes through unchanged — so it is always safe.
<!-- /rtk-instructions -->
