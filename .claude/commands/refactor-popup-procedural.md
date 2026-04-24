---
description: Refactor a class-based PopupElement popup into a procedural showXxxPopup() function using the SolidJS PopupElement from @components/popups/indexTsx.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Refactor Popup: Class → Procedural SolidJS

Convert a legacy class-based `PopupXxx extends PopupElement` (from [src/components/popups/index.ts](src/components/popups/index.ts)) into a procedural `showXxxPopup()` function using the SolidJS `<PopupElement>` shell from [src/components/popups/indexTsx.tsx](src/components/popups/indexTsx.tsx). Reference: [src/components/popups/stickers.tsx](src/components/popups/stickers.tsx) and [src/components/popups/pickUser.tsx](src/components/popups/pickUser.tsx).

## When to use

User asks to refactor a popup at `src/components/popups/<name>.ts(x)` from a class into a procedural style, typically phrased as "отрефактори … на solidjs в процедурном стиле" / "refactor … to procedural solidjs / showXxxPopup".

## Inputs to confirm

- **Source file**: `src/components/popups/<name>.ts` (or `.tsx`). If unclear, ask.
- **Target name**: `show<Xxx>Popup` (camelCase with leading `show`). If the class was `PopupXxx`, default to `showXxxPopup`.

If the current user prompt names the file (even indirectly, e.g. via an open editor selection), proceed without asking.

## Plan

1. Read the source file end-to-end and identify:
   - Constructor parameters → function parameters (preserve types and defaults verbatim)
   - `PopupOptions` passed to `super(...)` (closable, body, footer, scrollable, title, overlayClosable, etc.)
   - Every imperative DOM construction, event listener, rootScope subscription, middleware.onDestroy, and `this.addEventListener('close'/'closeAfterTimeout', ...)` registration — each becomes an `onCleanup` / `subscribeOn` / `onCloseAfterTimeout` / `middleware.onDestroy` in the new file
   - Dynamic DOM mutations — `replaceContent(this.title, ...)`, `this.button.className = ...`, `this.title.after(node)`, `this.appendTo.append(...nodes)`, `el.classList.add('is-loading')` — become **signals bound in JSX**, not imperative ops on refs
   - External usages via `grep -rn "Popup<Xxx>" src/` — these all need to be updated
2. Plan the new file structure (see skeleton below).
3. Write the new `.tsx` file.
4. Delete the old `.ts` file if extensions differ.
5. Update every caller: `PopupElement.createPopup(PopupXxx, ...args).show()` → `showXxxPopup(...args)`. If the file no longer uses `PopupElement` at all, drop the now-unused `import PopupElement from '@components/popups'`.
6. Replace `PopupElement.getPopups(PopupXxx)` usages with an exported `hideAllXxxPopups()` helper backed by a module-level `Set<Handle>` (see skeleton).
7. Run `pnpm lint`, `npx tsc --noEmit`, and ESLint on the new `.tsx` explicitly. Fix findings. `pnpm lint` only globs `.ts`, so also run `npx eslint "src/**/**.tsx"`.

## Target file skeleton

Use the TSX helpers end-to-end: `PopupElement.Title`, `PopupElement.Body`, `PopupElement.Footer`, `PopupElement.FooterButton`, `Scrollable` from `@components/scrollable2`. Heavy DOM-building helpers (`wrapSticker`, `Row`, `ButtonMenuToggle`, `putPreloader`) still return DOM nodes imperatively — but the **resulting node array goes into a signal**, which JSX renders. Do not `append(...)` to a ref.

