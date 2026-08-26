import {createEffect, createSignal, For, JSX, Show} from 'solid-js';
import {PremiumGiftCodeOption, PremiumSubscriptionOption} from '@layer';
import {LangPackKey, i18n} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RowTsx from '@components/rowTsx';
import {formatMonthsDuration} from '@helpers/date';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';

type PremiumOption = PremiumSubscriptionOption | PremiumGiftCodeOption;

export default function PremiumOptionsForm<T extends PremiumOption>(props: {
  periodOptions: T[],
  onOption: (option: T) => void,
  checked?: number,
  users?: number,
  discountInTitle?: boolean,
  name?: string,
  titleForOption?: (option: T) => JSX.Element,
  subtitleForOption?: (option: T) => JSX.Element
}) {
  const isGiftCode = props.periodOptions[0]._ === 'premiumGiftCodeOption';
  const shortestOption = props.periodOptions.slice().sort((a, b) => a.months - b.months)[0];
  const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(
    amount,
    shortestOption.currency,
    false,
    true,
    true
  );
  const keys: {[key: number]: LangPackKey} = isGiftCode ? undefined : {
    12: 'PremiumTierAnnual',
    6: 'PremiumTierSemiannual',
    1: 'PremiumTierMonthly'
  };
  const initialIndex = Math.max(0, Math.min(props.checked ?? 0, props.periodOptions.length - 1));
  const [selectedIndex, setSelectedIndex] = createSignal(initialIndex);
  const users = () => props.users ?? 1;

  createEffect(() => props.onOption(props.periodOptions[selectedIndex()]));

  return (
    <form class="popup-gift-premium-options">
      <For each={props.periodOptions}>{(option, index) => {
        const amountPerUser = +option.amount / (isGiftCode ? (option as PremiumGiftCodeOption).users : 1);
        const title = () => props.titleForOption?.(option) ?? (
          keys ? i18n(keys[option.months] || 'Months', [option.months]) : formatMonthsDuration(option.months, false)
        );
        const subtitle = () => props.subtitleForOption?.(option) ?? (
          isGiftCode ?
            i18n('Multiplier', [wrapCurrency(amountPerUser), users()]) :
            option !== shortestOption ? i18n('PricePerMonth', [wrapCurrency(+option.amount / option.months)]) : undefined
        );
        const shortestAmount = +shortestOption.amount * option.months / shortestOption.months;
        const discount = Math.round((1 - +option.amount / shortestAmount) * 100);
        const withDiscount = (content: JSX.Element) => option === shortestOption ? content : (
          <span>
            <span class="popup-gift-premium-discount">-{discount}%</span>
            {content}
          </span>
        );

        return (
          <RowTsx class="popup-gift-premium-option">
            <RowTsx.Title>
              {props.discountInTitle ? withDiscount(title()) : title()}
            </RowTsx.Title>
            <Show when={subtitle()}>{(value) => (
              <RowTsx.Subtitle>
                {props.discountInTitle ? value() : withDiscount(value())}
              </RowTsx.Subtitle>
            )}</Show>
            <RowTsx.RightContent class="row-title-right-secondary">
              {wrapCurrency(isGiftCode ? amountPerUser * users() : option.amount)}
            </RowTsx.RightContent>
            <RowTsx.CheckboxField>
              <CheckboxFieldTsx
                asRadio
                checked={index() === selectedIndex()}
                name={props.name ?? 'premium-period'}
                round
                onChange={(isChecked) => isChecked && setSelectedIndex(index())}
              />
            </RowTsx.CheckboxField>
          </RowTsx>
        );
      }}</For>
    </form>
  );
}
