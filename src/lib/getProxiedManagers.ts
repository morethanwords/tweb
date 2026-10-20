import type createManagers from '@appManagers/createManagers';
import type {AckedResult} from '@lib/superMessagePort';
import {ModifyFunctionsToAsync} from '@types';
import apiManagerProxy from '@lib/apiManagerProxy';
import DEBUG, {MOUNT_CLASS_TO} from '@config/debug';
import {AccountSession, getAccountSession, getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';
import makeError from '@helpers/makeError';
import noop from '@helpers/noop';
import {registerAccountBinder} from '@lib/accounts/bindManagersToAccount';
import {hotListen} from '@helpers/hotModule';

// let stats: {
//   [manager: string]: {
//     [method: string]: {
//       times: number[],
//       byArgs: {
//         [args: string]: number[]
//       }
//     }
//   }
// } = {};

// let sentCount = 0;
// let sentMethods: {[key: string]: number} = {};
// let sentMethods2: {[key: string]: number} = {};
// function collectStats(manager: string, method: string, args: any[], promise: Promise<any>) {
//   ++sentCount;

//   const key = [manager, method].join('-');
//   if(!sentMethods[key]) sentMethods[key] = 0;
//   ++sentMethods[key];

//   const key2 = [('00000' + sentCount).slice(-5), key].join('-');

//   const byManager = stats[manager] ??= {};
//   const byMethod = byManager[method] ??= {times: [], byArgs: {}};

//   const perf = performance.now();
//   promise.catch(noop).finally(() => {
//     const time = performance.now() - perf;
//     byMethod.times.push(time);

//     sentMethods2[key2] = time;

//     try {
//       const argsString = JSON.stringify(args);
//       byMethod.byArgs[argsString].push(time);
//     } catch(err) {}
//   });
// }

// setInterval(() => {
//   console.log(
//     dT(),
//     '[PROXY] stats',
//     ...[
//       stats,
//       sentCount,
//       sentMethods,
//       sentMethods2
//     ].map(copy),
//     Object.entries(sentMethods).sort((a, b) => b[1] - a[1])
//   );
//   sentCount = 0;
//   stats = {};
//   sentMethods = {};
//   sentMethods2 = {};
// }, 2000);

const DEBUG_MANAGER_REQUESTS: {[managerName: string]: Set<string>} = {
  // appProfileManager: new Set(['getProfile', 'getProfileByPeerId'])
  // appPeersManager: new Set(['getPeer'])
  // appChatsManager: new Set(['getChat'])
  // appMessagesManager: new Set(['getMessageByPeer', 'getGroupsFirstMessage'])
};

function isProxyIntrospectionProperty(property: PropertyKey) {
  return typeof(property) === 'symbol' || property === 'then' || property === 'toJSON';
}

const DROPPED_RESULT = Symbol('droppedResult');

function makeDroppedError() {
  const error = makeError('MIDDLEWARE');
  (error as any)[DROPPED_RESULT] = true;
  return error;
}

// * a result that arrives after whoever asked for it is gone - the tab switched to another account, the
// * screen that asked was destroyed - has nowhere to land: reject it the way a dropped middleware does.
// * An error too: acted on (a retry, a form fetched again), it would carry the action on. The request
// * itself was sent all the same.
function dropIfGone<T>(promise: Promise<T>, isGone: () => boolean): Promise<T> {
  return promise.then((result) => {
    if(isGone()) {
      throw makeDroppedError();
    }

    return result;
  }, (err) => {
    throw isGone() ? makeDroppedError() : err;
  });
}

// * whatever was in flight then rejects for anyone still awaiting it, and a fire-and-forget call has
// * nobody: that is expected, not an error, so it stays out of the console
hotListen(import.meta.hot, window, 'unhandledrejection', (e: PromiseRejectionEvent) => {
  if(e.reason?.[DROPPED_RESULT]) {
    e.preventDefault();
  }
});

type ProxyOwner = {
  // * a getter follows the tab's current account: it is read at call time
  account: ActiveAccountNumber | (() => ActiveAccountNumber),
  // * for managers bound to an account: whether whoever holds them is still there - what comes back
  // * once they are gone is dropped
  isAlive?: () => boolean,
  // * and nothing more is sent through them then
  refuseWhenGone?: boolean
};

function createProxy(
  /* source: T,  */
  name: string,
  owner: ProxyOwner,
  ack?: boolean
) {
  const proxy = new Proxy({}, {
    get: (target, p, receiver) => {
      if(isProxyIntrospectionProperty(p)) return undefined;

      // console.log('get', target, p, receiver);
      // @ts-ignore
      // const value = source[p];
      // if(typeof(value) !== 'function') {
      //   return value;
      // }

      return (...args: any[]) => {
        const {account, isAlive} = owner;
        // * the tab's own managers: what they ask for belongs to the account session it is asked in
        const session = typeof(account) === 'function' && getAccountSession();
        const isGone = session ? () => session.ended : isAlive && (() => !isAlive());
        if(owner.refuseWhenGone && isGone()) {
          console.debug('[managers] not sent: its account session is over', `${name}.${p as string}`);
          return Promise.reject(makeDroppedError());
        }

        let promise = apiManagerProxy.invoke('manager', {
          name,
          method: p as string,
          args,
          accountNumber: session ? session.accountNumber : account as ActiveAccountNumber
        }, ack as any);

        if(DEBUG) {
          if(DEBUG_MANAGER_REQUESTS[name]?.has(p as any)) {
            console.warn('manager request', name, p, args, ack);
          }
        }

        // collectStats(name, p as string, args, promise);

        if(isGone && ack) {
          promise = promise.then((acked: AckedResult<any>) => {
            if(isGone()) {
              // * nobody takes what comes after the acknowledgement either: an error of it is not left unhandled
              Promise.resolve(acked.result).catch(noop);
              throw makeDroppedError();
            }

            return {...acked, result: dropIfGone(acked.result, isGone)};
          }, (err) => {
            throw isGone() ? makeDroppedError() : err;
          });
        } else if(isGone) {
          promise = dropIfGone(promise, isGone);
        }

        return promise;

        // @ts-ignore
        // return Promise.resolve(value.call(source, ...args));
      };
    }
  });

  return proxy;
}

type AcknowledgedManager<T> = {
  [key in keyof T]: T[key] extends (...args: infer A) => infer R ? (...args: A) => Promise<AckedResult<Awaited<R>>> : never
};

type AllManager<T> = {
  [key in keyof T]: T[key] extends (...args: infer A) => infer R ? (...args: A) => Promise<Array<Awaited<R>>> : never
};

type T = Awaited<ReturnType<typeof createManagers>>;
export type ProxiedManagers = {
  [name in keyof T]?: ModifyFunctionsToAsync<T[name]>;
};

export type AcknowledgedManagers = {
  [name in keyof T]?: AcknowledgedManager<T[name]>;
};

export type AllManagers = {
  [name in keyof T]?: AllManager<T[name]>;
};

type CombinedManagers = ProxiedManagers & {
  acknowledged?: AcknowledgedManagers,
  all?: AllManagers
};

declare const boundToAccount: unique symbol;
declare const followsTabAccount: unique symbol;

/** Managers tied to one account: an account session's (see bindManagersToSession), a chat's, a call's. */
export type BoundManagers = CombinedManagers & {readonly [boundToAccount]: true};

/**
 * The tab's own managers, which follow whichever account it shows: called at once, they reach the
 * account shown at that moment. Kept by what lives as long as the tab (the sidebars, the chat list);
 * anything else takes bound ones (bindManagersToSession).
 */
export type TabManagers = CombinedManagers & {readonly [followsTabAccount]: true};

function createProxyProxy(proxied: any, owner: ProxyOwner, ack?: boolean) {
  return new Proxy(proxied, {
    get: (target, p, receiver) => {
      if(isProxyIntrospectionProperty(p)) return undefined;

      // @ts-ignore
      return target[p] ??= createProxy(p as string, owner, ack);
    }
  });
}

function createCombinedManagers(owner: ProxyOwner): CombinedManagers {
  const managers: CombinedManagers = createProxyProxy({}, owner, false);
  managers.acknowledged = createProxyProxy({}, owner, true);
  managers.all = createProxyProxy({}, {...owner, account: undefined}, false);
  return managers;
}

/**
 * Managers bound to one account for good: for what belongs to that account whichever one the tab shows
 * (a call, a notification), or lives and dies with it (a chat) - whatever it still sends once the tab has
 * switched to another account, a delayed draft save, a read mark, reaches the account it was meant for.
 * With `isAlive`, what comes back once the UI is gone is dropped as after a switch.
 */
export function createProxiedManagersForAccount(accountNumber: ActiveAccountNumber, isAlive?: () => boolean) {
  return createCombinedManagers({account: accountNumber, isAlive}) as BoundManagers;
}

MOUNT_CLASS_TO.createProxiedManagersForAccount = createProxiedManagersForAccount;

const accountManagers: {[accountNumber in ActiveAccountNumber]?: BoundManagers} = {};

/** The managers of `accountNumber` for good, whichever account the tab shows. */
export function getAccountManagers(accountNumber: ActiveAccountNumber) {
  return accountManagers[accountNumber] ??= createProxiedManagersForAccount(accountNumber);
}

/**
 * The managers of `accountNumber` when the tab shows another account, whose mirrors know nothing of it;
 * nothing when it is the tab's own.
 */
export function getOtherAccountManagers(accountNumber: ActiveAccountNumber) {
  if(!accountNumber || accountNumber === getCurrentAccount()) {
    return;
  }

  return getAccountManagers(accountNumber);
}

// * one set per account session, made once something of it asks (see bindManagersToSession)
const sessionManagers: WeakMap<AccountSession, BoundManagers> = new WeakMap();

function getSessionManagers() {
  const session = getAccountSession();
  let managers = sessionManagers.get(session);
  if(!managers) {
    managers = createCombinedManagers({
      account: session.accountNumber,
      isAlive: () => !session.ended,
      refuseWhenGone: true
    }) as BoundManagers;
    const ownSession = managers;
    registerAccountBinder(managers, {bind: createProxiedManagersForAccount, session: () => ownSession, of: session});
    sessionManagers.set(session, managers);
  }

  return managers;
}

let proxied: TabManagers;
export default function getProxiedManagers() {
  if(!proxied) {
    proxied = createCombinedManagers({account: getCurrentAccount}) as TabManagers;
    registerAccountBinder(proxied, {bind: createProxiedManagersForAccount, session: getSessionManagers});
  }

  return proxied;
}
