/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from ".";
import Currencies from "../../config/currencies";
import { FontFamily, FontSize } from "../../config/font";
import accumulate from "../../helpers/array/accumulate";
import getTextWidth from "../../helpers/canvas/getTextWidth";
import { detectUnifiedCardBrand } from "../../helpers/cards/cardBrands";
import { attachClickEvent, simulateClickEvent } from "../../helpers/dom/clickEvent";
import findUpAsChild from "../../helpers/dom/findUpAsChild";
import findUpClassName from "../../helpers/dom/findUpClassName";
import loadScript from "../../helpers/dom/loadScript";
import placeCaretAtEnd from "../../helpers/dom/placeCaretAtEnd";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import replaceContent from "../../helpers/dom/replaceContent";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import toggleDisability from "../../helpers/dom/toggleDisability";
import { formatPhoneNumber } from "../../helpers/formatPhoneNumber";
import paymentsWrapCurrencyAmount from "../../helpers/paymentsWrapCurrencyAmount";
import ScrollSaver from "../../helpers/scrollSaver";
import tsNow from "../../helpers/tsNow";
import { AccountTmpPassword, InputPaymentCredentials, LabeledPrice, Message, MessageMedia, PaymentRequestedInfo, PaymentSavedCredentials, PaymentsPaymentForm, PaymentsPaymentReceipt, PaymentsValidatedRequestedInfo, PostAddress, ShippingOption } from "../../layer";
import I18n, { i18n, LangPackKey, _i18n } from "../../lib/langPack";
import { ApiError } from "../../lib/mtproto/apiManager";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";
import rootScope from "../../lib/rootScope";
import AvatarElement from "../avatar";
import Button from "../button";
import PeerTitle from "../peerTitle";
import { putPreloader } from "../putPreloader";
import Row from "../row";
import { toastNew } from "../toast";
import { wrapPhoto } from "../wrappers";
import wrapPeerTitle from "../wrappers/peerTitle";
import PopupPaymentCard, { PaymentCardDetails, PaymentCardDetailsResult } from "./paymentCard";
import PopupPaymentCardConfirmation from "./paymentCardConfirmation";
import PopupPaymentShipping, { PaymentShippingAddress } from "./paymentShipping";
import PopupPaymentShippingMethods from "./paymentShippingMethods";
import PopupPaymentVerification from "./paymentVerification";

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
  'logo',
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
      if(!(err as any).handled) {
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

export default class PopupPayment extends PopupElement {
  private currency: string;
  private tipButtonsMap: Map<number, HTMLElement>;

  constructor(
    private message: Message.message,
    private receiptPeerId?: PeerId,
    private receiptMsgId?: number
  ) {
    super('popup-payment', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: true
    });

    this.tipButtonsMap = new Map();
    this.d();
  }

  private async d() {
    this.element.classList.add('is-loading');
    this.show();

    let confirmed = false;
    const onConfirmed = () => {
      if(confirmed) {
        return;
      }
      
      confirmed = true;
      if(popupPaymentVerification) {
        popupPaymentVerification.hide();
      }

      this.hide();
    };

    this.listenerSetter.add(rootScope)('payment_sent', ({peerId, mid}) => {
      if(this.message.peerId === peerId && this.message.mid === mid) {
        onConfirmed();
      }
    });

    const {message} = this;
    const mediaInvoice = message.media as MessageMedia.messageMediaInvoice;

    const isReceipt = !!(this.receiptMsgId || mediaInvoice.receipt_msg_id);

    _i18n(this.title, isReceipt ? 'PaymentReceipt' : 'PaymentCheckout');
    if(mediaInvoice.pFlags.test) {
      this.title.append(' (Test)');
    }

    const className = 'payment-item';

    const itemEl = document.createElement('div');
    itemEl.classList.add(className);

    const detailsClassName = className + '-details';
    const details = document.createElement('div');
    details.classList.add(detailsClassName);

    let photoEl: HTMLElement;
    if(mediaInvoice.photo) {
      photoEl = document.createElement('div');
      photoEl.classList.add(detailsClassName + '-photo', 'media-container-contain');
      wrapPhoto({
        photo: mediaInvoice.photo,
        container: photoEl,
        boxWidth: 100,
        boxHeight: 100,
        size: {_: 'photoSizeEmpty', type: ''}
      });
      details.append(photoEl);
    }

    const linesClassName = detailsClassName + '-lines';
    const lines = document.createElement('div');
    lines.classList.add(linesClassName);

    const title = document.createElement('div');
    title.classList.add(linesClassName + '-title');

    const description = document.createElement('div');
    description.classList.add(linesClassName + '-description');

    const botName = document.createElement('div');
    botName.classList.add(linesClassName + '-bot-name');

    lines.append(title, description, botName);

    setInnerHTML(title, wrapEmojiText(mediaInvoice.title));
    setInnerHTML(description, wrapEmojiText(mediaInvoice.description));

    const peerTitle = new PeerTitle();
    botName.append(peerTitle.element);
    
    details.append(lines);
    itemEl.append(details);
    this.scrollable.append(itemEl);

    const preloaderContainer = document.createElement('div');
    preloaderContainer.classList.add(className + '-preloader-container');
    const preloader = putPreloader(preloaderContainer, true);
    this.scrollable.container.append(preloaderContainer);

    let paymentForm: PaymentsPaymentForm | PaymentsPaymentReceipt;
    
    this.receiptMsgId ??= mediaInvoice.receipt_msg_id;
    this.receiptPeerId ??= this.receiptMsgId && message.peerId;

    if(isReceipt) paymentForm = await this.managers.appPaymentsManager.getPaymentReceipt(this.receiptPeerId, this.receiptMsgId);
    else paymentForm = await this.managers.appPaymentsManager.getPaymentForm(message.peerId, message.mid);
    
    let savedInfo = (paymentForm as PaymentsPaymentForm).saved_info || (paymentForm as PaymentsPaymentReceipt).info;
    const savedCredentials = (paymentForm as PaymentsPaymentForm).saved_credentials;
    let [lastRequestedInfo, passwordState, providerPeerTitle] = await Promise.all([
      !isReceipt && savedInfo && this.managers.appPaymentsManager.validateRequestedInfo(message.peerId, message.mid, savedInfo).catch(() => undefined),
      savedCredentials && this.managers.passwordManager.getState(),
      wrapPeerTitle({peerId: paymentForm.provider_id.toPeerId()})
    ]);

    console.log(paymentForm, lastRequestedInfo);
    
    await peerTitle.update({peerId: paymentForm.bot_id.toPeerId()});
    preloaderContainer.remove();
    this.element.classList.remove('is-loading');

    const wrapAmount = (amount: string | number, skipSymbol?: boolean) => {
      return paymentsWrapCurrencyAmount(amount, currency, skipSymbol);
    };

    const {invoice} = paymentForm;
    const currency = this.currency = invoice.currency;

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
        _label.left.textContent = label;
  
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

    const canTip = (invoice.max_tip_amount !== undefined && !isReceipt) || !!(paymentForm as PaymentsPaymentReceipt).tip_amount;
    if(canTip) {
      const tipsClassName = className + '-tips';

      const currencyData = Currencies[currency];

      getTipsAmount = () => +getInputValue().replace(/\D/g, '');

      const getInputValue = () => {
        // return input.textContent;
        return input.value;
      };

      const setInputWidth = () => {
        const width = getTextWidth(getInputValue(), `500 ${FontSize} ${FontFamily}`);
        input.style.width = width + 'px';
      };

      const setInputValue = (amount: string | number) => {
        amount = Math.min(+amount, +invoice.max_tip_amount);
        const wrapped = wrapAmount(amount, true);
        
        input.value = wrapped;
        // input.textContent = wrapped;
        if(document.activeElement === input) {
          placeCaretAtEnd(input);
        }

        unsetActiveTip && unsetActiveTip();
        const tipEl = this.tipButtonsMap.get(amount);
        if(tipEl) {
          tipEl.classList.add('active');
        }

        setInputWidth();
        setTotal();
      };

      const tipsLabel = makeLabel();
      _i18n(tipsLabel.left, isReceipt ? 'PaymentTip' : 'PaymentTipOptional');
      const input = document.createElement('input');
      input.type = 'tel';
      // const input: HTMLElement = document.createElement('div');
      // input.contentEditable = 'true';
      input.classList.add('input-clear', tipsClassName + '-input');
      tipsLabel.right.append(input);

      if(!isReceipt) {
        tipsLabel.label.style.cursor = 'text';
      } else {
        tipsLabel.label.classList.add('disable-hover');
      }

      tipsLabel.label.addEventListener('mousedown', (e) => {
        if(!findUpAsChild(e.target, input)) {
          placeCaretAtEnd(input);
        }
      });

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

      input.addEventListener('input', () => {
        setInputValue(getTipsAmount());
      });

      let s = [currencyData.symbol, currencyData.space_between ? ' ' : ''];
      if(!currencyData.symbol_left) s.reverse();
      tipsLabel.right[currencyData.symbol_left ? 'prepend' : 'append'](s.join(''));

      pricesElements.push(tipsLabel.label);

      /// 
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
        setInputValue((paymentForm as PaymentsPaymentReceipt).tip_amount);
      }
    } else {
      setTotal();
    }

    pricesElements.push(totalLabel.label);

    prices.append(...pricesElements);
    itemEl.append(prices);

    ///

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
    };

    const createRow = (options: ConstructorParameters<typeof Row>[0]) => {
      if(options.titleLangKey) {
        options.subtitleLangKey = options.titleLangKey;
      }

      options.noWrap = true;
      const row = new Row(options);
      row.container.classList.add(className + '-row');

      if(options.titleLangKey) {
        row.subtitle.classList.add('hide');
      }

      return row;
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

      methodRow.title.classList.remove('tgico', 'tgico-card_outline');
      setRowIcon(methodRow, icon || brand.toLowerCase());
      setRowTitle(methodRow, str);
    };

    const onMethodClick = () => {
      new PopupPaymentCard(paymentForm as PaymentsPaymentForm, previousCardDetails as PaymentCardDetails).addEventListener('finish', ({token, card}) => {
        previousToken = token, previousCardDetails = card;

        setCardSubtitle(card);
      });
    };

    let previousCardDetails: PaymentCardDetailsResult, previousToken: PaymentsCredentialsToken;
    const methodRow = createRow({
      titleLangKey: 'PaymentCheckoutMethod',
      clickable: isReceipt ? undefined : onMethodClick,
      icon: 'card_outline'
    });

    methodRow.container.classList.add(className + '-method-row');

    if(savedCredentials) {
      setCardSubtitle(savedCredentials);
    } else if((paymentForm as PaymentsPaymentReceipt).credentials_title) {
      setCardSubtitle({title: (paymentForm as PaymentsPaymentReceipt).credentials_title});
    }

    const providerRow = createRow({
      title: providerPeerTitle,
      subtitleLangKey: 'PaymentCheckoutProvider'
    });

    const providerAvatar = new AvatarElement();
    providerAvatar.classList.add('avatar-32');
    providerRow.createMedia('small').append(providerAvatar);
    /* await */ providerAvatar.updateWithOptions({peerId: paymentForm.provider_id.toPeerId()});

    let shippingAddressRow: Row, shippingNameRow: Row, shippingEmailRow: Row, shippingPhoneRow: Row, shippingMethodRow: Row;
    let lastShippingOption: ShippingOption, onShippingAddressClick: (focus?: ConstructorParameters<typeof PopupPaymentShipping>[2]) => void, onShippingMethodClick: () => void;
    const setShippingTitle = invoice.pFlags.shipping_address_requested ? (shippingAddress?: PaymentShippingAddress) => {
      if(!shippingAddress) {
        shippingMethodRow.subtitle.classList.add('hide');
        replaceContent(shippingMethodRow.title, i18n('PaymentShippingAddress'));
        return;
      }

      const postAddress = shippingAddress.shipping_address;
      setRowTitle(shippingAddressRow, [postAddress.city, postAddress.street_line1, postAddress.street_line2].filter(Boolean).join(', '));

      shippingMethodRow.container.classList.toggle('hide', !lastRequestedInfo && !isReceipt);
    } : undefined;

    const setShippingInfo = (info: PaymentRequestedInfo) => {
      setShippingTitle && setShippingTitle(info);
      shippingNameRow && setRowTitle(shippingNameRow, info.name);
      shippingEmailRow && setRowTitle(shippingEmailRow, info.email);
      shippingPhoneRow && setRowTitle(shippingPhoneRow, info.phone && ('+' + formatPhoneNumber(info.phone).formatted));
    };

    if(!isReceipt) {
      onShippingAddressClick = (focus) => {
        new PopupPaymentShipping(paymentForm as PaymentsPaymentForm, message, focus).addEventListener('finish', ({shippingAddress, requestedInfo}) => {
          lastRequestedInfo = requestedInfo;
          savedInfo = (paymentForm as PaymentsPaymentForm).saved_info = shippingAddress;
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

      shippingAddressRow = createRow({
        icon: 'location',
        titleLangKey: 'PaymentShippingAddress',
        clickable: !isReceipt && onShippingAddressClick.bind(null, undefined)
      });
      
      let lastShippingPricesElements: HTMLElement[];
      shippingMethodRow = createRow({
        icon: 'shipping',
        titleLangKey: 'PaymentCheckoutShippingMethod',
        clickable: !isReceipt && (onShippingMethodClick = () => {
          new PopupPaymentShippingMethods(paymentForm as PaymentsPaymentForm, lastRequestedInfo, lastShippingOption).addEventListener('finish', (shippingOption) => {
            setShippingOption(shippingOption);
          });
        })
      });

      shippingMethodRow.container.classList.add('hide');

      const shippingOption = (paymentForm as PaymentsPaymentReceipt).shipping;
      if(shippingOption) {
        setShippingOption(shippingOption);
      }
    }

    if(invoice.pFlags.name_requested) {
      shippingNameRow = createRow({
        icon: 'newprivate',
        titleLangKey: 'PaymentCheckoutName',
        clickable: !isReceipt && onShippingAddressClick.bind(null, 'name')
      });
    }

    if(invoice.pFlags.email_requested) {
      shippingEmailRow = createRow({
        icon: 'mention',
        titleLangKey: 'PaymentShippingEmailPlaceholder',
        clickable: !isReceipt && onShippingAddressClick.bind(null, 'email')
      });
    }

    if(invoice.pFlags.phone_requested) {
      shippingPhoneRow = createRow({
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
      shippingPhoneRow,
    ].filter(Boolean);
    this.scrollable.append(...[
      document.createElement('hr'),
      ...rows.map((row) => row.container)
    ].filter(Boolean));
    
    ///
    let popupPaymentVerification: PopupPaymentVerification, lastTmpPasword: AccountTmpPassword;
    const onClick = () => {
      const missingInfo = invoice.pFlags.name_requested && !savedInfo?.name ? 'name' : (invoice.pFlags.email_requested && !savedInfo?.email ? 'email' : (invoice.pFlags.phone_requested && !savedInfo?.phone ? 'phone' : undefined));
      if(invoice.pFlags.shipping_address_requested) {
        if(!lastRequestedInfo) {
          onShippingAddressClick();
          return;
        } else if(!lastShippingOption) {
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
          new PopupPaymentCardConfirmation(savedCredentials.title, _passwordState).addEventListener('finish', (tmpPassword) => {
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
          const paymentResult = await this.managers.appPaymentsManager.sendPaymentForm(
            message.peerId, 
            message.mid, 
            (paymentForm as PaymentsPaymentForm).form_id, 
            lastRequestedInfo?.id, 
            lastShippingOption?.id, 
            credentials, 
            getTipsAmount()
          );
  
          if(paymentResult._ === 'payments.paymentResult') {
            onConfirmed();
          } else {
            popupPaymentVerification = new PopupPaymentVerification(paymentResult.url);
            popupPaymentVerification.addEventListener('finish', () => {
              popupPaymentVerification = undefined;

              // setTimeout(() => {
                onConfirmed();
              // }, 0);
            });
            await new Promise<void>((resolve, reject) => {
              popupPaymentVerification.addEventListener('close', () => {
                popupPaymentVerification = undefined;
                if(confirmed) {
                  resolve();
                } else {
                  const err = new Error('payment not finished');
                  (err as ApiError).handled = true;
                  reject(err);
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
          }

          throw err;
        }
      });
    };

    let payButton: HTMLElement;
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

    this.body.append(this.btnConfirmOnEnter = payButton);

    this.onContentUpdate();
  }
}
