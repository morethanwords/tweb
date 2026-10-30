/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '@lib/rootScope';
import {i18n, LangPackKey} from '@lib/langPack';
import Icon from '@components/icon';
import showFeatureDetailsPopup from '@components/popups/featureDetails';
import {createGramRate, loadWalletGemSticker} from '@components/wallet/howItWorks';
import {WALLET_FIRST_GRAMS_SUGGESTION} from '@lib/wallet/transferMessages';

/**
 * An icon in a sentence that pictures a control ("click 📎"): a screen reader hears the control's name instead
 */
function controlIcon(icon: Icon, name: LangPackKey) {
  const span = document.createElement('span');
  const label = i18n(name);
  label.classList.add('sr-only');
  span.append(Icon(icon, 'inline-icon'), label);
  return span;
}

/**
 * "Your first Grams!" — what Grams are good for, shown once after the first incoming transfer (tdesktop:
 * WalletFirstGramsBox). Closing it in any way dismisses the suggestion that asked for it. Resolves once it closed.
 */
export async function showWalletFirstGramsPopup(sticker?: Awaited<ReturnType<typeof loadWalletGemSticker>>) {
  sticker ??= await loadWalletGemSticker();
  // * the value of one Gram in the wallet's currency, when the rates know it
  const rate = createGramRate();

  return new Promise<void>((resolve) => {
    showFeatureDetailsPopup({
      sticker,
      title: i18n('Wallet.First.Title'),
      get subtitle() {
        const value = rate();
        return value ? i18n('Wallet.First.Rate', [value]) : i18n('Wallet.First.RateNone');
      },
      rows: [{
        icon: 'send2',
        title: i18n('Wallet.First.SendTitle'),
        subtitle: i18n('Wallet.First.SendText', [controlIcon('attach', 'Chat.Input.Attach'), i18n('Wallet.Menu')])
      }, {
        icon: 'dollar_circle',
        title: i18n('Wallet.First.TradeTitle'),
        subtitle: i18n('Wallet.First.TradeText')
      }, {
        icon: 'wallet',
        title: i18n('Wallet.First.StoreTitle'),
        subtitle: i18n('Wallet.First.StoreText', [controlIcon('menu', 'MultiAccount.More'), i18n('Wallet.Menu')])
      }],
      buttons: [{text: i18n('Wallet.GotIt')}],
      onClose: () => {
        rootScope.managers.appPromoManager.dismissSuggestion(WALLET_FIRST_GRAMS_SUGGESTION);
        resolve();
      }
    });
  });
}

/**
 * Shows "Your first Grams!" while the server still suggests it. Resolves with whether it was shown, after it
 * closed — whatever the caller opens next (the transfer a chat card was clicked for) comes after it, as in tdesktop.
 * `stillWanted` is asked once the server answered: what it was to go over may have closed meanwhile (iOS).
 */
export async function showWalletFirstGramsIfPending(stillWanted?: () => boolean): Promise<boolean> {
  const pending = await rootScope.managers.appPromoManager.hasPendingSuggestion(WALLET_FIRST_GRAMS_SUGGESTION).catch(() => false);
  if(!pending) {
    return false;
  }

  // * asked once everything it needs is in: what it goes over may close while the sticker loads too
  const sticker = await loadWalletGemSticker();
  if(stillWanted && !stillWanted()) {
    return false;
  }

  await showWalletFirstGramsPopup(sticker);
  return true;
}
