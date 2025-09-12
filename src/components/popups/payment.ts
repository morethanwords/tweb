/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import Currencies from '../../config/currencies';
import {FontFamily, FontFull, FontSize} from '../../config/font';
import accumulate from '../../helpers/array/accumulate';
import assumeType from '../../helpers/assumeType';
import getTextWidth from '../../helpers/canvas/getTextWidth';
import {detectUnifiedCardBrand} from '../../helpers/cards/cardBrands';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import findUpAsChild from '../../helpers/dom/findUpAsChild';
import findUpClassName from '../../helpers/dom/findUpClassName';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import replaceContent from '../../helpers/dom/replaceContent';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {formatPhoneNumber} from '../../helpers/formatPhoneNumber';
import makeError from '../../helpers/makeError';
import {makeMediaSize} from '../../helpers/mediaSize';
import safeAssign from '../../helpers/object/safeAssign';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import ScrollSaver from '../../helpers/scrollSaver';
import {_tgico} from '../../helpers/tgico';
import tsNow from '../../helpers/tsNow';
import {AccountTmpPassword, Boost, ChatInvite, DocumentAttribute, InputInvoice, InputPaymentCredentials, LabeledPrice, Message, MessageAction, MessageMedia, PaymentRequestedInfo, PaymentSavedCredentials, PaymentsPaymentForm, PaymentsPaymentReceipt, PaymentsValidatedRequestedInfo, PostAddress, ShippingOption, StarsSubscription, StarsTransaction, User} from '../../layer';
import I18n, {i18n, LangPackKey, _i18n} from '../../lib/langPack';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import rootScope from '../../lib/rootScope';
import {useUser} from '../../stores/peers';
import {avatarNew} from '../avatarNew';
import Button from '../button';
import CheckboxField from '../checkboxField';
import PeerTitle from '../peerTitle';
import {putPreloader} from '../putPreloader';
import Row from '../row';
import {toastNew} from '../toast';
import wrapPeerTitle from '../wrappers/peerTitle';
import wrapPhoto from '../wrappers/photo';
import PopupPaymentCard, {PaymentCardDetails, PaymentCardDetailsResult} from './paymentCard';
import PopupPaymentCardConfirmation from './paymentCardConfirmation';
import PopupPaymentMethods from './paymentMethods';
import PopupPaymentShipping, {PaymentShippingAddress} from './paymentShipping';
import PopupPaymentShippingMethods from './paymentShippingMethods';
import PopupPaymentVerification from './paymentVerification';
import type PopupStars from './stars';
import PopupStarsPay from './starsPay';

const USE_NATIVE_SYMBOL = true;
const iconPath = 'assets/img/';
const icons = [
  'amex',
  'card',
  'diners',
  'discover',
  'jcb',
  'mastercard',
  'visa',
  'unionpay',
  'mir',
  'logo'
];

export function getPaymentBrandIconPath(brand: string) {
  if(!icons.includes(brand)) {
    return;
  }

  return `${iconPath}${brand}.svg`;
}

export function PaymentButton(options: {
  onClick: () => Promise<any> | void,
  key?: LangPackKey,
  textEl?: I18n.IntlElement
}) {
  const textEl = options.textEl ?? new I18n.IntlElement({key: options.key ?? 'PaymentInfo.Done'});
  const key = textEl.key;
  const payButton = Button('btn-primary btn-color-primary payment-item-pay');
  payButton.append(textEl.element);
  attachClickEvent(payButton, async() => {
    const result = options.onClick();
    if(!(result instanceof Promise)) {
      return;
    }

    const d = putPreloader(payButton);
    const toggle = toggleDisability([payButton], true);
    textEl.compareAndUpdate({key: 'PleaseWait'});
    try {
      await result;
    } catch(err) {
      if(!(err as ApiError).handled) {
        console.error('payment button error', err);
      }

      toggle();
      textEl.compareAndUpdate({key});
      d.remove();
    }
  });
  return payButton;
}

export type PaymentsCredentialsToken = {type: 'card', token?: string, id?: string};

export type PopupPaymentResult = 'paid' | 'cancelled' | 'pending' | 'failed';

export class InputRightNumber {
  public input: HTMLInputElement;