```tsx
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createSignal, JSX, onCleanup, onMount, Show, untrack, useContext} from 'solid-js';
import MyShow from '@helpers/solid/myShow';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import Scrollable from '@components/scrollable2';
import ListenerSetter from '@helpers/listenerSetter';
import {putPreloader} from '@components/putPreloader';
// ... all other imports copied over, minus the old PopupElement from '.' ...

export type XxxPopupHandle = {hide: () => void};

const activePopups = new Set<XxxPopupHandle>();
export function hideAllXxxPopups() {
  for(const h of activePopups) h.hide();
}

const TEST_LOADING_DELAY = 0; // bump >0 to manually preview the loading UI during dev

export default function showXxxPopup(/* same params as ctor */): XxxPopupHandle {
  const [show, setShow] = createSignal(true);
  const handle: XxxPopupHandle = {hide: () => setShow(false)};
  activePopups.add(handle);

  // closure state the old class kept as fields (for values outside the reactive render)
  let someState: SomeType;
  let containerEl!: HTMLDivElement; // popup-container, set via containerProps ref

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    let scrollableEl!: HTMLDivElement;

    // EVERY value the JSX renders is a signal — title, footer button state, scrollable content, menu button, loaded flag
    const [titleContent, setTitleContent] = createSignal<JSX.Element>(i18n('Loading'));
    const [menuEl, setMenuEl] = createSignal<HTMLElement>();
    const [isLoaded, setIsLoaded] = createSignal(false);
    const [isAdd, setIsAdd] = createSignal(false);
    const [buttonText, setButtonText] = createSignal<JSX.Element>();
    const [contents, setContents] = createSignal<JSX.Element>();

    onCleanup(() => {
      listenerSetter.removeAll();
      activePopups.delete(handle);
      // anything the old 'close' listener did
    });

    subscribeOn(rootScope)('some_event', handler);

    onMount(() => {
      // imperative setup that needs refs (mainly raw addEventListener with {capture: true})
      containerEl.addEventListener('click', onContainerClick, {capture: true});
      middleware.onDestroy(() => containerEl.removeEventListener('click', onContainerClick, {capture: true}));

      loadAsync();
    });

    async function loadAsync() {
      const nodes = await buildNodesImperatively(); // wrapSticker, Row, etc.
      if(!middleware()) return;

      // batch signal updates into one render — and give yourself a TEST_LOADING_DELAY knob
      const onReady = () => {
        setTitleContent(/* … */);
        setMenuEl(ButtonMenuToggle({listenerSetter, buttons, direction: 'bottom-left'}));
        setContents(nodes);
        setButtonText(/* … */);
        setIsAdd(/* … */);
        setIsLoaded(true);
      };
      setTimeout(onReady, TEST_LOADING_DELAY);
    }

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{titleContent()}</PopupElement.Title>
          {menuEl()}
        </PopupElement.Header>
        <PopupElement.Body>
          <Scrollable ref={scrollableEl} class={!isLoaded() && 'is-loading'}>
            <Show when={isLoaded()} fallback={putPreloader(undefined, true)}>
              {contents()}
            </Show>
          </Scrollable>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            noRipple
            color={isLoaded() ? (isAdd() ? 'primary' : 'danger') : 'secondary'}
            disabled={!isLoaded()}
            callback={async() => {
              await managers.someManager.doThing(); // throw → re-enable; resolve → popup closes
            }}
          >
            <MyShow when={isLoaded()} fallback={i18n('Loading')}>
              {buttonText()}
            </MyShow>
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-xxx"
      closable
      body
      footer
      title={true}
      show={show()}
      containerProps={{ref: (el) => containerEl = el}}
      onCloseAfterTimeout={() => {/* deferred cbs */}}
    >
      <Inner />
    </PopupElement>
  ));

  return handle;
}
```

## Critical rules — get these wrong and the refactor breaks

1. **Use the `PopupElement.*` helpers, not hand-rolled divs:**
   - `<PopupElement.Title>{titleContent()}</PopupElement.Title>` — renders `<div class="popup-title" dir="auto">` and hides when empty via `<Show>`. Don't write your own `<div class="popup-title">`.
   - `<PopupElement.Body><Scrollable ref={scrollableEl} class={…}>{content()}</Scrollable></PopupElement.Body>` using `Scrollable` from [@components/scrollable2](src/components/scrollable2.tsx). Don't write `<div class="scrollable scrollable-y">` — that bypasses the custom scrollbar thumb.
   - `<PopupElement.FooterButton color={…} callback={…} disabled={…}>` — has a `color` prop (`'primary' | 'secondary' | 'danger'`) that maps to theme classes. Don't reach for `PopupElement.Button noDefaultClass class="btn-primary …"` with raw className strings.
   - `<PopupElement.Header>` + `<PopupElement.CloseButton />` + `<PopupElement.Footer>` for the shell.

