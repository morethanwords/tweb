import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {createEffect, createMemo, createSignal, on, onMount, Show} from 'solid-js';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {i18n, LangPackKey} from '@lib/langPack';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {fastRaf} from '@helpers/schedulers';
import paymentsWrapCurrencyAmount, {formatNanoton, parseNanotonFromDecimal} from '@helpers/paymentsWrapCurrencyAmount';
import Section from '@components/section';
import rootScope from '@lib/rootScope';

import {useAppConfig} from '@stores/appState';
import {I18nTsx} from '@helpers/solid/i18n';
import {STARS_CURRENCY, TON_CURRENCY} from '@appManagers/constants';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {StarGift, StarsAmount} from '@layer';
import bigInt from 'big-integer';
import PopupElementOld from './index'
import styles from '@components/popups/createStarGiftOffer.module.scss';
import {StarGiftPriceInputField} from '@components/stargifts/stargiftPriceInputField';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import InlineSelect from '@components/sidebarLeft/tabs/passcodeLock/inlineSelect';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {FloatingStarsBalance} from './floatingStarsBalance';
import PopupStars from './stars';
import formatStarsAmount from '../../lib/appManagers/utils/payments/formatStarsAmount';

export async function showCreateStarGiftOfferPopup(options: {
  gift: MyStarGift
  onFinish?: (result: 'created' | 'cancel') => void
}) {
  const gift = options.gift.raw as StarGift.starGiftUnique;
  const peerTitle = await wrapPeerTitle({peerId: getPeerId(gift.owner_id), onlyFirstName: true})
  const [show, setShow] = createSignal(true);

  return createPopup(() => {
    const appConfig = useAppConfig()
    const [ton, setTon] = createSignal(false);
    const [offerAmount, setOfferAmount] = createSignal('');
    const [offerDuration, setOfferDuration] = createSignal(86400);
    const [durationSelectOpen, setDurationSelectOpen] = createSignal(false);

    const durationOptions = [
      {value: 21600, label: () => i18n('Hours', [6])},
      {value: 43200, label: () => i18n('Hours', [12])},
      {value: 86400, label: () => i18n('Hours', [24])},
      {value: 129600, label: () => i18n('Hours', [36])},
      {value: 172800, label: () => i18n('Hours', [48])},
      {value: 259200, label: () => i18n('Hours', [72])}
    ];


    let isCreated = false;
    let inputRef!: HTMLElement;
    let durationRowRef!: HTMLElement;

    onMount(() => {
      fastRaf(() => {
        inputRef.focus();
      });
    });

    const handleSubmit = async() => {
      const starsAmount: StarsAmount = ton() ? {
        _: 'starsTonAmount',
        amount: parseNanotonFromDecimal(offerAmount()).toString()
      } : {
        _: 'starsAmount',
        amount: +offerAmount(),
        nanos: 0
      }

      try {
        await rootScope.managers.appGiftsManager.createGiftOffer({
          peerId: getPeerId(gift.owner_id),
          slug: gift.slug,
          amount: starsAmount,
          duration: offerDuration()
        });

        isCreated = true;
        options.onFinish?.('created')
      } catch(err) {
        if((err as ApiError).type === 'BALANCE_TOO_LOW') {
          PopupElementOld.createPopup(PopupStars, {
            itemPrice: starsAmount.amount,
            ton: ton(),
            onTopup: async() => {
              await handleSubmit()
            },
            purpose: 'stargift'
          });
        }
      }
    }

    const limits = createMemo(() => {
      const minStars = gift.offer_min_stars;
      const maxStars = Math.max(minStars * 2, appConfig.stars_stargift_resale_amount_max);

      const minStarsUsd = appConfig.stars_usd_sell_rate_x1000 / 1000 * minStars / 100;
      const minTonFromStars = parseNanotonFromDecimal(String(minStarsUsd / appConfig.ton_usd_rate));
      const minTonFromConfig = bigInt(appConfig.ton_stargift_resale_amount_min);
      const minTon = bigInt.max(minTonFromStars, minTonFromConfig);
      const maxTon = bigInt.max(minTon.multiply(2), appConfig.ton_stargift_resale_amount_max);
      return {minStars, maxStars, minTon, maxTon};
    })

    const inputError = createMemo<[LangPackKey, any[]] | undefined>(() => {
      const offerAmount$ = offerAmount();
      if(!offerAmount$) return undefined;

      const {minStars, maxStars, minTon, maxTon} = limits();

      if(ton()) {
        const nanoton = parseNanotonFromDecimal(offerAmount$);
        if(nanoton.lt(minTon)) {
          return ['StarGiftMinSellAmountTon', [formatNanoton(minTon)]];
        }

        if(nanoton.gt(maxTon)) {
          return ['StarGiftMaxSellAmountTon', [formatNanoton(maxTon)]];
        }

        return undefined;
      }

      const value = +offerAmount$;

      if(value < minStars) {
        return ['StarGiftMinSellAmountStars', [minStars]];
      }

      if(value > maxStars) {
        return ['StarGiftMaxSellAmountStars', [maxStars]];
      }

      return undefined;
    });

    return (
      <PopupElement
        class={styles.popup}
        containerClass={styles.popupContainer}
        show={show()}
        closable={true}
        withConfirm={true}
        onClose={() => {
          if(!isCreated) {
            options.onFinish?.('cancel');
          }
        }}
      >
        <FloatingStarsBalance class={styles.balance} ton={ton()} />
        <PopupElement.Header class={styles.popupHeader}>
          <PopupElement.CloseButton />
          <PopupElement.Title>
            <I18nTsx key="StarGiftOffer.CreateOfferTitle" />
          </PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <Section
            caption={ton() ? 'StarGiftOffer.CreateOfferSubtitleTON' : 'StarGiftOffer.CreateOfferSubtitleStars'}
            captionArgs={[getCollectibleName(gift)]}
          >
            <ChipTabs
              class={styles.chipTabs}
              value={ton() ? 'ton' : 'stars'}
              view="primary"
              onChange={(value) => setTon(value === 'ton')}
            >
              <ChipTab value="stars">
                <I18nTsx key="StarGiftOffer.CreateOfferStars" />
              </ChipTab>
              <ChipTab value="ton">
                <I18nTsx key="StarGiftOffer.CreateOfferTON" />
              </ChipTab>
            </ChipTabs>
            <StarGiftPriceInputField
              class={styles.input}
              ton={ton()}
              label={ton() ? 'StarGiftOffer.CreateOfferPlaceholderTON' : 'StarGiftOffer.CreateOfferPlacholderStars'}
              value={offerAmount()}
              onValueChange={setOfferAmount}
              errorLabel={inputError()?.[0]}
              errorLabelOptions={inputError()?.[1]}
              instanceRef={ref => {
                inputRef = ref.input;
              }}
            />
          </Section>
          <Section
            caption={ton() ? 'StarGiftOffer.OfferDurationDescriptionTON' : 'StarGiftOffer.OfferDurationDescriptionStars'}
            captionArgs={[peerTitle]}
          >
            <Row
              ref={durationRowRef}
              clickable={() => setDurationSelectOpen(v => !v)}
            >
              <Row.Title>
                <I18nTsx key="StarGiftOffer.OfferDuration" />
              </Row.Title>
              <Row.RightContent>
                <InlineSelect
                  value={offerDuration()}
                  onChange={setOfferDuration}
                  options={durationOptions}
                  parent={durationRowRef}
                  isOpen={durationSelectOpen()}
                  onClose={() => setDurationSelectOpen(false)}
                />
              </Row.RightContent>
            </Row>
          </Section>
        </PopupElement.Body>
        <PopupElement.Footer class={styles.popupFooter}>
          <PopupElement.FooterButton
            disabled={!offerAmount() || inputError() !== undefined}
            callback={handleSubmit}
          >
            <I18nTsx
              key="StarGiftOffer.CreateOfferSubmit"
              args={[
                ton() ?
                  paymentsWrapCurrencyAmount(parseNanotonFromDecimal(offerAmount()).toString(), TON_CURRENCY) :
                  paymentsWrapCurrencyAmount(offerAmount(), STARS_CURRENCY)
              ]}
            />
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
