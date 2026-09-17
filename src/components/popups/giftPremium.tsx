import PopupElement, {createPopup} from '@components/popups/indexTsx';
import Scrollable from '@components/scrollable2';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {PremiumGiftCodeOption} from '@layer';
import {i18n} from '@lib/langPack';
import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {createPaymentPopup} from '@components/popups/payment';
import PremiumOptionsForm from '@components/premium/premiumOptionsForm';
import rootScope from '@lib/rootScope';
import {createSignal} from 'solid-js';
import Section from '@components/section';
import MediaHeader from '@components/mediaHeader';

const className = 'popup-gift-premium';

export default async function showGiftPremiumPopup(peerId: PeerId, giftOptions: PremiumGiftCodeOption[]) {
  const peerTitle = await wrapPeerTitle({peerId});
  const [show, setShow] = createSignal(true);

  createPopup(() => {
    const shortestOption = giftOptions.slice().sort((a, b) => a.months - b.months)[0];
    const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

    const [selectedOption, setSelectedOption] = createSignal(giftOptions[0]);

    const onGift = async() => {
      const giftOption = selectedOption();
      await createPaymentPopup({
        inputInvoice: {
          _: 'inputInvoicePremiumGiftCode',
          option: giftOption,
          purpose: {
            _: 'inputStorePaymentPremiumGiftCode',
            amount: giftOption.amount,
            currency: giftOption.currency,
            users: [await rootScope.managers.appUsersManager.getUserInput(peerId.toUserId())]
          }
        }
      });
      setShow(false);
    };

    return (
      <PopupElement class={className} closable show={show()}>
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <PopupElement.Body>
            <MediaHeader marginTop marginBottom>
              <MediaHeader.Sticker size={100} element={<AvatarNewTsx size={100} peerId={peerId} />} />
              <MediaHeader.Title size={20}>{i18n('GiftTelegramPremiumTitle')}</MediaHeader.Title>
              <MediaHeader.Subtitle>{i18n('GiftTelegramPremiumDescription', [peerTitle])}</MediaHeader.Subtitle>
            </MediaHeader>
            <Section>
              <PremiumOptionsForm
                periodOptions={giftOptions}
                name="gift-months"
                titleForOption={(giftOption) => {
                  const isYears = !(giftOption.months % 12);
                  return i18n(isYears ? 'Years' : 'Months', [isYears ? giftOption.months / 12 : giftOption.months]);
                }}
                subtitleForOption={(giftOption) => i18n('PricePerMonth', [wrapCurrency(+giftOption.amount / giftOption.months)])}
                onOption={setSelectedOption}
              />
            </Section>
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            class={`btn-primary ${className}-confirm shimmer`}
            callback={onGift}
          >
            {i18n('GiftSubscriptionFor', [wrapCurrency(selectedOption().amount)])}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
