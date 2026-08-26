import PopupElement from '.';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {PremiumGiftCodeOption} from '@layer';
import I18n, {i18n, _i18n} from '@lib/langPack';
import {avatarNew} from '@components/avatarNew';
import Button from '@components/button';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import PopupPayment from '@components/popups/payment';
import PremiumOptionsForm from '@components/premium/premiumOptionsForm';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

const className = 'popup-gift-premium';

export default class PopupGiftPremium extends PopupElement {
  constructor(
    private peerId: PeerId,
    private giftOptions: PremiumGiftCodeOption[]
  ) {
    super(className, {closable: true, overlayClosable: true, body: true, scrollable: true});

    this.construct();
  }

  public async construct() {
    const {peerId, giftOptions} = this;
    const avatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 100,
      peerId
    });
    avatar.node.classList.add(className + '-avatar');

    const title = document.createElement('span');
    _i18n(title, 'GiftTelegramPremiumTitle');
    title.classList.add(className + '-title');

    const subtitle = i18n('GiftTelegramPremiumDescription', [await wrapPeerTitle({peerId})]);
    subtitle.classList.add(className + '-subtitle');

    const shortestOption = this.giftOptions.slice().sort((a, b) => a.months - b.months)[0];

    const wrapCurrency = (amount: number | string) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

    let selectedOption = giftOptions[0];
    const buttonText = new I18n.IntlElement({key: 'GiftSubscriptionFor', args: [wrapCurrency(selectedOption.amount)]});
    const form = wrapSolidComponent(() => (
      <PremiumOptionsForm
        periodOptions={giftOptions}
        name="gift-months"
        titleForOption={(giftOption) => {
          const isYears = !(giftOption.months % 12);
          return i18n(isYears ? 'Years' : 'Months', [isYears ? giftOption.months / 12 : giftOption.months]);
        }}
        subtitleForOption={(giftOption) => i18n('PricePerMonth', [wrapCurrency(+giftOption.amount / giftOption.months)])}
        onOption={(giftOption) => {
          selectedOption = giftOption;
          buttonText?.compareAndUpdate({args: [wrapCurrency(giftOption.amount)]});
        }}
      />
    ), this.middlewareHelper.get());

    const giftButton = Button(`btn-primary ${className}-confirm shimmer`);
    giftButton.append(buttonText.element);

    attachClickEvent(giftButton, async() => {
      const giftOption = selectedOption;
      PopupPayment.create({
        inputInvoice: {
          _: 'inputInvoicePremiumGiftCode',
          option: giftOption,
          purpose: {
            _: 'inputStorePaymentPremiumGiftCode',
            amount: giftOption.amount,
            currency: giftOption.currency,
            users: [await this.managers.appUsersManager.getUserInput(peerId.toUserId())]
          }
        }
      });
      this.hide();
    }, {listenerSetter: this.listenerSetter});

    this.scrollable.append(
      avatar.node,
      title,
      subtitle,
      form,
      giftButton
    );

    this.show();
  }
}
