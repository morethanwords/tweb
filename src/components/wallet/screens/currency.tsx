/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Row from '@components/rowTsx';
import {IconTsx} from '@components/iconTsx';
import type AppSelectPeers from '@components/appSelectPeers';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import Currencies from '@config/currencies';
import SearchIndex from '@lib/searchIndex';
import I18n from '@lib/langPack';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import WalletPicker, {WalletPickerOptions} from '@components/wallet/picker';
import rootScope from '@lib/rootScope';
import {getWalletCurrencyHints, sortWalletCurrencies} from '@components/wallet/currencyOrder';
import {generateDelimiter} from '@components/generateDelimiter';
import apiManagerProxy from '@lib/apiManagerProxy';
import type {WalletRates} from '@appManagers/appWalletManager';
import styles from '@components/wallet/wallet.module.scss';

/** a currency's name in the app's language, where the browser knows it; the list's own English one otherwise */
function currencyName(code: string, names: Intl.DisplayNames) {
  try {
    const name = names?.of(code);
    if(name && name.toUpperCase() !== code) return name;
  } catch(err) {}
  return Currencies[code].title;
}

/**
 * The currency the wallet counts its Grams in — the app's picker over the currencies the rates know, in iOS's
 * order, named in the app's language
 */
export default function WalletCurrencyScreen() {
  const wallet = useWallet();
  const store = wallet.store;

  let names: Intl.DisplayNames;
  try {
    names = new Intl.DisplayNames([I18n.getLastAppliedLangCode() || 'en', 'en'], {type: 'currency'});
  } catch(err) {}

  let selector: AppSelectPeers;
  const options = Promise.all([
    rootScope.managers.appWalletManager.getRates().catch((): WalletRates => undefined),
    Promise.resolve(apiManagerProxy.getAppConfig()).catch((): MTAppConfig => undefined)
  ]).then(([rates, appConfig]): WalletPickerOptions => {
    const available = Object.keys(rates?.rates || {USD: 1}).filter((code) => Currencies[code]);
    const hints = getWalletCurrencyHints(available, store.currency(), undefined, appConfig?.phone_country_iso2);
    const codes = sortWalletCurrencies(available, store.currency(), undefined, appConfig?.phone_country_iso2);
    const index = new SearchIndex<string>({ignoreCase: true});
    codes.forEach((code) => index.indexObjectArray(code, [code, Currencies[code].title, currencyName(code, names)]));
    let query = '';

    return {
      peerType: ['custom'],
      getMoreCustom: async(q) => {
        query = q;
        return {result: (q ? [...index.search(q)] : codes) as any[], isEnd: true};
      },
      renderResultsFunc: (keys) => {
        const middleware = selector.middlewareHelperLoader.get();
        (keys as any[] as string[]).forEach((code, i) => {
          // * the hints stand apart from the rest (Android: a gap after them); a search lists one run
          if(!query && i && i === hints.length) {
            const delimiter = generateDelimiter();
            delimiter.classList.add(styles.pickerDelimiter);
            delimiter.setAttribute('aria-hidden', 'true');
            selector.list.append(delimiter);
          }

          selector.list.append(wrapSolidComponent(() => (
            <Row ref={(element) => element.dataset.peerId = code} clickable>
              <Row.Title>{currencyName(code, names)}</Row.Title>
              <Row.Subtitle>{code} · {Currencies[code].symbol}</Row.Subtitle>
              <Row.RightContent>
                {store.currency() === code && <IconTsx icon="check" class="primary" />}
              </Row.RightContent>
            </Row>
          ), middleware));
        });
      },
      onSelect: (code) => {
        store.setCurrency(code as any as string);
        wallet.router.pop();
        return false;
      }
    };
  });

  return (
    <>
      <WalletHeader title="Wallet.Menu.Currency" back />
      <WalletPicker ref={(value) => selector = value} options={options} />
    </>
  );
}
