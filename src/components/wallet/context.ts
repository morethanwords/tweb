/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createContext, useContext} from 'solid-js';
import type {WalletStore} from '@components/wallet/store';
import type {WalletRouter} from '@components/wallet/router';

export type WalletScreenName =
  | 'main'
  | 'collectible'
  | 'collectibleSend'
  | 'conflict'
  | 'receive'
  | 'amount'
  | 'confirm'
  | 'keys'
  | 'phrase'
  | 'quiz'
  | 'replace'
  | 'restore'
  | 'currency'
  | 'recipient'
  | 'apps';

export type WalletContextValue = {
  store: WalletStore,
  router: WalletRouter<WalletScreenName>,
  /** the window is open and on screen */
  shown: Accessor<boolean>,
  close: () => void
};

export const WalletContext = createContext<WalletContextValue>();

export function useWallet() {
  return useContext(WalletContext);
}
