/*
 * Boots just enough of the app for a popup to render — and nothing that talks to Telegram.
 *
 * The real boot in `src/index.ts` wires the shared worker, restores the session, authorizes and only
 * then hands the UI a `managers` proxy. Here the same seams are filled locally: `bootstrapState`
 * installs the mock managers and the seeded stores, and the language pack is the one bundled in
 * `src/lang.ts`. The only thing left that touches the wire is the lottie worker pool, whose assets
 * are same-origin JSON served by the dev server.
 */

// First import on purpose: it seeds the stores before any app module that reads them on evaluation.
import {isLiveSession, mockManagers} from './bootstrapState';
import PopupElementTsx from '@components/popups/indexTsx';
import appNavigationController, {USE_NAVIGATION_API} from '@components/appNavigationController';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import I18n from '@lib/langPack';
import Modes from '@config/modes';
import themeController from '@helpers/themeController';
import {readStoredChoice, storeChoice} from '@helpers/storedChoice';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import lottieLoader from '@lib/lottie/lottieLoader';
import appDownloadManager from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import {createLiveManagers, LiveManagersController} from './liveManagers';
import type {AppManagers, TabManagers} from '@lib/managers';
import type {UpdatePayload} from 'vite';
import {setAppSettingsSilent} from '@stores/appSettings';
import {AppTheme, SETTINGS_INIT} from '@config/state';

export function getMockManagers() {
  return mockManagers;
}

/*
 * Theme.
 *
 * The mock managers swallow settings writes, so `switchTheme` alone would forget the choice on the
 * next reload — and the sandbox is reloaded constantly while iterating. Keep it in localStorage
 * instead, under a key of the sandbox's own.
 */
const THEME_STORAGE_KEY = 'popup-sandbox-theme';

export function setSandboxTheme(name: AppTheme['name']) {
  storeChoice(THEME_STORAGE_KEY, name);
  return themeController.switchTheme(name);
}

function restoreSandboxTheme() {
  const stored = readStoredChoice<AppTheme['name']>(THEME_STORAGE_KEY, ['system', ...SETTINGS_INIT.themes.map((theme) => theme.name)]);
  // Silent: applied before the theme controller reads it, and there is nowhere to persist it to.
  if(stored) setAppSettingsSilent('theme', stored);
}

/*
 * Direction. `?rtl=1` lays out any boot right to left; this is the panel's switch for the same,
 * kept like the theme so the reloads of an edit-and-look pass keep it.
 */
const DIRECTION_STORAGE_KEY = 'popup-sandbox-dir';

export type SandboxDirection = 'ltr' | 'rtl';

export function getSandboxDirection(): SandboxDirection {
  return I18n.getIsRTL() ? 'rtl' : 'ltr';
}

export function setSandboxDirection(dir: SandboxDirection) {
  storeChoice(DIRECTION_STORAGE_KEY, dir);
  I18n.forceRTL(dir === 'rtl');
}

function restoreSandboxDirection() {
  const stored = readStoredChoice<SandboxDirection>(DIRECTION_STORAGE_KEY, ['ltr', 'rtl']);
  // * `?rtl=1` wins over what was stored; the language's own direction does not, or a choice of LTR
  // * would not survive a reload over a right-to-left language
  if(stored) I18n.forceRTL(Modes.rtl || stored === 'rtl');
}

/** The real managers of the session the sandbox opened on top of; undefined when standalone. */
let realManagers: TabManagers;
let liveManagers: LiveManagersController;

export function getLiveManagers() {
  return liveManagers;
}

/**
 * Points the popup layer at `managers` and returns the undo.
 *
 * A live session keeps running behind the sandbox, so this is deliberately reversible: the previous
 * values are captured and put back on close. Popups already open keep whatever they were given —
 * they capture `managers` when they are constructed — which is what you want for a story on screen.
 */
function useManagers(managers: AppManagers & TabManagers) {
  const previous = {
    root: rootScope.managers,
    popup: PopupElementTsx.MANAGERS
  };

  rootScope.managers = PopupElementTsx.MANAGERS = managers;

  return () => {
    rootScope.managers = previous.root;
    PopupElementTsx.MANAGERS = previous.popup;
  };
}

export function useMockManagers() {
  return useManagers(mockManagers.managers);
}

/**
 * The session's own managers, with writes held back unless the panel says otherwise. Built once so
 * the recorded call list survives switching between stories.
 */
export function useLiveManagers(allowWrites: boolean) {
  liveManagers ??= createLiveManagers(realManagers);
  liveManagers.allowWrites = allowWrites;
  return useManagers(liveManagers.managers);
}

let installPromise: Promise<() => void>;

/**
 * Everything a story needs, installed once. Resolves to the undo for the manager swap — meaningful
 * only inside a live session; standalone there is nothing to go back to.
 */
