import InputField, {InputFieldOptions} from '@components/inputField';
import currencyStarIcon from '@components/currencyStarIcon';
import Icon from '@components/icon';
import {FormatterArguments, LangPackKey} from '@lib/langPack';
import {useAppConfig} from '@stores/appState';
import {createEffect, on} from 'solid-js';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {fastRaf} from '@helpers/schedulers';

import styles from '@components/stargifts/stargiftPriceInputField.module.scss';

export class StarGiftPriceInputFieldClass extends InputField {
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

export function StarGiftPriceInputField(props: {
  class?: string
  label: LangPackKey
  value: string
  onValueChange: (value: string) => void
  ton: boolean
  disabled?: boolean
  errorLabel?: LangPackKey
  errorLabelOptions?: FormatterArguments
  instanceRef?: (ref: StarGiftPriceInputFieldClass) => void
}) {
  const appConfig = useAppConfig()
  let inputRef!: StarGiftPriceInputFieldClass

  createEffect(on(() => [props.ton, props.value], ([ton, valueStr]) => {
    if(ton) {
      const float = Number(valueStr);
      const usd = appConfig.ton_usd_rate * float;
      inputRef.setApproxText(`≈${paymentsWrapCurrencyAmount(usd * 100, 'USD')}`);
      return;
    }

    const value = +valueStr;
    const usd = appConfig.stars_usd_sell_rate_x1000 / 1000 * value / 100;
    inputRef.setApproxText(`≈${paymentsWrapCurrencyAmount(usd * 100, 'USD')}`);
  }));

  createEffect(on(() => props.ton, (ton, prev) => {
    if(!inputRef) return;
    inputRef.setIcon(ton ? 'ton' : 'stars');

    if(prev !== undefined) {
      props.onValueChange('');
      fastRaf(() => {
        inputRef.input.focus();
      });
    }
  }));

  return (
    <InputFieldTsx
      InputFieldClass={StarGiftPriceInputFieldClass}
      value={props.value}
      class={props.class}
      plainText
      onRawInput={(value) => {
        let cleanValue = value.replace(/,/g, '.');
        const parts = cleanValue.split('.');
        if(parts.length > 2) cleanValue = parts[0] + '.' + parts.slice(1).join('');
        cleanValue = cleanValue.replace(/[^0-9.]/g, '');

        if(!props.ton) cleanValue = cleanValue.replace(/\./g, '');
        if(value !== cleanValue) {
          inputRef.setValueSilently(cleanValue);
        }
        props.onValueChange(cleanValue);
      }}
      label={props.label}
      errorLabel={props.errorLabel}
      errorLabelOptions={props.errorLabelOptions}
      disabled={props.disabled}
      instanceRef={ref => {
        inputRef = ref;
        props.instanceRef?.(ref);
      }}
    />
  )
}