  constructor(public options: {
    fontWeight?: number
  } = {}) {
    const input = this.input = document.createElement('input');
    input.type = 'tel';
    // const input: HTMLElement = document.createElement('div');
    // input.contentEditable = 'true';
    input.classList.add('input-clear');

    const haveToIgnoreEvents = input instanceof HTMLInputElement ? 1 : 2;
    const onSelectionChange = () => {
      if(ignoreNextSelectionChange) {
        --ignoreNextSelectionChange;
        return;
      }

      // setTimeout(() => {
      ignoreNextSelectionChange = haveToIgnoreEvents;
      placeCaretAtEnd(input);
      // }, 0);
    };

    const onFocus = () => {
      // cancelEvent(e);
      setTimeout(() => {
        ignoreNextSelectionChange = haveToIgnoreEvents;
        placeCaretAtEnd(input);
        document.addEventListener('selectionchange', onSelectionChange);
      }, 0);
    };

    const onFocusOut = () => {
      input.addEventListener('focus', onFocus, {once: true});
      document.removeEventListener('selectionchange', onSelectionChange);
    };

    let ignoreNextSelectionChange: number;
    input.addEventListener('focusout', onFocusOut);
    onFocusOut();
  }

  public get value() {
    // return input.textContent;
    return this.input.value;
  }

  public set value(value: string) {
    this.input.value = value;
    // input.textContent = wrapped;
    this.onValue();
  }

  public onValue() {
    if(document.activeElement === this.input) {
      placeCaretAtEnd(this.input);
    }

    this.setWidth();
  }

  public setWidth() {
    const width = getTextWidth(this.value, this.options?.fontWeight ? `${this.options.fontWeight} ${FontSize} ${FontFamily}` : FontFull);
    this.input.style.width = width + 'px';
  }
}

const className = 'payment-item';