export function installSandboxEnvironment() {
  return installPromise ??= (async() => {
    if(!isLiveSession) {
      // Storage reads block on this until the passcode screen resolves it; nothing locks a
      // standalone sandbox. A live session has resolved it long ago — and may have said `true`.
      DeferredIsUsingPasscode.resolveDeferred(false);

      // `appDialogsManager.start()` normally hands it the managers; anything that renders a sticker
      // or a thumbnail goes through it, and it throws on a null `managers` before it can fail
      // gracefully. In a live session it is constructed already, and doing it twice leaks a listener.
      appDownloadManager.construct(mockManagers.managers);
    }

    // Captured before anything is swapped — this is what a live story runs against.
    realManagers = rootScope.managers;
    const restoreManagers = useMockManagers();

    // Several popups reveal themselves only once their sticker header reports ready, and that runs
    // through the lottie worker pool. Idempotent, so it is fine to ask for it in either mode.
    lottieLoader.loadLottieWorkers().catch(() => {});

    // The popup modules sit inside a large import cycle, and evaluating it from a popup leaf leaves
    // the `PopupPeer` base class in its temporal dead zone — the leaf then throws on import. The app
    // never hits that because it always enters the cycle through `appDialogsManager` (the login flow
    // imports it on sign-in). Warm the graph the same way so a story's dynamic import lands in an
    // already-evaluated module. Importing it only constructs the idle singleton; nothing starts.
    await import('@lib/appDialogsManager');

    if(!isLiveSession) {
      // Lays the document out in the pack's direction too (`?rtl=1` forces right to left).
      await I18n.getCacheLangPackAndApply();
      restoreSandboxDirection();

      restoreSandboxTheme();
      // Applies the theme too (it runs its dark-mode check immediately).
      themeController.setThemeListener();
    }

    return restoreManagers;
  })();
}

/*
 * Reload on an edit.
 *
 * Vite hot-swaps the edited module in its own graph, but a story re-imports the popup by a URL the
 * browser has already cached, so `open()` keeps building the popup from the code you just changed
 * away from — silently. Popup modules also carry module-level state (kind symbols, the current-popup
 * registry) that a second copy would fork. So take the reload: the open story is in the hash and
 * comes straight back. The widget sandbox reloads the same way.
 *
 * CSS is left alone — Vite swaps stylesheets in place and that already works.
 *
 * Over a running app (`storiesOnly`) only for an edit a story module takes — the app's own edits stay hot. A story
 * accepts its own updates (so that a popup's edit stops there), and run again it would leave the panel's rows
 * holding the previous story and list one the edit removed.
 */
export function watchForEdits(storiesOnly?: boolean) {
  if(!import.meta.hot) {
    return;
  }

  const onUpdate = ({updates}: UpdatePayload) => {
    if(updates.some((update) => /\.[jt]sx?($|\?)/.test(update.path) && (!storiesOnly || update.path.includes('/popupSandbox/stories/')))) {
      location.reload();
    }
  };
  import.meta.hot.on('vite:afterUpdate', onUpdate);
  return () => import.meta.hot.off('vite:afterUpdate', onUpdate);
}

/*
 * The story in the hash.
 *
 * A standalone sandbox (`?popups=1`, `?widgets=1`) keeps the story it shows in the hash: the reload of an edit comes back
 * to it, and a hash that is typed switches stories — a same-document hash change never reloads the page.
 */

export function getSandboxHash() {
  return decodeURIComponent(location.hash.slice(1));
}

/**
 * The hash is the navigation controller's to keep, as the app's own hash is: a closed popup or toast takes its history
 * entry back, and that entry still holds the story it was opened in — the controller puts the current one back, which a
 * bare `replaceState` it does not know about would not get.
 */
export function setSandboxHash(id: string) {
  appNavigationController.overrideHash('#' + encodeURIComponent(id));
}

/**
 * Calls `open` with the story a typed hash names. A history step lands on whatever story its entry was made in: Back, and
 * the navigation controller taking back a closed popup's or toast's entry — which happens a moment after the next story
 * has opened, and would put the previous one back over it. Only a hash that is typed switches stories; the controller
 * restores the current one after its own steps (`setSandboxHash`). Where each pending step lands: other navigations (the
 * next popup's own entry) can come between a step and its `hashchange`. Returns what stops it.
 */
export function watchSandboxHash(open: (id: string) => void) {
  const traversals: string[] = [];
  const onNavigate = (event: NavigateEvent) => {
    // a step to the entry it is on already changes no hash: no `hashchange` comes for it
    if(event.navigationType !== 'traverse' || event.destination.url === location.href) return;
    const url = event.destination.url;
    traversals.push(url);
    // nor for one the controller cancels (a step forward), once every listener has had it
    queueMicrotask(() => {
      if(event.defaultPrevented) indexOfAndSplice(traversals, url);
    });
  };
  const onHashChange = (event: HashChangeEvent) => {
    const traversal = traversals.indexOf(event.newURL);
    if(traversal !== -1) {
      traversals.splice(0, traversal + 1);
      return;
    }

    open(getSandboxHash());
  };

  if(USE_NAVIGATION_API) navigation.addEventListener('navigate', onNavigate);
  window.addEventListener('hashchange', onHashChange);
  return () => {
    if(USE_NAVIGATION_API) navigation.removeEventListener('navigate', onNavigate);
    window.removeEventListener('hashchange', onHashChange);
  };
}
