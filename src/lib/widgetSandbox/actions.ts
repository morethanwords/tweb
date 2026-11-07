import type {WidgetAction} from 'widget-sandbox/host/widget-host';
import confirmOpenUrl from '@components/popups/confirmOpenUrl';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import lastItem from '@helpers/array/lastItem';

/**
 * What the client does with a widget's `onAction` (docs/sdk-v1.md §5.2, §5.3). The framework has already checked each
 * one: a link has passed the URL rules and came from a real tap on the visible widget, one per tap.
 * - `openLink`: a confirmation that shows the whole URL, then the browser;
 * - `openTelegramLink`: the app's own t.me handling, with its own confirmations;
 * - `haptic`: nothing to play on the web; `ready`: nothing to do.
 * One dialog at a time: what arrives while one is open is dropped.
 */

export type WidgetActionHandler = (action: WidgetAction) => void;

/** Who takes the widgets' actions instead of the client, the last one taken first. */
const interceptors: WidgetActionHandler[] = [];
let dialogOpen = false;

/**
 * Hands every widget's actions to `handler` instead of acting on them, until the returned undo: the widget sandbox lists
 * them. One over another (a sandbox over the page's own) takes them while it is there, and the one beneath again after.
 */
export function interceptWidgetActions(handler: WidgetActionHandler) {
  // its own entry, should the same handler be there twice
  const interceptor: WidgetActionHandler = (action) => handler(action);
  interceptors.push(interceptor);
  return () => {
    indexOfAndSplice(interceptors, interceptor);
  };
}

function openLink(url: string) {
  const anchor = setBlankToAnchor(document.createElement('a'));
  anchor.href = url;
  dialogOpen = true;
  confirmOpenUrl(anchor, () => dialogOpen = false);
}

function openTelegramLink(url: string) {
  hotReloadGuard.appImManager.openUrl(url);
}

export function handleWidgetAction(action: WidgetAction) {
  const interceptor = lastItem(interceptors);
  if(interceptor) return interceptor(action);
  switch(action.kind) {
    case 'openLink':
      if(!dialogOpen) openLink(action.url);
      break;
    case 'openTelegramLink':
      openTelegramLink(action.url);
      break;
  }
}
