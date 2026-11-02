/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MTAppConfig} from '@/appConfig';
import {IS_BETA, IS_POPUP_SANDBOX, IS_PREVIEW} from '@config/debug';

/**
 * The wallet is not released yet: until this is true nothing leads into it — no menu item, Settings row or search
 * result, no Send Money, no wallet or TON Connect link, no TON address menu, no transfer's details. Not a setting:
 * it is flipped here, at the release. The popup sandbox, which only dev and preview builds have, shows it regardless.
 */
export const WALLET_RELEASED = false;

let onFixtures = false;

/**
 * The popup sandbox opened over the app shows the wallet's stories while its fixture managers stand in for the real
 * ones (popupSandbox/environment): nothing there reaches the server. Dev and preview builds only
 */
export function setWalletOnFixtures(value: boolean) {
  onFixtures = value && (IS_BETA || IS_PREVIEW);
}

export function isWalletReleased() {
  return WALLET_RELEASED || IS_POPUP_SANDBOX || onFixtures;
}

/** Whether the wallet shows: released, and not switched off for the account by the server (iOS, Android) */
export function isWalletAvailable(appConfig: Pick<MTAppConfig, 'wallet_available'>) {
  return isWalletReleased() && appConfig.wallet_available !== false;
}
