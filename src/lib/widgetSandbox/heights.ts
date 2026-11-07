import type {AppManagers} from '@lib/managers';
import bindManagersToAccount from '@lib/accounts/bindManagersToAccount';
import {getManagersSession} from '@lib/accounts/getCurrentAccount';
import {hotEffect} from '@helpers/hotModule';
import throttleWith from '@helpers/schedulers/throttleWith';
import {getStoredWidgetHeights, MAX_REMEMBERED_HEIGHTS, onWidgetHeightRemembered, restoreWidgetHeights} from '@lib/widgetSandbox/sizing';
// its listeners forget what goes with the messages, the heights read here included, before any widget has run
import '@lib/widgetSandbox/storage';

/**
 * The remembered widget heights (sizing.ts) on disk, per account (appWidgetsManager): read as the account's first chat
 * is made — before a chat opens and counts its first screen by them — and written a moment after they change. A
 * message's height goes with it, as its widget's storage does (storage.ts; the account's worker drops it from the disk
 * too, for a tab that shows another account).
 */

const SAVE_DELAY = 2000;

/** Each account's write of its heights, a moment after the first change. */
const saves = new Map<number, () => void>();

/** Reads the heights of the account `chatManagers` are of, once, and keeps them on its disk from then on. */
export function keepWidgetHeights(chatManagers: AppManagers) {
  const {accountNumber} = getManagersSession(chatManagers);
  if(saves.has(accountNumber)) return;
  const managers = bindManagersToAccount(chatManagers, accountNumber);
  saves.set(accountNumber, throttleWith(
    (write) => window.setTimeout(write, SAVE_DELAY),
    // when they were taken: one of a message a deletion took after it is not put back (appWidgetsManager)
    () => managers.appWidgetsManager.setWidgetHeights(getStoredWidgetHeights(accountNumber), MAX_REMEMBERED_HEIGHTS, Date.now())
  ));
  managers.appWidgetsManager.getWidgetHeights().then((stored) => {
    if(stored?.length) restoreWidgetHeights(accountNumber, stored);
  });
}

// a height remembered or forgotten
hotEffect(import.meta.hot, () => onWidgetHeightRemembered((key) => {
  if(key) saves.get(parseInt(key))?.();
}));
