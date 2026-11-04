/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MTAppConfig} from '@/appConfig';
import {IS_BETA, IS_PREVIEW} from '@config/debug';

/**
 * The wallet is not released yet: until this is true nothing leads into it — no menu item, Settings row or search
 * result, no Send Money, no wallet or TON Connect link, no TON address menu, no transfer's details. Not a setting:
 * it is flipped here, at the release. Dev and preview builds show it regardless, with the account's own wallet, and
 * so does the popup sandbox, which only they have.
 */
export const WALLET_RELEASED = false;

export function isWalletReleased() {
  return WALLET_RELEASED || IS_BETA || IS_PREVIEW;
}

/** Whether the wallet shows: released, and not switched off for the account by the server (iOS, Android) */
export function isWalletAvailable(appConfig: Pick<MTAppConfig, 'wallet_available'>) {
  return isWalletReleased() && appConfig.wallet_available !== false;
}
