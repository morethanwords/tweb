/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type createManagers from './createManagers';
import type {AckedResult} from '../mtproto/superMessagePort';
import {ModifyFunctionsToAsync} from '../../types';
import apiManagerProxy from '../mtproto/mtprotoworker';
import DEBUG, {MOUNT_CLASS_TO} from '../../config/debug';
import {getCurrentAccount} from '../accounts/getCurrentAccount';
import {ActiveAccountNumber} from '../accounts/types';

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

function createProxy(/* source: T,  */name: string, accountNumber: ActiveAccountNumber, ack?: boolean) {
  const proxy = new Proxy({}, {
    get: (target, p, receiver) => {
      // console.log('get', target, p, receiver);
      // @ts-ignore
      // const value = source[p];
      // if(typeof(value) !== 'function') {
      //   return value;
      // }

      return (...args: any[]) => {
        const promise = apiManagerProxy.invoke('manager', {
          name,
          method: p as string,
          args,
          accountNumber
        }, ack as any);

        if(DEBUG) {
          if(DEBUG_MANAGER_REQUESTS[name]?.has(p as any)) {
            console.warn('manager request', name, p, args, ack);
          }
        }

        // collectStats(name, p as string, args, promise);

        return promise;

        // @ts-ignore
        // return Promise.resolve(value.call(source, ...args));
      };
    }
  });

  return proxy;
}

type AA<T> = {
  [key in keyof T]: T[key] extends (...args: infer A) => infer R ? (...args: A) => Promise<AckedResult<Awaited<R>>> : never
};

type T = Awaited<ReturnType<typeof createManagers>>;
export type ProxiedManagers = {
  [name in keyof T]?: ModifyFunctionsToAsync<T[name]>;
};

type ProxiedAndAcknowledgedManagers = ProxiedManagers & {
  acknowledged?: {
    [name in keyof T]?: AA<T[name]>;
  }
};

function createProxyProxy(proxied: any, accountNumber: ActiveAccountNumber, ack?: boolean) {
  return new Proxy(proxied, {
    get: (target, p, receiver) => {
      // @ts-ignore
      return target[p] ??= createProxy(p as string, accountNumber, ack);
    }
  });
}

export function createProxiedManagersForAccount(accountNumber: ActiveAccountNumber): ProxiedManagers {
  return createProxyProxy({}, accountNumber);
}

MOUNT_CLASS_TO.createProxiedManagersForAccount = createProxiedManagersForAccount;

let proxied: ProxiedAndAcknowledgedManagers;
export default function getProxiedManagers() {
  if(proxied) {
    return proxied;
  }

  proxied = createProxyProxy({}, getCurrentAccount(), false);
  proxied.acknowledged = createProxyProxy({}, getCurrentAccount(), true);
  return proxied;
}
