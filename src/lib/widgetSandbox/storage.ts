import type {WidgetStorage, WidgetStorageArea} from 'widget-sandbox/host/widget-host';
import type {AppManagers} from '@lib/managers';
import type {WidgetValues as Values} from '@appManagers/appWidgetsManager';
import rootScope from '@lib/rootScope';
import bindManagersToAccount from '@lib/accounts/bindManagersToAccount';
import {getManagersSession} from '@lib/accounts/getCurrentAccount';
import {hotListen} from '@helpers/hotModule';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import mapDeleteWhere from '@helpers/mapDeleteWhere';
import {forgetWidgetHeights, getWidgetKey} from '@lib/widgetSandbox/sizing';

/**
 * A widget's Web Storage as the client keeps it (docs/sdk-v1.md §5.4): `local` on disk per message
 * (appWidgetsManager), written a moment after a commit and at once when the widget hides or stops or the
 * app goes to the background; `session` in this page's memory until it reloads. Both are preloaded when
 * the widget starts.
 */
export type WidgetStorageBinding = {
  load: () => Promise<WidgetStorage>,
  /** The new full content of an area, from `onStorageCommit`. */
  commit: (area: WidgetStorageArea, values: Record<string, string>) => void,
  /** Writes what is waiting now. */
  flush: () => void
};

/** How long a `local` commit waits for the next one before it goes to disk. */
const LOCAL_WRITE_DELAY = 1000;

/** `sessionStorage` of every widget this page ran, by account and message. */
const sessions = new Map<string, Values>();
/**
 * `localStorage` not on disk yet, by account and message: a bubble built again before the write (a re-render) starts
 * its widget from it.
 */
const unsaved = new Map<string, Values>();
/** What waits for its disk write. */
const pendingFlushes = new Set<() => void>();
/**
 * A widget of a message being sent: its message gets the server's id (`mid`, once known), and what it keeps goes under
 * it, written as its own writes are (`boundAt`)
 */
type SendingWidget = {managers: AppManagers, boundAt: number, mid?: number};
/** The widgets of messages being sent, by account and temporary id. */
const sending = new Map<string, SendingWidget>();
/**
 * When "Clear cache" ran, or a chat's history went, by the prefix of the keys it took, or a part of the history, by the
 * keys of its messages (widget_storage_delete): a binding made before keeps nothing more. The worker refuses its writes
 * too, but a bubble built again before its delayed write (its message still cached here) would start from what it put
 * here, and write that back. (A channel's history up to a message, or a message, takes what does not come back:
 * nothing is built again to start from it.)
 */
const clearedAt = new Map<string, number>();

const flushAll = () => [...pendingFlushes].forEach((flush) => flush());
hotListen(import.meta.hot, document, 'visibilitychange', () => document.hidden && flushAll());
hotListen(import.meta.hot, window, 'pagehide', flushAll);

/**
 * Writes `values` as the `local` area of the message, and forgets them as unsaved once there (unless newer came) — but
 * a message being sent's, which the bubble built again under the server's id starts from (widget_storage_remap below).
 */
function writeLocal(managers: AppManagers, peerId: PeerId, mid: number, key: string, values: Values, boundAt: number) {
  managers.appWidgetsManager.setWidgetStorage(peerId, mid, values, boundAt).finally(() => {
    if(Number.isInteger(mid) && unsaved.get(key) === values) unsaved.delete(key);
  });
}

// a widget message was sent: what its widget kept here under the temporary id goes under the server's (the bubble is
// built again under it, and its widget starts from there), on disk too; what reached the worker, it moves there itself.
// Heard of every account (the account's worker sends it ahead of message_sent, which a tab hears only of the account
// it shows): a tab that shows another one by then keeps it for the way back.
hotListen(import.meta.hot, rootScope, 'widget_storage_remap', ({accountNumber, peerId, tempId, mid}) => {
  const from = getWidgetKey(accountNumber, peerId, tempId);
  const to = getWidgetKey(accountNumber, peerId, mid);
  const widget = sending.get(from);
  if(!widget) return;
  sending.delete(from);
  widget.mid = mid;
  const session = sessions.get(from), local = unsaved.get(from);
  sessions.delete(from);
  unsaved.delete(from);
  if(session && !sessions.has(to)) sessions.set(to, session);
  if(local && !unsaved.has(to)) {
    unsaved.set(to, local);
    writeLocal(widget.managers, peerId, mid, to, local, widget.boundAt);
  }
});