export default class PopupPayment extends PopupElement<{
  finish: (result: PopupPaymentResult) => void
}> {
  private tipButtonsMap: Map<number, HTMLElement>;
  private result: PopupPaymentResult;
  private message: Message.message;
  private inputInvoice: InputInvoice;
  private paymentForm?: PaymentsPaymentForm | PaymentsPaymentReceipt;
  private isReceipt: boolean;

  constructor(options: {
    message?: Message.message,
    inputInvoice?: InputInvoice,
    paymentForm?: PaymentsPaymentForm | PaymentsPaymentReceipt,
    isReceipt?: boolean,

    // * stars only
    isTopUp?: boolean,
    transaction?: StarsTransaction,
    paidMedia?: MessageMedia.messageMediaPaidMedia,
    chatInvite?: ChatInvite.chatInvite,
    noPaymentForm?: boolean,
    subscription?: StarsSubscription,
    giftAction?: MessageAction.messageActionGiftStars,
    boost?: Boost,
    giftPeerId?: PeerId,
    noShowIfStars?: boolean,
    purpose?: ConstructorParameters<typeof PopupStars>[0]['purpose']
  }) {
    super('popup-payment', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: true
    });

    safeAssign(this, options);

    this.result = 'cancelled';

    this.tipButtonsMap = new Map();
  }

  public hide() {
    this.dispatchEvent('finish', this.result);
    return super.hide();
  }

  public setPaymentForm(paymentForm: PaymentsPaymentForm | PaymentsPaymentReceipt) {
    this.paymentForm = paymentForm;
    this.d().catch((err) => {
      console.error('payment popup error', err);
      this.hide();
    });
  }

  private async d() {
    this.element.classList.add('is-loading');
    this.show();

    let confirmed = false;
    const onConfirmed = () => {
      if(confirmed) {
        return;
      }

      this.result = 'paid';
      confirmed = true;
      if(popupPaymentVerification) {
        popupPaymentVerification.hide();
      }

      this.hide();
    };

    const {paymentForm, message} = this;
    if(paymentForm._ === 'payments.paymentFormStarGift') {
      throw new Error('not implemented');
    }

    if(message) {
      this.listenerSetter.add(rootScope)('payment_sent', ({peerId, mid}) => {
        if(message.peerId === peerId && message.mid === mid) {
          onConfirmed();
        }
      });
    }

    const mediaInvoice = message?.media as MessageMedia.messageMediaInvoice;
    const isReceipt = this.isReceipt ??
      (
        mediaInvoice ?
          !!mediaInvoice.receipt_msg_id || mediaInvoice.extended_media?._ === 'messageExtendedMedia' :
          paymentForm._ === 'payments.paymentReceipt'
      );
    const isTest = mediaInvoice ? mediaInvoice.pFlags.test : paymentForm.invoice.pFlags.test;
    const isStars = paymentForm._ === 'payments.paymentFormStars';

    const photo = mediaInvoice ? mediaInvoice.photo : (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).photo;
    const title = mediaInvoice ? mediaInvoice.title : paymentForm.title;
    const description = mediaInvoice ? mediaInvoice.description : paymentForm.description;

    _i18n(this.title, isReceipt ? 'PaymentReceipt' : 'PaymentCheckout');
    if(isTest) {
      this.title.append(' (Test)');
    }

    const itemEl = document.createElement('div');
    itemEl.classList.add(className);

    const detailsClassName = className + '-details';
    const details = document.createElement('div');
    details.classList.add(detailsClassName);

    let photoEl: HTMLElement;
    if(photo) {
      photoEl = document.createElement('div');
      photoEl.classList.add(detailsClassName + '-photo', 'media-container-contain');
      const sizeAttribute = photo.attributes.find((attribute) => attribute._ === 'documentAttributeImageSize') as DocumentAttribute.documentAttributeImageSize;
      const boxSize = makeMediaSize(100, 100);
      if(sizeAttribute) {
        const photoSize = makeMediaSize(sizeAttribute.w, sizeAttribute.h);
        const fittedSize = photoSize.aspectFitted(boxSize);
        photoEl.style.width = fittedSize.width + 'px';
        photoEl.style.height = fittedSize.height + 'px';
      }

      wrapPhoto({
        photo: photo,
        container: photoEl,
        boxWidth: boxSize.width,
        boxHeight: boxSize.height,
        size: {_: 'photoSizeEmpty', type: ''}
      });
      details.append(photoEl);
    }

    const linesClassName = detailsClassName + '-lines';
    const linesEl = document.createElement('div');
    linesEl.classList.add(linesClassName);

    const titleEl = document.createElement('div');
    titleEl.classList.add(linesClassName + '-title');

    const descriptionEl = document.createElement('div');
    descriptionEl.classList.add(linesClassName + '-description');

    const botName = document.createElement('div');
    botName.classList.add(linesClassName + '-bot-name');

    linesEl.append(titleEl, descriptionEl, botName);

    setInnerHTML(titleEl, wrapEmojiText(title));
    setInnerHTML(descriptionEl, wrapEmojiText(description));

    const peerTitle = new PeerTitle();
    botName.append(peerTitle.element);

    details.append(linesEl);
    itemEl.append(details);
    this.scrollable.append(itemEl);

    const preloaderContainer = document.createElement('div');
    preloaderContainer.classList.add(className + '-preloader-container');
    const preloader = putPreloader(preloaderContainer, true);
    this.scrollable.append(preloaderContainer);

    const inputInvoice = this.inputInvoice;

    let savedInfo = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_info || (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).info;
    const savedCredentials = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_credentials?.[0];
    let [
      lastRequestedInfo,
      passwordState,
      providerPeerTitle
    ] = await Promise.all([
      !isReceipt && savedInfo && this.managers.appPaymentsManager.validateRequestedInfo(inputInvoice, savedInfo).catch((err: ApiError) => {
        console.error('validateRequestedInfo', err, savedInfo);
        // savedInfo = undefined;
        return undefined as PaymentsValidatedRequestedInfo;
      }),
      savedCredentials && this.managers.passwordManager.getState(),
      wrapPeerTitle({peerId: isStars ? NULL_PEER_ID : (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).provider_id.toPeerId()})
    ]);

    // console.log(paymentForm, lastRequestedInfo);

    await peerTitle.update({peerId: paymentForm.bot_id.toPeerId()});
    preloaderContainer.remove();
    this.element.classList.remove('is-loading');

    const wrapAmount = (amount: string | number, skipSymbol?: boolean) => {
      return paymentsWrapCurrencyAmount(amount, currency, skipSymbol, USE_NATIVE_SYMBOL, true);
    };

    const {invoice} = paymentForm;
    const currency = invoice.currency;

    const isRecurring = invoice.pFlags.recurring && !isReceipt;
    const hasTerms = !!invoice.terms_url;

    await peerTitle.update({peerId: paymentForm.bot_id.toPeerId()});
    const peerTitle2 = isRecurring || hasTerms ? await wrapPeerTitle({peerId: paymentForm.bot_id.toPeerId()}) : undefined;
    preloaderContainer.remove();
    this.element.classList.remove('is-loading');

    const makeLabel = () => {
      const labelEl = document.createElement('div');
      labelEl.classList.add(pricesClassName + '-price');

      const left = document.createElement('span');
      const right = document.createElement('span');
      labelEl.append(left, right);
      return {label: labelEl, left, right};
    };

    const pricesClassName = className + '-prices';
    const prices = document.createElement('div');
    prices.classList.add(pricesClassName);
    const makePricesElements = (prices: LabeledPrice[]) => {
      return prices.map((price) => {
        const {amount, label} = price;

        const _label = makeLabel();
        _label.left.append(wrapEmojiText(label));

        const wrappedAmount = wrapAmount(amount);
        _label.right.textContent = wrappedAmount;

        return _label.label;
      });
    };

    const pricesElements = makePricesElements(invoice.prices);

    let getTipsAmount = (): number => 0;
    let shippingAmount = 0;

    const getTotalTotal = () => totalAmount + getTipsAmount() + shippingAmount;
    const setTotal = () => {
      const wrapped = wrapAmount(getTotalTotal());
      totalLabel.right.textContent = wrapped;
      payI18n.compareAndUpdate({
        key: 'PaymentCheckoutPay',
        args: [wrapped]
      });
    };

    const payI18n = new I18n.IntlElement();

    const totalLabel = makeLabel();
    totalLabel.label.classList.add('is-total');
    _i18n(totalLabel.left, 'PaymentTransactionTotal');
    const totalAmount = accumulate(invoice.prices.map(({amount}) => +amount), 0);

    const canTip = (invoice.max_tip_amount !== undefined && !isReceipt) || !!(paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).tip_amount;
    if(canTip) {
      const tipsClassName = className + '-tips';

      const currencyData = Currencies[currency];

      getTipsAmount = () => +inputRightNumber.value.replace(/\D/g, '');

      const setInputValue = (amount: string | number) => {
        amount = Math.min(+amount, +invoice.max_tip_amount);
        const wrapped = wrapAmount(amount, true);

        inputRightNumber.value = wrapped;

        unsetActiveTip?.();
        const tipEl = this.tipButtonsMap.get(amount);
        if(tipEl) {
          tipEl.classList.add('active');
        }

        setTotal();
      };

      const tipsLabel = makeLabel();
      _i18n(tipsLabel.left, isReceipt ? 'PaymentTip' : 'PaymentTipOptional');
      const inputRightNumber = new InputRightNumber({fontWeight: 500});
      const {input} = inputRightNumber;
      input.classList.add('input-clear', tipsClassName + '-input');
      tipsLabel.right.append(input);

      if(!isReceipt) {
        tipsLabel.label.style.cursor = 'text';
      } else {
        tipsLabel.label.classList.add('disable-hover');
      }

      tipsLabel.label.addEventListener('mousedown', (e) => {
        if(!findUpAsChild(e.target as HTMLElement, input)) {
          placeCaretAtEnd(input);
        }
      });

      input.addEventListener('input', () => {
        setInputValue(getTipsAmount());
      });

      const s = [
        USE_NATIVE_SYMBOL ? currencyData.native || currencyData.symbol : currencyData.symbol,
        currencyData.space_between ? ' ' : ''
      ];
      if(!currencyData.symbol_left) s.reverse();
      tipsLabel.right[currencyData.symbol_left ? 'prepend' : 'append'](s.join(''));

      pricesElements.push(tipsLabel.label);

      //
      let unsetActiveTip: () => void;
      if(!isReceipt) {
        const tipsEl = document.createElement('div');
        tipsEl.classList.add(tipsClassName);

        const tipClassName = tipsClassName + '-tip';
        const tipButtons = invoice.suggested_tip_amounts.map((tipAmount) => {
          const button = Button(tipClassName, {noRipple: true});
          button.textContent = wrapAmount(tipAmount);

          this.tipButtonsMap.set(+tipAmount, button);
          return button;
        });

        unsetActiveTip = () => {
          const prevTipEl = tipsEl.querySelector('.active');
          if(prevTipEl) {
            prevTipEl.classList.remove('active');
          }
        };

        attachClickEvent(tipsEl, (e) => {
          const tipEl = findUpClassName(e.target, tipClassName);
          if(!tipEl) {
            return;
          }

          let tipAmount = 0;
          if(tipEl.classList.contains('active')) {
            tipEl.classList.remove('active');
          } else {
            unsetActiveTip();
            tipEl.classList.add('active');

            for(const [amount, el] of this.tipButtonsMap) {
              if(el === tipEl) {
                tipAmount = amount;
                break;
              }
            }
          }

          setInputValue(tipAmount);
        });

        setInputValue(0);

        tipsEl.append(...tipButtons);
        pricesElements.push(tipsEl);
      } else {
        setInputValue((paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).tip_amount);
      }
    } else {
      setTotal();
    }

    pricesElements.push(totalLabel.label);

    prices.append(...pricesElements);
    itemEl.append(prices);

    // /

    const setRowIcon = async(row: Row, icon?: string) => {
      const img = document.createElement('img');
      img.classList.add('media-photo');
      await renderImageFromUrlPromise(img, getPaymentBrandIconPath(icon));
      let container = row.media;
      if(!container) {
        container = row.createMedia('small');
        container.classList.add('media-container-cover');
        container.append(img);
      } else {
        replaceContent(container, img);
      }

      row.container.classList.remove('row-with-icon');
    };

    const setRowTitle = (row: Row, textContent: string) => {
      row.title.textContent = textContent;
      if(!textContent) {
        const e = I18n.weakMap.get(row.subtitle.firstElementChild as HTMLElement) as I18n.IntlElement;
        row.title.append(i18n(e.key));
      }

      row.subtitle.classList.toggle('hide', !textContent);
    };

    const setCardSubtitle = (card: PaymentCardDetailsResult) => {
      const {brand, str, icon} = PopupPayment.getCardDetailsInfo(card);

      const outlineIcon = methodRow.container.querySelector(`.${_tgico('card_outline')}`);
      outlineIcon?.remove();
      setRowIcon(methodRow, icon || brand.toLowerCase());
      setRowTitle(methodRow, str);
    };

    const onMethodClick = async() => {
      const user = useUser(rootScope.myId) as User.user;
      assumeType<PaymentsPaymentForm.paymentsPaymentForm>(paymentForm);

      let popup: PopupPaymentMethods | PopupPaymentCard;
      if(paymentForm.additional_methods) {
        popup = PopupElement.createPopup(
          PopupPaymentMethods,
          paymentForm,
          user,
          previousCardDetails as PaymentCardDetails
        );
        popup = await popup.waitForMethodPopup();

        // * reusing same card
        if(!popup) {
          return;
        }
      } else {
        popup = PopupElement.createPopup(
          PopupPaymentCard,
          paymentForm,
          user,
          previousCardDetails as PaymentCardDetails
        );
      }

      popup.addEventListener('finish', ({token, card}) => {
        previousToken = token, previousCardDetails = card;

        setCardSubtitle(card);
      });
    };

    let previousCardDetails: PaymentCardDetailsResult, previousToken: PaymentsCredentialsToken;
    const methodRow = PopupPayment.createRow({
      titleLangKey: 'PaymentCheckoutMethod',
      clickable: isReceipt ? undefined : onMethodClick,
      icon: 'card_outline'
    });

    methodRow.container.classList.add(className + '-method-row');

    if(savedCredentials) {
      setCardSubtitle(savedCredentials);
    } else if((paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).credentials_title) {
      setCardSubtitle({title: (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).credentials_title});
    }

    const providerRow = PopupPayment.createRow({
      title: providerPeerTitle,
      subtitleLangKey: 'PaymentCheckoutProvider'
    });

    const providerAvatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 32,
      peerId: isStars ? NULL_PEER_ID : (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).provider_id.toPeerId()
    });
    providerRow.createMedia('small').append(providerAvatar.node);

    let shippingAddressRow: Row, shippingNameRow: Row, shippingEmailRow: Row, shippingPhoneRow: Row, shippingMethodRow: Row;
    let lastShippingOption: ShippingOption, onShippingAddressClick: (focus?: ConstructorParameters<typeof PopupPaymentShipping>[2]) => void, onShippingMethodClick: () => void;
    const setShippingTitle = invoice.pFlags.shipping_address_requested ? (shippingAddress?: PaymentShippingAddress) => {
      if(!shippingAddress) {
        shippingMethodRow.subtitle.classList.add('hide');
        replaceContent(shippingMethodRow.title, i18n('PaymentShippingAddress'));
        return;
      }

      const postAddress = shippingAddress.shipping_address;
      setRowTitle(shippingAddressRow, [
        postAddress.city,
        postAddress.street_line1,
        postAddress.street_line2
      ].filter(Boolean).join(', '));

      shippingMethodRow.container.classList.toggle('hide', !lastRequestedInfo?.shipping_options && !isReceipt);
    } : undefined;

    const setShippingInfo = (info: PaymentRequestedInfo) => {
      setShippingTitle && setShippingTitle?.(info);
      shippingNameRow && setRowTitle(shippingNameRow, info.name);
      shippingEmailRow && setRowTitle(shippingEmailRow, info.email);
      shippingPhoneRow && setRowTitle(shippingPhoneRow, info.phone && ('+' + formatPhoneNumber(info.phone).formatted));
    };

    if(!isReceipt) {
      onShippingAddressClick = (focus) => {
        PopupElement.createPopup(
          PopupPaymentShipping,
          paymentForm as PaymentsPaymentForm.paymentsPaymentForm,
          inputInvoice,
          focus
        ).addEventListener('finish', ({shippingAddress, requestedInfo}) => {
          lastRequestedInfo = requestedInfo;
          savedInfo = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_info = shippingAddress;
          setShippingInfo(shippingAddress);
        });
      };
    }

    if(invoice.pFlags.shipping_address_requested) {
      const setShippingOption = (shippingOption?: ShippingOption) => {
        const scrollSaver = new ScrollSaver(this.scrollable, undefined, true);
        scrollSaver.save();
        if(lastShippingPricesElements) {
          lastShippingPricesElements.forEach((node) => node.remove());
        }

        if(!shippingOption) {
          shippingAmount = 0;

          setTotal();
          scrollSaver.restore();
          this.onContentUpdate();
          return;
        }

        lastShippingOption = shippingOption;
        setRowTitle(shippingMethodRow, shippingOption.title);

        shippingAmount = accumulate(shippingOption.prices.map(({amount}) => +amount), 0);
        lastShippingPricesElements = makePricesElements(shippingOption.prices);
        let l = totalLabel.label;
        if(canTip) {
          l = l.previousElementSibling as any;
          if(!isReceipt) {
            l = l.previousElementSibling as any;
          }
        }

        lastShippingPricesElements.forEach((element) => l.parentElement.insertBefore(element, l));

        setTotal();
        scrollSaver.restore();
        this.onContentUpdate();
      };

      shippingAddressRow = PopupPayment.createRow({
        icon: 'location',
        titleLangKey: 'PaymentShippingAddress',
        clickable: !isReceipt && onShippingAddressClick.bind(null, undefined)
      });

      let lastShippingPricesElements: HTMLElement[];
      shippingMethodRow = PopupPayment.createRow({
        icon: 'shipping',
        titleLangKey: 'PaymentCheckoutShippingMethod',
        clickable: !isReceipt && (onShippingMethodClick = () => {
          PopupElement.createPopup(
            PopupPaymentShippingMethods,
            paymentForm as PaymentsPaymentForm,
            lastRequestedInfo,
            lastShippingOption
          ).addEventListener('finish', (shippingOption) => {
            setShippingOption(shippingOption);
          });
        })
      });

      shippingMethodRow.container.classList.add('hide');

      const shippingOption = (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).shipping;
      if(shippingOption) {
        setShippingOption(shippingOption);
      }
    }

    if(invoice.pFlags.name_requested) {
      shippingNameRow = PopupPayment.createRow({
        icon: 'newprivate',
        titleLangKey: 'PaymentCheckoutName',
        clickable: !isReceipt && onShippingAddressClick.bind(null, 'name')
      });
    }

    if(invoice.pFlags.email_requested) {
      shippingEmailRow = PopupPayment.createRow({
        icon: 'mention',
        titleLangKey: 'PaymentShippingEmailPlaceholder',
        clickable: !isReceipt && onShippingAddressClick.bind(null, 'email')
      });
    }

    if(invoice.pFlags.phone_requested) {
      shippingPhoneRow = PopupPayment.createRow({
        icon: 'phone',
        titleLangKey: 'PaymentCheckoutPhoneNumber',
        clickable: !isReceipt && onShippingAddressClick.bind(null, 'phone')
      });
    }

    if(savedInfo) {
      setShippingInfo(savedInfo);
    }

    const rows = [
      methodRow,
      providerRow,
      shippingAddressRow,
      shippingMethodRow,
      shippingNameRow,
      shippingEmailRow,
      shippingPhoneRow
    ].filter(Boolean);

    const acceptTermsCheckboxField = !isReceipt && (isRecurring || hasTerms) && new CheckboxField({
      text: isRecurring ? 'Payments.Recurrent.Accept' : 'Payments.Terms.Accept',
      textArgs: [wrapRichText(invoice.terms_url), peerTitle2]
    });

    const acceptTermsRow = acceptTermsCheckboxField && PopupPayment.createRow({
      checkboxField: acceptTermsCheckboxField
    });

    const recurringElements = acceptTermsCheckboxField ? [document.createElement('hr'), acceptTermsRow.container] : [];

    this.scrollable.append(...[
      document.createElement('hr'),
      ...rows.map((row) => row.container),
      ...recurringElements
    ].filter(Boolean));

    // /
    let popupPaymentVerification: PopupPaymentVerification, lastTmpPasword: AccountTmpPassword;
    const onClick = () => {
      const missingInfo = invoice.pFlags.name_requested && !savedInfo?.name ? 'name' : (invoice.pFlags.email_requested && !savedInfo?.email ? 'email' : (invoice.pFlags.phone_requested && !savedInfo?.phone ? 'phone' : undefined));
      if(invoice.pFlags.shipping_address_requested) {
        if(!lastRequestedInfo) {
          onShippingAddressClick();
          return;
        } else if(!lastShippingOption && lastRequestedInfo.shipping_options) {
          onShippingMethodClick();
          return;
        }
      } else if(missingInfo) {
        onShippingAddressClick(missingInfo);
        return;
      }

      if(!previousCardDetails && !lastTmpPasword) {
        if(!savedCredentials) {
          onMethodClick();
          return;
        }

        Promise.resolve(passwordState ?? this.managers.passwordManager.getState()).then((_passwordState) => {
          PopupElement.createPopup(
            PopupPaymentCardConfirmation,
            savedCredentials.title,
            _passwordState
          ).addEventListener('finish', (tmpPassword) => {
            passwordState = undefined;
            lastTmpPasword = tmpPassword;
            simulateClickEvent(payButton);

            // * reserve 5 seconds
            const diff = tmpPassword.valid_until - tsNow(true) - 5;
            setTimeout(() => {
              if(lastTmpPasword === tmpPassword) {
                lastTmpPasword = undefined;
              }
            }, diff * 1000);
          });
        });

        return;
      }

      return Promise.resolve().then(async() => {
        const credentials: InputPaymentCredentials = lastTmpPasword ? {
          _: 'inputPaymentCredentialsSaved',
          id: savedCredentials.id,
          tmp_password: lastTmpPasword.tmp_password
        } : {
          _: 'inputPaymentCredentials',
          data: {
            _: 'dataJSON',
            data: JSON.stringify(previousToken.token ? previousToken : {type: previousToken.type, id: previousToken.id})
          },
          pFlags: {
            save: previousCardDetails.save || undefined
          }
        };

        try {
          this.result = 'pending';
          const paymentResult = await this.managers.appPaymentsManager.sendPaymentForm(
            inputInvoice,
            (paymentForm as PaymentsPaymentForm).form_id,
            lastRequestedInfo?.id,
            lastShippingOption?.id,
            credentials,
            getTipsAmount()
          );

          if(paymentResult._ === 'payments.paymentResult') {
            onConfirmed();
          } else {
            popupPaymentVerification = PopupElement.createPopup(
              PopupPaymentVerification,
              paymentResult.url,
              !mediaInvoice?.extended_media
            );
            popupPaymentVerification.addEventListener('finish', () => {
              popupPaymentVerification = undefined;

              onConfirmed();
            });
            await new Promise<void>((resolve, reject) => {
              popupPaymentVerification.addEventListener('close', () => {
                popupPaymentVerification = undefined;
                if(confirmed) {
                  resolve();
                } else {
                  const err = makeError(undefined, 'payment not finished');
                  (err as ApiError).handled = true;
                  reject(err);
                  this.result = 'failed';
                }
              });
            });
          }
        } catch(err) {
          if((err as ApiError).type === 'BOT_PRECHECKOUT_TIMEOUT') {
            toastNew({langPackKey: 'Error.AnError'});
            (err as ApiError).handled = true;
          } else if((err as ApiError).type === 'TMP_PASSWORD_INVALID') {
            passwordState = lastTmpPasword = undefined;
            simulateClickEvent(payButton);
            (err as ApiError).handled = true;
          } else {
            this.result = 'failed';
          }

          throw err;
        }
      });
    };

    const onChange = () => {
      payButton.disabled = !!(acceptTermsCheckboxField && !acceptTermsCheckboxField.checked);
    };

    let payButton: HTMLButtonElement;
    if(isReceipt) {
      payButton = PaymentButton({
        onClick: () => this.hide(),
        key: 'Done'
      });
    } else {
      payButton = PaymentButton({
        onClick: onClick,
        textEl: payI18n
      });
    }

    onChange();
    if(acceptTermsCheckboxField) {
      acceptTermsCheckboxField.input.addEventListener('change', onChange);
    }

    this.body.append(this.btnConfirmOnEnter = payButton);

    this.onContentUpdate();
  }

  public static async create(options: ConstructorParameters<typeof PopupPayment>[0]) {
    let promise: Promise<PaymentsPaymentForm | PaymentsPaymentReceipt>;
    if(!options.paymentForm && !options.transaction && !options.noPaymentForm) {
      if(options.isReceipt) promise = rootScope.managers.appPaymentsManager.getPaymentReceipt(options.message.peerId, (options.message.media as MessageMedia.messageMediaInvoice).receipt_msg_id || (options.inputInvoice as InputInvoice.inputInvoiceMessage).msg_id);
      else promise = rootScope.managers.appPaymentsManager.getPaymentForm(options.inputInvoice);
    } else {
      promise = Promise.resolve(options.paymentForm);
    }

    const paymentForm = await promise;
    const constructor = options.noPaymentForm ||
      options.transaction ||
      options.giftAction ||
      paymentForm._ === 'payments.paymentFormStars' ||
      paymentForm._ === 'payments.paymentReceiptStars' ||
      paymentForm._ === 'payments.paymentFormStarGift' ? PopupStarsPay : PopupPayment;

    const popup = PopupElement.createPopup(constructor as any, options) as PopupStarsPay | PopupPayment;
    popup.setPaymentForm(paymentForm as any);

    return popup;
  }

  public static createRow(options: ConstructorParameters<typeof Row>[0]) {
    if(options.titleLangKey) {
      options.subtitleLangKey = options.titleLangKey;
    }

    options.noWrap = true;
    const row = new Row(options);
    row.container.classList.add(className + '-row');

    if(options.titleLangKey && !options.title) {
      row.subtitle.classList.add('hide');
    }

    return row;
  }

  public static getCardDetailsInfo(card: PaymentCardDetailsResult) {
    let brand: string;
    let str: string;
    let icon: string;
    if('title' in card) {
      brand = card.title.split(' ').shift();
      str = card.title;
      icon = card.icon;
    } else {
      brand = detectUnifiedCardBrand(card.cardNumber);
      str = brand + ' *' + card.cardNumber.split(' ').pop();
    }

    return {brand, str, icon};
  }
}
