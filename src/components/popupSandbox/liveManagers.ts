/*
 * The live counterpart of `mockManagers`: real managers, real data, writes held back.
 *
 * Opened from a signed-in app, the sandbox is more useful pointed at the session's own data — a
 * popup rendered against a real chat, a real gift, a real balance says far more about a layout than
 * one built from `Sandbox Group`. The catch is that a real manager is also the thing that deletes
 * the messages and spends the stars, and a story is one click away from the confirm button.
 *
 * So calls are forwarded to the real managers, but only the ones that look like reads. Everything
 * else resolves to `undefined` and is recorded, so the panel can show what a confirm button would
 * have done. The check is a name heuristic and it fails CLOSED: a method nobody recognises is
 * treated as a write and blocked.
 */

import type {AppManagers} from '@lib/managers';
import type {ManagerCall} from './mockManagers';

/**
 * Prefixes that mark a read. Deliberately conservative — `read…` (`readHistory`) and `load…` are
 * absent because they write, and a blocked read only leaves a popup half-rendered, which the panel
 * shows, while a missed write is irreversible.
 */
const READ_PREFIXES = /^(get|is|has|can|should|search|resolve|find|check|count|list|wrap|format)/;

/**
 * Reads whose names do not start with one of the prefixes. Measured, not guessed: every manager call
 * the stories make was recorded and the reads among the non-matching ones are listed here.
 *
 * `apiFileManager.download*` is the important one — it is how every avatar, sticker and thumbnail is
 * fetched, so without it live mode renders a popup with no images at all, which is most of the
 * reason to run it live.
 */
const READ_METHODS = new Set([
  'apiFileManager.downloadMedia',
  'apiFileManager.downloadMediaURL',
  'appStickersManager.preloadAnimatedEmojiSticker',
  'appPeersManager.noForwards',
  'appTranslationsManager.translateText',
  'aiTonesManager.fetchExample',
  // Ref-counting for a history storage the popup is reading; drops no data.
  'appMessagesManager.toggleHistoryKeySubscription'
]);

export const isReadMethod = (manager: string, method: string) =>
  READ_PREFIXES.test(method) || READ_METHODS.has(`${manager}.${method}`);

export type LiveManagersController = {
  /** Drop-in for `rootScope.managers`, backed by the session's real ones. */
  managers: AppManagers,
  /** Every call the popups made, newest last. */
  calls: ManagerCall[],
  /** Writes that were held back — what the popup would have done for real. */
  blocked: ManagerCall[],
  /** Called for each held-back write, so the panel can list them as they happen. */
  onBlocked?: (call: ManagerCall) => void,
  /** While false, only reads reach the real managers. */
  allowWrites: boolean
};

export function createLiveManagers(real: AppManagers): LiveManagersController {
  const calls: ManagerCall[] = [];
  const blocked: ManagerCall[] = [];

  const createManagerProxy = (source: any, manager: string) => new Proxy({} as any, {
    get: (target, method) => target[method] ??= (...args: any[]) => {
      const allowed = controller.allowWrites || isReadMethod(manager, method as string);
      const call: ManagerCall = {manager, method: method as string, args, handled: allowed};
      calls.push(call);

      if(!allowed) {
        blocked.push(call);
        controller.onBlocked?.(call);
        return Promise.resolve(undefined);
      }

      return source[manager][method](...args);
    }
  });

  const createRootProxy = (source: any) => new Proxy({} as any, {
    get: (target, manager) => {
      // `acknowledged` and `all` are sibling proxies, not managers — guard them the same way.
      if(manager === 'acknowledged' || manager === 'all') {
        return target[manager] ??= createRootProxy(source[manager]);
      }

      return target[manager] ??= createManagerProxy(source, manager as string);
    }
  });

  const controller: LiveManagersController = {
    managers: createRootProxy(real) as AppManagers,
    calls,
    blocked,
    allowWrites: false
  };

  return controller;
}