2. **Signals all the way down — don't append to refs.** Every DOM mutation the old class did on `this.title`, `this.button`, `this.appendTo`, `this.footer` must become a **signal bound in JSX**:

   | Old imperative | New reactive |
   |---|---|
   | `replaceContent(this.title, node)` | `setTitleContent(node)` → `<PopupElement.Title>{titleContent()}</PopupElement.Title>` |
   | `this.button.className = isAdd ? 'a' : 'b'` | `color={isAdd() ? 'primary' : 'danger'}` on `FooterButton` |
   | `replaceContent(this.button, text)` | `setButtonText(text)` → `<FooterButton>{buttonText()}</FooterButton>` |
   | `this.title.after(btnMenu)` | `setMenuEl(btnMenu)` → `<PopupElement.Header>…{menuEl()}</PopupElement.Header>` |
   | `this.appendTo.append(...nodes)` | `setContents(nodes)` → `<Scrollable>{contents()}</Scrollable>` |
   | `scrollableEl.classList.add('is-loading')` | `class={!isLoaded() && 'is-loading'}` |

   The DOM nodes themselves (from `wrapSticker`, `Row`, `ButtonMenuToggle`) are still built imperatively — but the result lives in a signal, which JSX renders.

3. **One button, reactive state — don't swap elements for loading.** Use a single `PopupElement.FooterButton` with reactive `color`/`disabled`/children:
   ```tsx
   <PopupElement.FooterButton
     color={isLoaded() ? (isAdd() ? 'primary' : 'danger') : 'secondary'}
     disabled={!isLoaded()}
     callback={…}
   >
     <MyShow when={isLoaded()} fallback={i18n('Loading')}>{buttonText()}</MyShow>
   </PopupElement.FooterButton>
   ```
   Don't wrap in `<Show when={isLoaded()} fallback={<LoadingBtn />}><PopupElement.Button …/></Show>` — that's two button elements.

4. **`MyShow` vs `Show`:**
   - [@helpers/solid/myShow](src/helpers/solid/myShow.tsx) — drop-in replacement ~55× faster than `solid-js` `Show`. Use for lightweight content swaps (text, single node) where remount semantics don't matter.
   - `Show` from `solid-js` — use when you need proper remount (e.g. swapping a preloader for content; unmounting child effects).

5. **Preloader in JSX slot:** `putPreloader(undefined, true)` returns a detached preloader div — perfect for `<Show fallback={putPreloader(undefined, true)}>…</Show>`.

6. **Batch signal updates with `setTimeout(onReady, TEST_LOADING_DELAY)`:** when multiple signals change together at the end of an async load, collect them into one callback and fire with a `TEST_LOADING_DELAY` (default 0, bump up to visually verify loading state during dev).

7. **`useContext(PopupContext)` must run inside `<Inner />`**, rendered as a child of `<PopupElement>`. Outside the Provider, it returns `undefined`.

8. **No `display: contents` wrapper, no `wrapperEl`**. Return a JSX fragment (`<>…</>`) with `PopupElement.Header` / `.Body` / `.Footer` as direct siblings so they become flex children of `.popup-container`. For listening on `.popup-container` itself (e.g. the old `this.container.addEventListener` with `{capture: true}`), pass a ref through **`containerProps`** on `<PopupElement>`:
   ```tsx
   containerProps={{ref: (el) => containerEl = el}}
   ```
   The outer `containerEl` variable is populated before `Inner`'s `onMount` runs, so `onMount` can safely attach capture listeners on it.

9. **`PopupElement.FooterButton` callback:** return `Promise<void>` — wrap non-void manager calls:
   ```tsx
   callback={async() => { await managers.foo.doThing(args); }}
   ```
   Don't pre-catch — the helper already traps rejections internally (logs + re-enables). On resolve, it auto-closes via `context.hide()`.

