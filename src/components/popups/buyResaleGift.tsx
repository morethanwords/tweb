import {createSignal} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import MediaHeader from '@components/mediaHeader';

import styles from '@components/popups/buyResaleGift.module.scss';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {STARS_CURRENCY, TON_CURRENCY} from '@appManagers/constants';
import {StarGift} from '@layer';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {FloatingStarsBalance} from '@components/popups/floatingStarsBalance';
import {createPaymentPopup} from '@components/popups/payment';
import {StarGiftTransferPreview} from '@components/stargifts/transferPreview';
import {ChipTab, ChipTabs} from '@components/chipTabs';

export default function showBuyResaleGiftPopup(options: {
  recipientId: PeerId,
  gift: MyStarGift,
  onFinish?: (result: boolean) => void
}) {
  const {recipientId, gift: myGift} = options;
  const gift = myGift.raw as StarGift.starGiftUnique;
  const [show, setShow] = createSignal(true);
  // closing without paying answers `false`, but the buttons answer for themselves
  let finished = false;
  const finish = (result: boolean) => {
    finished = true;
    options.onFinish?.(result);
    setShow(false);
  };

  createPopup(() => {
    const [ton, setTon] = createSignal(myGift.resellOnlyTon ?? false);

    const onBuy = async() => {
      const popup = await createPaymentPopup({
        inputInvoice: {
          _: 'inputInvoiceStarGiftResale',
          pFlags: {ton: ton() ? true : undefined},
          slug: gift.slug,
          to_id: await rootScope.managers.appPeersManager.getInputPeerById(recipientId)
        },
        noShowIfStars: true,
        purpose: 'stargift'
      });

      popup.addEventListener('finish', (result) => {
        if(result === 'paid' || result === 'pending') {
          finish(true);
        }
      });
    };

    return (
      <PopupElement
        class={styles.popup}
        closable
        show={show()}
        onClose={() => !finished && options.onFinish?.(false)}
      >
        <PopupElement.Body>
          {gift.pFlags.resale_ton_only ? (
            <div class={/* @once */ styles.onlyTon}>
              <I18nTsx key="StarGiftResaleOnlyTon" />
            </div>
          ) : (
            <ChipTabs
              value={ton() ? 'ton' : 'stars'}
              view="primary"
              onChange={(value) => setTon(value === 'ton')}
            >
              <ChipTab value="stars">
                <I18nTsx key="StarGiftResalePayInStars" />
              </ChipTab>
              <ChipTab value="ton">
                <I18nTsx key="StarGiftResalePayInTon" />
              </ChipTab>
            </ChipTabs>
          )}

          <StarGiftTransferPreview
            class={/* @once */ styles.graph}
            gift={myGift}
            recipient={recipientId}
          />

          <MediaHeader class={/* @once */ styles.confirmation} align="start">
            <MediaHeader.Title size={20}>
              <I18nTsx key="ConfirmPayment" />
            </MediaHeader.Title>

            <MediaHeader.Subtitle>
              <I18nTsx
                key={recipientId !== rootScope.myId ? 'StarGiftResaleBuyTextWithRecipient' : 'StarGiftResaleBuyText'}
                args={[
                  <span>
                    {gift.title}
                    &nbsp;#{numberThousandSplitter(gift.num)}
                  </span>,
                  ton() ?
                    paymentsWrapCurrencyAmount(myGift.resellPriceTon, TON_CURRENCY, false, false, true) :
                    paymentsWrapCurrencyAmount(myGift.resellPriceStars, STARS_CURRENCY, false, false, true),
                  recipientId !== rootScope.myId && <PeerTitleTsx peerId={recipientId} />
                ]}
              />
            </MediaHeader.Subtitle>
          </MediaHeader>
          <FloatingStarsBalance class={styles.starsBalance} ton={ton()} />
        </PopupElement.Body>
        <PopupElement.Buttons>
          <PopupElement.Button
            langKey="StarGiftResaleBuyConfirm"
            langArgs={[
              ton() ?
                paymentsWrapCurrencyAmount(myGift.resellPriceTon, TON_CURRENCY) :
                paymentsWrapCurrencyAmount(myGift.resellPriceStars, STARS_CURRENCY)
            ]}
            callback={() => {
              onBuy();
              return false;
            }}
          />
          <PopupElement.Button langKey="Cancel" callback={() => finish(false)} />
        </PopupElement.Buttons>
      </PopupElement>
    );
  });
}
