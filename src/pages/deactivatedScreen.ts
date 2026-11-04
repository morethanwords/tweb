import I18n, {i18n, LangPackKey} from '@lib/langPack';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import appNavigationController from '@components/appNavigationController';

export type DeactivatedScreen = {
  title: LangPackKey,
  subtitle: LangPackKey,
  onClick: () => void
};

/**
 * The screen over a tab the app cannot go on in as it is - another tab or app took over, a newer version runs
 * elsewhere, the app did not load: the page goes grey under a word on why, and a click anywhere does `onClick`
 */
export function showDeactivatedScreen({title, subtitle, onClick}: DeactivatedScreen) {
  document.body.classList.add('deactivated');

  const header = document.createElement('div');
  header.classList.add('header');
  header.append(i18n(title));

  const subtitleElement = document.createElement('div');
  subtitleElement.classList.add('subtitle');
  subtitleElement.append(i18n(subtitle));

  // the entry file is plain .ts, so the popup is composed by calling the component
  createPopup(() => PopupElement({
    class: 'popup-instance-deactivated',
    containerClass: 'instance-deactivated-container',
    closable: true,
    onClose: onClick,
    children: [header, subtitleElement]
  }));
}

// * in the tab's own storage, which a reload keeps: when the page last reloaded itself for a start that did not load
const START_RELOADED_AT_KEY = 'tweb_start_reloaded_at';
const START_RELOAD_INTERVAL = 5 * 60e3;
let startFailed = false;

/**
 * A part of the app that did not load at start - the network dropped, a release replaced the files the page asks
 * for - leaves the page blank, and a browser keeps the module that failed for as long as the page lives: the page
 * reloads by itself, once in a few minutes, and a start that fails again within them says so and reloads on a
 * click. Only the first failure of a page acts. Throws `err` on, for the start to stop there
 */
export function onStartImportFailed(err: unknown): never {
  if(!startFailed) {
    startFailed = true;
    console.error('the app did not load', err);
    // * the address as it is: a link the page was opened by has not been followed yet
    const reload = () => appNavigationController.reload(false);
    if(takeStartReload()) {
      reload();
    } else {
      // * a language pack kept from before these strings, which a start that does not load cannot refresh, has
      // * none of them: the screen says it then with strings every pack has had for years
      const pick = (key: LangPackKey, old: LangPackKey) => I18n.strings.has(key) ? key : old;
      showDeactivatedScreen({
        title: pick('Deactivated.LoadFailed.Title', 'ConnectionStatus.Waiting'),
        subtitle: pick('Deactivated.LoadFailed.Subtitle', 'BotWebViewReloadPage'),
        onClick: reload
      });
    }
  }

  throw err;
}

// * whether the page may reload by itself now, the time it does kept: a tab that keeps no time never does
function takeStartReload() {
  try {
    const now = Date.now();
    const reloadedAt = +window.sessionStorage.getItem(START_RELOADED_AT_KEY) || 0;
    // * a time ahead of the clock (set back since) counts as just now
    if(now - reloadedAt < START_RELOAD_INTERVAL) {
      return false;
    }

    window.sessionStorage.setItem(START_RELOADED_AT_KEY, '' + now);
    return true;
  } catch(err) {
    return false;
  }
}