10. **Listener cleanup:**
    - `attachClickEvent(el, cb, {listenerSetter})` — shared `ListenerSetter` flushed in `onCleanup`.
    - `subscribeOn(target)('event', cb)` — Solid-aware, auto-cleans.
    - `middleware.onClean(destroy)` / `middleware.onDestroy(cb)` — for helpers returning a `destroy` function.
    - Raw `addEventListener` (only for `{capture: true}`, since Solid's `onClick` is bubble-phase) + paired `middleware.onDestroy(() => removeEventListener(...))`.

11. **Replace `PopupElement.getPopups(PopupXxx)`** with an exported `hideAllXxxPopups()` helper backed by a module-level `Set<Handle>` added on call and deleted in `onCleanup`. Update the caller (usually [src/components/chat/input.ts](src/components/chat/input.ts)).

12. **Closure-scoped `let` vs signals.** Fields the class mutated later in async code (`this.sets = ...`, `this.isEmojis ??= ...`) become `let` variables in the closure shared between `Inner` and the outer function — only if they're **not read by JSX**. Values JSX reads must be signals.

13. **`show` defaults to `true`**. `<PopupElement show={show()}>` with initial `true` triggers the show effect via `doubleRaf()` once; `setShow(false)` later triggers hide. Don't re-show after hide — the popup is disposed after the 250 ms close animation.

14. **`onMount` runs after refs are populated** — including `containerEl` from `containerProps.ref`. All ref-dependent code goes inside `onMount`.

15. **Deferred `closeAfterTimeout` callbacks:** if the old class did `this.addEventListener('closeAfterTimeout', cb); this.hide()` multiple times, collect them in `deferredCloseCallbacks: (() => void)[]` and drain in `onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((cb) => cb())}`.

## Caller migration patterns

| Old | New |
|---|---|
| `PopupElement.createPopup(PopupXxx, a, b).show()` | `showXxxPopup(a, b)` |
| `const p = PopupElement.createPopup(PopupXxx, a); p.show(); return p;` | `return showXxxPopup(a);` |
| `PopupElement.getPopups(PopupXxx).forEach((p) => p.hide())` | `hideAllXxxPopups()` |
| `import PopupXxx from '@components/popups/xxx'` | `import showXxxPopup from '@components/popups/xxx'` (or `{hideAllXxxPopups}`) |

After removing the last use of `PopupElement` in a file, delete its import.

## Verification checklist before declaring done

- [ ] Old file deleted, new `.tsx` written.
- [ ] `grep -rn "Popup<Xxx>" src/` returns zero matches.
- [ ] `npx tsc --noEmit` clean.
- [ ] `pnpm lint` clean **and** `npx eslint "src/**/**.tsx"` clean (lint script only globs `.ts`).
- [ ] Uses `PopupElement.Title`, `PopupElement.Body` + `Scrollable` from `scrollable2`, `PopupElement.Footer`, `PopupElement.FooterButton` (with `color`) — **no hand-rolled `<div class="popup-title">` / `<div class="scrollable scrollable-y">` / `<div class="popup-footer">`**.
- [ ] No `display: contents` wrapper. `.popup-container` clicks go through `containerProps={{ref: …}}`.
- [ ] Every imperative DOM mutation from the old class is now a signal bound in JSX (title, menu button, containers, button text/color/disabled).
- [ ] One `PopupElement.FooterButton` with reactive `color`/`disabled` instead of a `<Show>` swap of two button elements.
- [ ] `MyShow` used for lightweight content swaps; `Show` from `solid-js` only when remount is needed.
- [ ] Signal updates at end of async load batched via `setTimeout(onReady, TEST_LOADING_DELAY)` with a module-level `TEST_LOADING_DELAY = 0` constant.
- [ ] `FooterButton` callback wraps manager calls so it returns `Promise<void>` (`async() => { await … }`).
- [ ] All async loads gate on `middleware()` after every `await`.
- [ ] UI smoke: can't verify from code alone — state this explicitly rather than claiming visual parity.

## Starting point

If `$ARGUMENTS` contains a path or popup name, refactor that one. Otherwise ask: "Which popup file under `src/components/popups/` should I refactor?"
