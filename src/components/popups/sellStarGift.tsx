import {createEffect, createMemo, createSignal, JSX, on, onMount} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';

import styles from './sellStarGift.module.scss';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import I18n, {i18n, LangPackKey} from '../../lib/langPack';
import Row from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import {InputFieldTsx} from '../inputFieldTsx';
import InputField, {InputFieldOptions} from '../inputField';
import {fastRaf} from '../../helpers/schedulers';
import currencyStarIcon from '../currencyStarIcon';
import Icon from '../icon';
import {I18nTsx} from '../../helpers/solid/i18n';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {toastNew} from '../toast';
import {StarsAmount} from '../../layer';
import paymentsWrapCurrencyAmount, {formatNanoton, nanotonToJsNumber, parseNanotonFromDecimal} from '../../helpers/paymentsWrapCurrencyAmount';
import Section from '../section';

class SellPriceInputField extends InputField {
  private icon: HTMLElement;
  private approxLabel: HTMLElement;

  constructor(options: InputFieldOptions) {
    super(options);

    this.container.classList.add(styles.input)

    this.icon = document.createElement('div')
    this.icon.classList.add(styles.inputIcon)

    this.approxLabel = document.createElement('div')
    this.approxLabel.classList.add(styles.inputApproxLabel)

    this.container.append(this.icon, this.approxLabel)

    this.setIcon('stars')
    this.setApproxText('≈$0.00')
  }

  public setIcon(icon: 'ton' | 'stars') {
    if(icon === 'ton') {
      this.icon.replaceChildren(Icon('ton'))
    } else {
      this.icon.replaceChildren(currencyStarIcon() as HTMLElement)
    }
  }

  public setApproxText(text: string) {
    this.approxLabel.textContent = text
  }
}

export default class PopupSellStarGift extends PopupElement<{
  finish: (result: 'list' | 'unlist' | 'cancel') => void
}> {
  private gift: MyStarGift;
  private allowUnlist?: boolean;

  private finished = false;
  private btnConfirmI18n: I18n.IntlElement
  constructor(options: {
    gift: MyStarGift,
    allowUnlist?: boolean
  }) {
    super(styles.popup, {
      closable: true,
      overlayClosable: true,
      title: 'StarGiftSellTitlePopup',
      withConfirm: true,
      withFooterConfirm: true,
      body: true,
      footer: true
    });

    this.addEventListener('close', () => {
      if(!this.finished) {
        this.dispatchEvent('finish', 'cancel');
      }
    });

    safeAssign(this, options);

    this.btnConfirmI18n = new I18n.IntlElement({key: 'StarGiftSellButton'})
    this.btnConfirm.replaceChildren(this.btnConfirmI18n.element)

    this.construct()
  }

  protected async construct() {
    const [appConfig, floorPrice] = await Promise.all([
      this.managers.apiManager.getAppConfig(),
      this.managers.appGiftsManager.getFloorPrice(this.gift.raw.title)
    ])
    this.appendSolid(() => this._construct({appConfig, floorPrice}));
    this.show()
  }

  protected _construct({appConfig, floorPrice}: {appConfig: MTAppConfig, floorPrice?: Long}) {
    const [ton, setTon] = createSignal(this.gift.resellOnlyTon ?? false);
    const [sellAmount, setSellAmount] = createSignal('');

    if(this.gift.resellOnlyTon && this.gift.resellPriceTon) {
      setSellAmount(String(nanotonToJsNumber(this.gift.resellPriceTon)))
    } else if(this.gift.resellPriceStars) {
      setSellAmount(String(this.gift.resellPriceStars))
    } else if(floorPrice) {
      setSellAmount(String(floorPrice))
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
          return ['StarGiftMinSellAmountTon', [formatNanoton(min)]]
        }

        if(nanoton.gt(max)) {
          return ['StarGiftMaxSellAmountTon', [formatNanoton(max)]]
        }

        return undefined
      }

      const value = +sellAmount$;
      const min = appConfig.stars_stargift_resale_amount_min;
      const max = appConfig.stars_stargift_resale_amount_max;

      if(value < min) {
        return ['StarGiftMinSellAmountStars', [min]]
      }

      if(value > max) {
        return ['StarGiftMaxSellAmountStars', [max]]
      }

      return undefined
    })

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
    })

    const percentage = () => (ton() ? appConfig.ton_stargift_resale_commission_permille : appConfig.stars_stargift_resale_commission_permille) / 10;

    createEffect(on(() => [inputError(), sellAmount()], ([error, sellAmount]) => {
      this.btnConfirm.toggleAttribute('disabled', !!error || (!sellAmount && !this.allowUnlist))
      if(!sellAmount && this.allowUnlist) {
        this.btnConfirmI18n.update({key: 'StarGiftUnlistButton'})
      } else {
        this.btnConfirmI18n.update({key: 'StarGiftSellButton'})
      }
    }))

    createEffect(on(() => [ton(), sellAmount()], ([ton, sellAmount]) => {
      if(ton) {
        const float = Number(sellAmount)
        const usd = appConfig.ton_usd_rate * float
        inputRef.setApproxText(`≈${paymentsWrapCurrencyAmount(usd * 100, 'USD')}`)
        return
      }

      const value = +sellAmount;
      const usd = appConfig.stars_usd_sell_rate_x1000 / 1000 * value / 100;
      inputRef.setApproxText(`≈${paymentsWrapCurrencyAmount(usd * 100, 'USD')}`)
    }))

    let inputRef: SellPriceInputField

    createEffect(on(ton, (ton, prev) => {
      inputRef.setIcon(ton ? 'ton' : 'stars')

      if(prev !== undefined) {
        setSellAmount('')
        fastRaf(() => {
          inputRef.input.focus()
        })
      }
    }))

    onMount(() => {
      attachClickEvent(this.btnConfirm, () => {
        setLoading(true)
        let amount: StarsAmount | null
        if(!sellAmount() && this.allowUnlist) {
          amount = null
        } else {
          amount = ton() ? {
            _: 'starsTonAmount',
            amount: parseNanotonFromDecimal(sellAmount()).toString()
          } : {
            _: 'starsAmount',
            amount: +sellAmount(),
            nanos: 0
          }
        }

        this.managers.appGiftsManager.updateResalePrice(this.gift.input, amount).then(() => {
          this.dispatchEvent('finish', amount === null ? 'unlist' : 'list')
          this.hide()
        }).catch(() => {
          toastNew({langPackKey: 'Error.AnError'})
          setLoading(false)
        })
      })
      fastRaf(() => {
        inputRef.input.focus()
      })
    })

    return (
      <>
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
          <InputFieldTsx
            InputFieldClass={SellPriceInputField}
            label={ton() ? 'StarGiftSellTitleTon' : 'StarGiftSellTitleStars'}
            value={sellAmount()}
            plainText
            onRawInput={(value) => {
              let cleanValue = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
              if(!ton()) cleanValue = cleanValue.replace(/\./g, '');
              if(value !== cleanValue) {
                inputRef.setValueSilently(cleanValue);
              }
              setSellAmount(cleanValue);
            }}
            errorLabel={inputError()?.[0]}
            errorLabelOptions={inputError()?.[1]}
            instanceRef={ref => { inputRef = ref }}
            disabled={loading()}
          />
        </Section>
        <Section caption="StarGiftOnlyAcceptTonInfo">
          <Row disabled={loading()}>
            <Row.CheckboxField>
              <CheckboxFieldTsx
                checked={ton()}
                text="StarGiftOnlyAcceptTon"
                onChange={setTon}
              />
            </Row.CheckboxField>
          </Row>
        </Section>
      </>
    )
  }
}
