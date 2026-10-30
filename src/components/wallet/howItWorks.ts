/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createComponent, createSignal} from 'solid-js';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import showFeatureDetailsPopup from '@components/popups/featureDetails';
import type {FeatureRow} from '@components/featureRows';
import type {MediaHeaderStickerProps} from '@components/mediaHeader';
import {formatFiat, NANOS_PER_GRAM} from '@components/wallet/format';
import {readCurrency} from '@components/wallet/store';

/** free transfers a day when the app config does not say */
export const WALLET_GASLESS_DAILY_DEFAULT = 5;
/** the live gem over an info sheet (iOS: the 3D diamond of PremiumDiamondComponent) */
const GEM_SIZE = 130;
const GEM_WIDTH = 78;

/**
 * What the wallet is about, in the app's feature rows: in "How It Works" and on an empty wallet (tdesktop's
 * instant / fees / chain list)
 */
export function walletAboutRows(gaslessDaily = WALLET_GASLESS_DAILY_DEFAULT): FeatureRow[] {
  return [{
    icon: 'send_filled',
    title: i18n('Wallet.About.InstantTitle'),
    subtitle: i18n('Wallet.About.InstantText')
  }, {
    icon: 'gram_filled',
    title: i18n('Wallet.About.FeesTitle'),
    subtitle: i18n('Wallet.About.FeesText', [gaslessDaily])
  }, {
    icon: 'lock_filled',
    title: i18n('Wallet.About.ChainTitle'),
    subtitle: i18n('Wallet.About.ChainText')
  }];
}

/**
 * The header of the wallet's info sheets: the live gem, a click spins it. Its code comes with the first sheet.
 */
export async function loadWalletGemSticker(): Promise<Omit<MediaHeaderStickerProps, 'onReady'>> {
  const {default: WalletGem} = await import('@components/wallet/gem');
  return {
    size: GEM_SIZE,
    element: () => createComponent(WalletGem, {size: GEM_SIZE, widthPoints: GEM_WIDTH, visible: () => true, burst: true})
  };
}

/**
 * `$2.12`: one Gram in the wallet's currency, once the rates know it
 */
export function createGramRate() {
  const [rate, setRate] = createSignal<string>();
  const currency = readCurrency();
  rootScope.managers.appWalletManager.getRates().then((rates) => {
    const fiatPerGram = rates?.rates[currency];
    if(fiatPerGram) {
      setRate(formatFiat(NANOS_PER_GRAM, fiatPerGram, currency));
    }
  }, () => {});

  return rate;
}

/**
 * "How It Works" — what the wallet is, from "What is Wallet?" in its menus (tdesktop: WalletHowItWorksBox), with
 * the Terms under it (iOS)
 */
export default async function showWalletHowItWorksPopup() {
  const [appConfig, sticker] = await Promise.all([apiManagerProxy.getAppConfig(), loadWalletGemSticker()]);
  showFeatureDetailsPopup({
    sticker,
    title: i18n('Wallet.How.Title'),
    subtitle: i18n('Wallet.How.Subtitle'),
    rows: walletAboutRows(appConfig.wallet_gasless_daily_transfers),
    caption: {subtitle: i18n('Wallet.Terms')},
    buttons: [{text: i18n('Wallet.GotIt')}]
  });
}

/**
 * "Gram" — what the currency is and what one is worth now, from "What is Gram?" of a transfer (iOS: WalletInfoScreen
 * in its .gram mode)
 */
export async function showWalletGramInfoPopup() {
  const sticker = await loadWalletGemSticker();
  const rate = createGramRate();
  showFeatureDetailsPopup({
    sticker,
    title: i18n('Wallet.Gram.Title'),
    get subtitle() {
      const value = rate();
      return value ? i18n('Wallet.Gram.RateText', [value]) : i18n('Wallet.Gram.Text');
    },
    rows: [{
      icon: 'premium_speed_filled',
      title: i18n('Wallet.Gram.FastTitle'),
      subtitle: i18n('Wallet.Gram.FastText')
    }, {
      icon: 'tag_alt_filled',
      title: i18n('Wallet.Gram.CheapTitle'),
      subtitle: i18n('Wallet.Gram.CheapText')
    }, {
      icon: 'apps',
      title: i18n('Wallet.Gram.UsefulTitle'),
      subtitle: i18n('Wallet.Gram.UsefulText')
    }],
    buttons: [{text: i18n('Wallet.GotIt')}]
  });
}
