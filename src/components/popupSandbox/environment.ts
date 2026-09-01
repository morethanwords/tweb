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
import PopupElement from '@components/popups';
import PopupElementTsx from '@components/popups/indexTsx';
import I18n from '@lib/langPack';
import themeController from '@helpers/themeController';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import lottieLoader from '@lib/lottie/lottieLoader';
import appDownloadManager from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import {createLiveManagers, LiveManagersController} from './liveManagers';
import type {AppManagers} from '@lib/managers';
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

const isKnownTheme = (name: string): name is AppTheme['name'] =>
  name === 'system' || SETTINGS_INIT.themes.some((theme) => theme.name === name);

export function setSandboxTheme(name: AppTheme['name']) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch{}

  return themeController.switchTheme(name);
}

function restoreSandboxTheme() {
  let stored: string;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch{}

  // Silent: applied before the theme controller reads it, and there is nowhere to persist it to.
  if(stored && isKnownTheme(stored)) setAppSettingsSilent('theme', stored);
}

/** The real managers of the session the sandbox opened on top of; undefined when standalone. */
let realManagers: AppManagers;
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
function useManagers(managers: AppManagers) {
  const previous = {
    root: rootScope.managers,
    popup: PopupElement.MANAGERS,
    popupTsx: PopupElementTsx.MANAGERS
  };

  rootScope.managers = PopupElement.MANAGERS = PopupElementTsx.MANAGERS = managers;

  return () => {
    rootScope.managers = previous.root;
    PopupElement.MANAGERS = previous.popup;
    PopupElementTsx.MANAGERS = previous.popupTsx;
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
      const langPack = await I18n.getCacheLangPackAndApply();
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = langPack.lang_code;

      restoreSandboxTheme();
      // Applies the theme too (it runs its dark-mode check immediately).
      themeController.setThemeListener();
    }

    return restoreManagers;
  })();
}
