# Code Duplication Analysis — tweb

Comprehensive analysis of code duplications across the tweb codebase: functions, styles, component patterns, and library-level code.

---

## Table of Contents

1. [Helper/Utility Function Duplications](#1-helperutility-function-duplications)
2. [CSS/SCSS Style Duplications](#2-cssscss-style-duplications)
3. [Component Pattern Duplications](#3-component-pattern-duplications)
4. [Library/Manager Layer Duplications](#4-librarymanager-layer-duplications)
5. [Cross-Cutting Duplications](#5-cross-cutting-duplications)
6. [Summary & Recommendations](#6-summary--recommendations)

---

## 1. Helper/Utility Function Duplications

### 1.1 `noop()` — 3 implementations

| File | Implementation |
|------|---------------|
| `src/helpers/noop.ts` | `export default function noop() {}` (canonical) |
| `src/lib/storage.ts:24` | `function noop() {}` (local) |
| `src/helpers/context.ts:46` | `const noop = () => {};` (local) |

**Fix:** Replace local versions with `import noop from '@helpers/noop'`.

### 1.2 `formatBytes` / `formatBytesPure` — duplicate algorithm

| File | Difference |
|------|-----------|
| `src/helpers/formatBytes.ts` | Uses `i18n()` for localized labels |
| `src/helpers/formatBytesPure.ts` | Returns plain strings (`'KB'`, `'MB'`, etc.) |

Both use identical logic (k=1024, log calculation, decimals). Can be consolidated into one parameterized function.

### 1.3 `deepEqual` — 2 implementations

| File | Function | Details |
|------|----------|---------|
| `src/helpers/object/deepEqual.ts` | `deepEqual<T>()` | Full-featured, supports `ignoreKeys` |
| `src/components/mediaEditor/utils.ts:51` | `approximateDeepEqual()` | Numeric tolerance via `COMPARISON_ERROR` threshold |

**Fix:** Extend `deepEqual` with an optional tolerance parameter; import in `mediaEditor/utils.ts`.

### 1.4 `isObject` — 2 implementations

| File | Implementation |
|------|---------------|
| `src/helpers/object/isObject.ts` | `typeof(object) === 'object' && object !== null` (correct) |
| `src/components/mediaEditor/utils.ts:47` | `obj instanceof Object` (different edge cases) |

**Fix:** Import from `@helpers/object/isObject`.

### 1.5 `delay()` — missing shared helper

| File | Implementation |
|------|---------------|
| `src/components/mediaEditor/utils.ts:14` | `export const delay = (timeout) => new Promise(resolve => setTimeout(resolve, timeout))` |

Common utility pattern with no shared helper. Should be extracted to `@helpers/delay.ts`.

### 1.6 Floating-point comparison constants — 3 scattered definitions

| File | Constant | Value |
|------|----------|-------|
| `src/components/mediaEditor/utils.ts:49` | `COMPARISON_ERROR` | 0.001 |
| `src/components/mediaEditor/finalRender/renderToActualVideo.ts:42` | `VIDEO_COMPARISON_ERROR` | 0.0001 |
| `src/components/messageSpoilerOverlay/utils.ts:12` | `GENEROUS_COMPARISON_ERROR` | 0.1 |

Values differ by context, but having no central location for these makes them hard to discover.

---

## 2. CSS/SCSS Style Duplications

**Files analyzed:** 243 SCSS files (135 in `src/scss/`, 108 in `src/components/`)

### 2.1 Flexbox centering — 270+ occurrences, 80+ files

```scss
display: flex;
align-items: center;
justify-content: center;
```

No shared mixin exists. `.position-center` in `_global.scss` only handles absolute positioning.

**Fix:** Create `@mixin flex-center()`.

### 2.2 Text overflow truncation — 36+ occurrences, 15+ files

```scss
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

A mixin exists (`@mixin text-overflow()` in `src/scss/mixins/_textOverflow.scss`) but is **underutilized**. Many files duplicate this inline.

**Fix:** Enforce usage of existing `@mixin text-overflow()`.

### 2.3 Absolute centering with transform — 45+ occurrences, 12+ files

```scss
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
```

`.position-center` utility class exists in `_global.scss` but is rarely used directly.

**Fix:** Create `@mixin absolute-center()` or enforce `.position-center` usage.

### 2.4 Transition patterns — 74+ occurrences, 60+ files

| Pattern | Count |
|---------|-------|
| `transition: opacity var(--transition-standard-in)` | 34 |
| `transition: transform var(--transition-standard-in)` | 30 |
| `transition: none !important` | 24 |
| `transition: opacity .2s ease-in-out` | 13 |

**Fix:** Create `@mixin transition-opacity()` and `@mixin transition-transform()`.

### 2.5 Full-fill positioning — 56+ occurrences

```scss
width: 100%;
height: 100%;
/* or */
top: 0; left: 0; right: 0; bottom: 0;
```

**Fix:** Create `@mixin full-fill()`.

### 2.6 `border-radius: 50%` — 76 occurrences

Circular elements with `border-radius: 50%` appear 76 times. No shared mixin.

### 2.7 `overflow: hidden` — 262 occurrences, 108 files

Heaviest files: `_chatBubble.scss` (17), `_global.scss` (17), `_mediaViewer.scss` (5).

### 2.8 Inconsistent gap notation

`.5rem` vs `0.5rem` used interchangeably — 15 vs 6 occurrences.

### 2.9 Well-managed patterns (no action needed)

| Pattern | Mixin | Status |
|---------|-------|--------|
| Animation level checks (258 uses) | `@mixin animation-level()` | Well-adopted |
| Premium state checks (36 uses) | `@mixin premium()` | Well-adopted |
| Media queries | `@mixin respond-to()` | Well-adopted |
| Z-depth shadows | `.z-depth-*` classes | Well-adopted |

---

## 3. Component Pattern Duplications

### 3.1 Popup event listener boilerplate — 35 popup files, 93 addEventListener calls

Every popup extending `PopupElement` sets up listeners identically:

```typescript
this.listenerSetter.add(element)('click', callback);
this.addEventListener('show', () => { /* setup */ });
this.addEventListener('closeAfterTimeout', () => { /* cleanup */ });
```

**44 popup subclasses** all follow the same `constructor → d()/construct() → show()` flow.

### 3.2 Form input setup — 39 popup files, 644 InputField/CheckboxField instances

```typescript
const inputField = new InputField({label: 'Label', maxLength: 64, required: true});
inputField.validate = () => { /* ... */ };
this.listenerSetter.add(inputField.input)('input', onChange);
```

Heaviest files: `paymentCard.ts` (90), `paymentShipping.ts` (88), `boostsViaGifts.tsx` (50).

**Fix:** Create a `FormPopup` base class or form builder utility.

### 3.3 DOM element creation — 51 popup files, 432 createElement/append calls

```typescript
const div = document.createElement('div');
div.classList.add('class-name');
container.append(div, element);
```

**Fix:** Consider a small DOM builder utility or further migration to JSX.

### 3.4 API error handling in popups — 30+ files, 44 `.catch()` patterns

```typescript
promise.then(() => {
  this.hide();
}, (err: ApiError) => {
  if(err.type === 'ERROR_TYPE') {
    toastNew({langPackKey: 'ErrorMessage'});
  }
});
```

**Fix:** Create a shared `handleApiError()` utility.

### 3.5 Row/Avatar rendering — 20+ files

```typescript
const row = new Row({title: wrapEmojiText(text), clickable: true});
const media = row.createMedia('abitbigger');
const avatar = avatarNew({peerId, middleware, size: 32});
media.append(avatar.node);
```

Repeated avatar-in-row construction pattern.

### 3.6 Middleware validation — 10+ popup files

```typescript
const middleware = this.middlewareHelper.get();
// async operation
if(!middleware()) return;
```

Consistent but repetitive pattern across all async popup logic.

### 3.7 Wrapper components — 40 files in `src/components/wrappers/`

All follow similar structure: import media type → render with `LazyLoadQueue` → apply middleware → return element. Could benefit from a generic `wrapMedia()` factory.

---

## 4. Library/Manager Layer Duplications

### 4.1 Event listener registration — 21+ AppManagers

Every manager's `after()` method calls:

```typescript
this.apiUpdatesManager.addMultipleEventsListeners({
  updateXxx: this.onUpdateXxx,
  updateYyy: this.onUpdateYyy
});
```

### 4.2 Peer storage initialization — appChatsManager + appUsersManager

Both managers have ~40 identical lines:

```typescript
return Promise.all([
  this.appStateManager.getState(),
  this.appStoragesManager.loadStorage('entityType')
]).then(([state, {results, storage}]) => {
  this.storage = storage;
  this.saveApiEntities(results);
  this.peersStorage.addEventListener('peerNeeded', (peerId) => { ... });
  this.peersStorage.addEventListener('peerUnneeded', (peerId) => { ... });
});
```

**Fix:** Extract to a shared `initializePeerStorage()` base method.

### 4.3 Promise-based request deduplication — 30+ files

```typescript
private getXxxPromises: Map<Key, Promise<Value>> = new Map();

public getXxx(key: Key) {
  let promise = this.getXxxPromises.get(key);
  if(promise) return promise;
  promise = this.apiManager.invokeApi(...).then(result => {
    this.getXxxPromises.delete(key);
    return result;
  });
  this.getXxxPromises.set(key, promise);
  return promise;
}
```

Files: `appEmojiManager.ts`, `appReactionsManager.ts`, `appMessagesManager.ts`, `appProfileManager.ts`, and 26+ more.

**Fix:** Create a generic `RequestDeduplicator<K, V>` utility class.

### 4.4 API call with chats/users save — 226 occurrences, 33 files

```typescript
return this.apiManager.invokeApiSingleProcess({
  method: 'some.method',
  params: {...},
  processResult: (result) => {
    this.appChatsManager.saveApiChats(result.chats, true);
    this.appUsersManager.saveApiUsers(result.users);
    // process specific data
  }
});
```

The `saveApiChats` + `saveApiUsers` pair is called in nearly every API result processor.

**Fix:** Create a wrapper that auto-saves chats/users from API results.

### 4.5 Solid.js store initialization — 3+ stores

```typescript
const [value, setValue] = createRoot(() => createSignal(initialValue));
rootScope.addEventListener('event', setValue);
if(rootScope.myId) {
  rootScope.managers.rootScope.getValue().then(setValue);
} else {
  rootScope.addEventListener('user_auth', () => {
    rootScope.managers.rootScope.getValue().then(setValue);
  });
}
export default function useValue() { return value; }
```

Files: `src/stores/premium.ts`, `src/stores/appSettings.ts`, `src/stores/stars.ts`.

**Fix:** Create a `createAuthAwareStore()` factory function.

### 4.6 Cache with expiration — appProfileManager and others

```typescript
private cache: {[id: string]: CachedType} = {};
private expiration: {[peerId: PeerId]: number} = {};

public get(id) {
  if(this.cache[id] && Date.now() < this.expiration[id.toPeerId()]) {
    return this.cache[id];
  }
  return this.fetchAndCache(id);
}
```

**Fix:** Create a `CachedValue<T>` utility with TTL support.

---

## 5. Cross-Cutting Duplications

### 5.1 Error handling blocks — 241 catch blocks, 145 files

Many follow identical patterns (log + toast notification) with no shared handler.

### 5.2 `rootScope` import — 242 files

Most common import in the codebase. While not reducible, access patterns like `rootScope.managers.appXxxManager` could be simplified with local destructuring or helper re-exports.

### 5.3 Scattered constants

`SECTION_ID`, `ACTION_TYPE_`, and `MESSAGE_` constants appear across 13+ files. Some could be centralized in `src/config/`.

---

## 6. Summary & Recommendations

### Duplication Statistics

| Category | Duplicated Instances | Files Affected | Severity |
|----------|---------------------|----------------|----------|
| Utility functions (noop, formatBytes, etc.) | 10 | 8 | Medium |
| CSS flex/positioning patterns | 400+ | 80+ | High |
| CSS transition patterns | 74+ | 60+ | Medium |
| CSS text overflow (underused mixin) | 36+ | 15+ | Low |
| Popup boilerplate | 93 listeners | 35 | High |
| Form input setup | 644 instances | 39 | High |
| DOM createElement calls | 432 calls | 51 | Medium |
| API error handling | 44 catch patterns | 30 | Medium |
| Request deduplication maps | 30+ | 30+ | High |
| API result processing | 226 occurrences | 33 | High |
| Peer storage init | 40 lines | 2 | Low |
| Store init pattern | 3 | 3 | Low |

### Priority Recommendations

#### High Priority

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Create `@mixin flex-center()` for SCSS | Reduces 270+ duplications | Low |
| 2 | Create `RequestDeduplicator<K,V>` utility | Consolidates 30+ promise maps | Medium |
| 3 | Create API result wrapper (auto-save chats/users) | Simplifies 226 call sites | Medium |
| 4 | Create `FormPopup` base class or form builder | Reduces form boilerplate in 39 popups | Medium |

#### Medium Priority

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 5 | Create `@mixin absolute-center()` and `@mixin full-fill()` | Reduces 100+ duplications | Low |
| 6 | Create transition SCSS mixins | Reduces 74+ duplications | Low |
| 7 | Consolidate `formatBytes`/`formatBytesPure` | Removes 1 duplicate file | Low |
| 8 | Replace local `noop()` with `@helpers/noop` import | Removes 2 duplications | Trivial |
| 9 | Create shared `handleApiError()` for popups | Reduces 44 catch patterns | Low |
| 10 | Create `createAuthAwareStore()` factory | Simplifies 3+ stores | Low |

#### Low Priority

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 11 | Enforce existing `@mixin text-overflow()` usage | Better mixin adoption | Low |
| 12 | Extract `delay()` to `@helpers/delay.ts` | Prevents future duplication | Trivial |
| 13 | Merge `deepEqual` + `approximateDeepEqual` | Removes 1 duplication | Low |
| 14 | Create `CachedValue<T>` with TTL | Cleaner cache patterns | Medium |
| 15 | Extract `initializePeerStorage()` base method | Removes ~40 duplicate lines | Low |
| 16 | Standardize gap notation (`.5rem` vs `0.5rem`) | Consistency only | Trivial |