// messages deleted, a chat's history gone (up to a message, or a part of it), or "Clear cache": their session areas,
// unsaved writes and heights go with them — told by the account's worker of every account, also one the tab does not
// show now, whose page memory would come back with it (the tab's history_delete is of the account it shows only)
hotListen(import.meta.hot, rootScope, 'widget_storage_delete', ({accountNumber, peerId, maxId, mids}) => {
  const prefix = peerId === undefined ? `${accountNumber}_` : `${accountNumber}_${peerId}_`;
  // messages (deleted, of a part of the history): of the chat, or by their ids, which private chats' and basic groups'
  // are the account's
  const taken = mids && new Set(mids);
  // a channel's history up to a message: the newer ones keep theirs, and so do the ones being sent (a temporary id,
  // rounded, falls within, the server's comes after)
  const upTo = (mid: number) => Number.isInteger(mid) && getServerMessageId(mid) <= maxId;
  const gone = (key: string) => {
    if(!key.startsWith(prefix)) return false;
    const mid = +key.slice(key.lastIndexOf('_') + 1);
    return taken ? taken.has(mid) : maxId === undefined || upTo(mid);
  };
  const now = Date.now();
  if(taken) {
    if(peerId !== undefined) taken.forEach((mid) => clearedAt.set(getWidgetKey(accountNumber, peerId, mid), now));
  } else if(maxId === undefined) {
    clearedAt.set(prefix, now);
  }

  mapDeleteWhere(unsaved, gone);
  mapDeleteWhere(sessions, gone);
  forgetWidgetHeights(gone);
});

/**
 * The storage of the widget in a message, of the account `chatManagers` are of. A write waits a moment and the last one
 * goes as the widget stops, so it goes to that account even after the tab has switched to another one. A message being
 * sent writes under its temporary id, which the account's worker keeps in memory and moves under the server's id with
 * the message.
 */
export function createMessageWidgetStorage(chatManagers: AppManagers, peerId: PeerId, mid: number): WidgetStorageBinding {
  const {accountNumber} = getManagersSession(chatManagers);
  const managers = bindManagersToAccount(chatManagers, accountNumber);
  // a write of a widget that ran before "Clear cache" would put back what it cleared (appWidgetsManager)
  const boundAt = Date.now();
  const widget: SendingWidget = Number.isInteger(mid) ? undefined : {managers, boundAt};
  if(widget) sending.set(getWidgetKey(accountNumber, peerId, mid), widget);
  /** The message's id now: the server's, once a message being sent has it. */
  const getMid = () => widget?.mid ?? mid;
  const getKey = () => getWidgetKey(accountNumber, peerId, getMid());
  /** Made before "Clear cache", before its chat's history went or a part of it with its message: what its widget holds is gone. */
  const isCleared = () => boundAt <= Math.max(
    clearedAt.get(`${accountNumber}_`) ?? 0,
    clearedAt.get(`${accountNumber}_${peerId}_`) ?? 0,
    clearedAt.get(getKey()) ?? 0
  );
  let pending: Values, timer: number;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    pendingFlushes.delete(flush);
    if(!pending) return;
    const values = pending;
    pending = undefined;
    // another widget of the message (a restart, a replacement) committed after it: that one writes, not this older one;
    // nor does what a deletion took
    if(unsaved.get(getKey()) !== values || isCleared()) return;
    writeLocal(managers, peerId, getMid(), getKey(), values, boundAt);
  };

  return {
    load: async() => {
      const stored = unsaved.has(getKey()) ? undefined : await managers.appWidgetsManager.getWidgetStorage(peerId, getMid());
      // what the widget before it in the bubble (a restart, a replacement) committed while the worker answered is newer
      const key = getKey();
      return {local: unsaved.get(key) ?? stored ?? {}, session: sessions.get(key) ?? {}};
    },
    commit: (area, values) => {
      if(isCleared()) return;
      if(area === 'session') {
        sessions.set(getKey(), values);
        return;
      }

      pending = values;
      unsaved.set(getKey(), values);
      pendingFlushes.add(flush);
      timer ??= window.setTimeout(flush, LOCAL_WRITE_DELAY);
    },
    flush
  };
}

const memoryLocal = new Map<string, Values>();

/** Storage that lives until the page reloads, for widgets outside a message (the widget sandbox). */
export function createMemoryWidgetStorage(key: string): WidgetStorageBinding {
  return {
    load: async() => ({local: memoryLocal.get(key) ?? {}, session: sessions.get(key) ?? {}}),
    commit: (area, values) => (area === 'session' ? sessions : memoryLocal).set(key, values),
    flush: () => {}
  };
}
