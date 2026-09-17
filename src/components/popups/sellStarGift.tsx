import {createMemo, createSignal, JSX, onMount} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {MyStarGift} from '@appManagers/appGiftsManager';

import styles from '@components/popups/sellStarGift.module.scss';
import {i18n, LangPackKey} from '@lib/langPack';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {fastRaf} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n';
import {toastNew} from '@components/toast';
import {StarsAmount} from '@layer';
import paymentsWrapCurrencyAmount, {formatNanoton, nanotonToJsNumber, parseNanotonFromDecimal} from '@helpers/paymentsWrapCurrencyAmount';
import Section from '@components/section';
import {StarGiftPriceInputField} from '@components/stargifts/stargiftPriceInputField';
import bigInt from 'big-integer';
import rootScope from '@lib/rootScope';

export default async function showSellStarGiftPopup(options: {
  gift: MyStarGift,
  allowUnlist?: boolean,
  onFinish?: (result: 'list' | 'unlist' | 'cancel') => void
}) {
  const {gift, allowUnlist} = options;
  const managers = rootScope.managers;

  const [appConfig, floorPrice] = await Promise.all([
    managers.apiManager.getAppConfig(),
    managers.appGiftsManager.getFloorPrice(gift.raw.title)
  ]);

  const [show, setShow] = createSignal(true);
  // closing without listing answers "cancel", but the button answers for itself
  let finished = false;

  createPopup(() => {
    const [ton, setTon] = createSignal(gift.resellOnlyTon ?? false);
    const [sellAmount, setSellAmount] = createSignal('');

    if(gift.resellOnlyTon && gift.resellPriceTon) {
      setSellAmount(String(nanotonToJsNumber(gift.resellPriceTon)));
    } else if(gift.resellPriceStars) {
      setSellAmount(String(gift.resellPriceStars));
    } else if(floorPrice) {
      setSellAmount(String(bigInt.min(floorPrice, appConfig.stars_stargift_resale_amount_max)));
    }

    const [loading, setLoading] = createSignal(false);

    const inputError = createMemo<[LangPackKey, any[]] | undefined>(() => {
      const sellAmount$ = sellAmount();
      if(!sellAmount$) return undefined;

      if(ton()) {
        const nanoton = parseNanotonFromDecimal(sellAmount$);
        const min = appConfig.ton_stargift_resale_amount_min;
        const max = appConfig.ton_stargift_resale_amount_max;
        if(nanoton.lt(min)) {
          return ['StarGiftMinSellAmountTon', [formatNanoton(min)]];
        }

        if(nanoton.gt(max)) {
          return ['StarGiftMaxSellAmountTon', [formatNanoton(max)]];
        }

        return undefined;
      }

      const value = +sellAmount$;
      const min = appConfig.stars_stargift_resale_amount_min;
      const max = appConfig.stars_stargift_resale_amount_max;

      if(value < min) {
        return ['StarGiftMinSellAmountStars', [min]];
      }

      if(value > max) {
        return ['StarGiftMaxSellAmountStars', [max]];
      }

      return undefined;
    });

    const afterCommission = createMemo(() => {
      if(ton()) {
        const nanoton = parseNanotonFromDecimal(sellAmount());
        const commission = appConfig.ton_stargift_resale_commission_permille;
        const nanotonAfter = nanoton.multiply(commission).divide(1000).toString();
        return formatNanoton(nanotonAfter, 2);
      }

      const value = +sellAmount();
      const commission = appConfig.stars_stargift_resale_commission_permille;
      return Math.floor(value * (commission / 1000));
    });

    const percentage = () => (ton() ? appConfig.ton_stargift_resale_commission_permille : appConfig.stars_stargift_resale_commission_permille) / 10;
    // with nothing entered the button unlists, where that is on the table at all
    const isUnlisting = () => !sellAmount() && allowUnlist;

    let inputRef: HTMLElement;
    onMount(() => {
      fastRaf(() => {
        inputRef.focus();
      });
    });

    const onConfirm = () => {
      setLoading(true);
      const amount: StarsAmount | null = isUnlisting() ? null : (ton() ? {
        _: 'starsTonAmount',
        amount: parseNanotonFromDecimal(sellAmount()).toString()
      } : {
        _: 'starsAmount',
        amount: +sellAmount(),
        nanos: 0
      });

      managers.appGiftsManager.updateResalePrice(gift.input, amount).then(() => {
        finished = true;
        options.onFinish?.(amount === null ? 'unlist' : 'list');
        setShow(false);
      }).catch(() => {
        toastNew({langPackKey: 'Error.AnError'});
        setLoading(false);
      });
    };

    return (
      <PopupElement
        class={styles.popup}
        closable
        show={show()}
        onClose={() => !finished && options.onFinish?.('cancel')}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="StarGiftSellTitlePopup" />
        </PopupElement.Header>
        <PopupElement.Body>
          <Section
            caption={
              <I18nTsx
                key={
                  sellAmount() ?
                    ton() ? 'StarGiftYouWillReceiveTon' : 'StarGiftYouWillReceiveStars' :
                    'StarGiftYouWillReceivePercent'
                }
                args={sellAmount() ? [String(afterCommission()), String(percentage())] : String(percentage())}
              /> as Exclude<JSX.Element, string>
            }
          >
            <StarGiftPriceInputField
              label={ton() ? 'StarGiftSellTitleTon' : 'StarGiftSellTitleStars'}
              value={sellAmount()}
              onValueChange={setSellAmount}
              ton={ton()}
              errorLabel={inputError()?.[0]}
              errorLabelOptions={inputError()?.[1]}
              instanceRef={ref => { inputRef = ref.input }}
              disabled={loading()}
            />
          </Section>
          <Section caption="StarGiftOnlyAcceptTonInfo">
            <Row disabled={loading()}>
              <Row.CheckboxField>
                <CheckboxFieldTsx checked={ton()} disabled={loading()} onChange={setTon} />
              </Row.CheckboxField>
              <Row.Title>{i18n('StarGiftOnlyAcceptTon')}</Row.Title>
            </Row>
          </Section>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey={isUnlisting() ? 'StarGiftUnlistButton' : 'StarGiftSellButton'}
            disabled={!!inputError() || (!sellAmount() && !allowUnlist)}
            callback={() => {
              onConfirm();
              return false;
            }}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
