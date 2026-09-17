import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {Component, createEffect, createMemo, createRoot, createSignal, For, JSX, Show, Signal} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import Currencies from '@config/currencies';
import {FontFamily, FontFull, FontSize} from '@config/font';
import accumulate from '@helpers/array/accumulate';
import {getAppWindow} from '@helpers/appWindow';
import assumeType from '@helpers/assumeType';
import classNames from '@helpers/string/classNames';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {detectUnifiedCardBrand} from '@helpers/cards/cardBrands';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import makeError from '@helpers/makeError';
import {makeMediaSize} from '@helpers/mediaSize';
import safeAssign from '@helpers/object/safeAssign';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import ScrollSaver from '@helpers/scrollSaver';
import tsNow from '@helpers/tsNow';
import {AccountTmpPassword, Boost, ChatInvite, DocumentAttribute, InputInvoice, InputPaymentCredentials, LabeledPrice, Message, MessageAction, MessageMedia, PaymentRequestedInfo, PaymentSavedCredentials, PaymentsPaymentForm, PaymentsPaymentReceipt, PaymentsValidatedRequestedInfo, PostAddress, ShippingOption, StarsSubscription, StarsTransaction, User, WebDocument} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import {NULL_PEER_ID} from '@appManagers/constants';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {avatarNew} from '@components/avatarNew';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {putPreloader} from '@components/putPreloader';
import Row from '@components/rowTsx';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import wrapPhoto from '@components/wrappers/photo';
import showPaymentCardPopup, {PaymentCardDetails, PaymentCardDetailsResult} from '@components/popups/paymentCard';
import showPaymentCardConfirmationPopup from '@components/popups/paymentCardConfirmation';
import showPaymentMethodsPopup from '@components/popups/paymentMethods';
import showPaymentShippingPopup, {PaymentShippingAddress} from '@components/popups/paymentShipping';
import showPaymentShippingMethodsPopup from '@components/popups/paymentShippingMethods';
import showPaymentVerificationPopup from '@components/popups/paymentVerification';
import type showStarsPopup from '@components/popups/stars';
import showStarsPayPopup from '@components/popups/starsPay';

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

export type PaymentsCredentialsToken = {type: 'card', token?: string, id?: string};

export type PopupPaymentResult = 'paid' | 'cancelled' | 'pending' | 'failed';

/**
 * What {@link createPaymentPopup} hands back — the card flow and the Stars one are separate popups,
 * so callers see only what they both have: the `finish` event.
 */
export type PopupPaymentHandle = {
  addEventListener(name: 'finish', callback: (result: PopupPaymentResult) => void): void
};

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
        getAppWindow().document.addEventListener('selectionchange', onSelectionChange);
      }, 0);
    };

    const onFocusOut = () => {
      input.addEventListener('focus', onFocus, {once: true});
      getAppWindow().document.removeEventListener('selectionchange', onSelectionChange);
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
    if(this.input.ownerDocument.activeElement === this.input) {
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

type PaymentRowState = {
  title: Signal<JSX.Element>,
  subtitleVisible: Signal<boolean>,
  media: Signal<JSX.Element>,
  hidden: Signal<boolean>
};

const createPaymentRowState = (options: {
  title?: JSX.Element,
  subtitleVisible?: boolean,
  hidden?: boolean
} = {}): PaymentRowState => ({
  title: createSignal<JSX.Element>(options.title || ''),
  subtitleVisible: createSignal(options.subtitleVisible ?? !!options.title),
  media: createSignal<JSX.Element>(),
  hidden: createSignal(!!options.hidden)
});

/** The invoice illustration: a `WebDocument` the photo wrapper fills the container with. */
const PaymentItemPhoto = (props: {photo: WebDocument}) => {
  const boxSize = makeMediaSize(100, 100);
  const sizeAttribute = props.photo.attributes.find(
    (attribute) => attribute._ === 'documentAttributeImageSize'
  ) as DocumentAttribute.documentAttributeImageSize;
  const fittedSize = sizeAttribute && makeMediaSize(sizeAttribute.w, sizeAttribute.h).aspectFitted(boxSize);

  return (
    <div
      class={`${className}-details-photo media-container-contain`}
      style={fittedSize && {width: fittedSize.width + 'px', height: fittedSize.height + 'px'}}
      ref={(container) => wrapPhoto({
        photo: props.photo,
        container,
        boxWidth: boxSize.width,
        boxHeight: boxSize.height,
        size: {_: 'photoSizeEmpty', type: ''}
      })}
    />
  );
};

const PaymentRow = (props: {
  state: PaymentRowState,
  label: LangPackKey,
  labelArgs?: any[],
  icon?: Icon,
  clickable?: (event: MouseEvent) => void,
  class?: string,
  mediaClass?: string
}) => (
  <Row
    class={`${className}-row${props.class ? ' ' + props.class : ''}`}
    classList={{hide: props.state.hidden[0]()}}
    clickable={props.clickable}
    noWrap
  >
    <Show when={props.state.media[0]()} fallback={props.icon && <Row.Icon icon={props.icon} />}>
      {(media) => <Row.Media size="small" class={props.mediaClass}>{media()}</Row.Media>}
    </Show>
    <Row.Title>{props.state.title[0]() || i18n(props.label, props.labelArgs)}</Row.Title>
    <Row.Subtitle class={props.state.subtitleVisible[0]() ? undefined : 'hide'}>
      {i18n(props.label, props.labelArgs)}
    </Row.Subtitle>
  </Row>
);

import {getMiddleware} from '@helpers/middleware';
import EventListenerBase from '@helpers/eventListenerBase';
import ListenerSetter from '@helpers/listenerSetter';
import {ScrollableContextValue} from '@components/scrollable2';
import {onCleanup} from 'solid-js';
import Section from '@components/section';

export type PopupPaymentOptions = {
  message?: Message.message,
  inputInvoice?: InputInvoice,
  paymentForm?: PaymentsPaymentForm | PaymentsPaymentReceipt,
  isReceipt?: boolean,

  // * stars only
  isTopUp?: boolean,
  transaction?: StarsTransaction,
  ledgerPeerId?: PeerId,
  paidMedia?: MessageMedia.messageMediaPaidMedia,
  chatInvite?: ChatInvite.chatInvite,
  noPaymentForm?: boolean,
  subscription?: StarsSubscription,
  giftAction?: MessageAction.messageActionGiftStars,
  boost?: Boost,
  giftPeerId?: PeerId,
  noShowIfStars?: boolean,
  purpose?: Parameters<typeof showStarsPopup>[0]['purpose']
};

export default function showPaymentPopup(options: PopupPaymentOptions): PopupPaymentHandle {
  const emitter: PopupPaymentHandle & EventListenerBase<{finish: (result: PopupPaymentResult) => void}> =
    new EventListenerBase() as any;
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const inputInvoice = options.inputInvoice;

  const [show, setShow] = createSignal(true);
  const [loading, setLoading] = createSignal(true);
  const [titleKey, setTitleKey] = createSignal<LangPackKey>('PaymentCheckout');
  const [titleSuffix, setTitleSuffix] = createSignal('');
  const [scrollableRef, setScrollableRef] = createSignal<ScrollableContextValue>();
  // the pay button only exists once the form has resolved; its label is a node the total rewrites in place
  const [payButton, setPayButton] = createSignal<{
    callback: () => MaybePromise<boolean | void>,
    label: () => JSX.Element
  }>();
  const [payDisabled, setPayDisabled] = createSignal(false);
  let payButtonElement: HTMLButtonElement;

  const paymentForm = options.paymentForm;
  let result: PopupPaymentResult = 'cancelled';
  let opened = false;
  // The form resolves in two stages, so the content does too: the item itself is known from the
  // invoice and renders right away, everything priced waits for the server. Both are components
  // rather than elements — `build` defines them, the popup instantiates them under its own owner.
  const [item, setItem] = createSignal<{
    photo?: WebDocument,
    title: string,
    description: string,
    botPeerId: PeerId
  }>();
  const [Prices, setPrices] = createSignal<Component>();
  const [Rows, setRows] = createSignal<Component>();

  function openPopup() {
    if(opened) return;
    opened = true;

    createPopup(() => {
      onCleanup(() => {
        listenerSetter.removeAll();
        middlewareHelper.destroy();
      });

      return (
        <PopupElement
          class={'popup-payment' + (loading() ? ' is-loading' : '')}
          closable
          show={show()}
          onClose={() => emitter.dispatchEvent('finish', result)}
        >
          <PopupElement.Header>
            <PopupElement.CloseButton />
            <PopupElement.Title>{i18n(titleKey())}{titleSuffix()}</PopupElement.Title>
          </PopupElement.Header>
          <PopupElement.Scrollable contextRef={setScrollableRef}>
            <PopupElement.Body>
              <Show when={item()}>
                {(item) => (
                  <Section>
                    <div class={className}>
                      <div class={`${className}-details`}>
                        <Show when={item().photo}>
                          {(photo) => <PaymentItemPhoto photo={photo()} />}
                        </Show>
                        <div class={`${className}-details-lines`}>
                          <div class={`${className}-details-lines-title`}>{wrapEmojiText(item().title)}</div>
                          <div class={`${className}-details-lines-description`}>{wrapEmojiText(item().description)}</div>
                          <div class={`${className}-details-lines-bot-name`}>
                            <PeerTitleTsx peerId={item().botPeerId} />
                          </div>
                        </div>
                      </div>
                      <Show when={Prices()} keyed>
                        {(Prices) => <Dynamic component={Prices} />}
                      </Show>
                    </div>
                  </Section>
                )}
              </Show>
              <Show when={loading()}>
                <div class={`${className}-preloader-container`}>{putPreloader(undefined, true)}</div>
              </Show>
              <Show when={Rows()} keyed>
                {(Rows) => (
                  <Section>
                    <Dynamic component={Rows} />
                  </Section>
                )}
              </Show>
            </PopupElement.Body>
          </PopupElement.Scrollable>
          <Show when={payButton()}>
            <PopupElement.Footer>
              <PopupElement.FooterButton
                confirm
                preloader
                pendingLangKey="PleaseWait"
                disabled={payDisabled()}
                callback={payButton().callback}
                ref={(element) => payButtonElement = element}
              >
                {payButton().label()}
              </PopupElement.FooterButton>
            </PopupElement.Footer>
          </Show>
        </PopupElement>
      );
    });
  }

  async function build() {
    setLoading(true);
    openPopup();

    let confirmed = false;
    const onConfirmed = () => {
      if(confirmed) {
        return;
      }

      result = 'paid';
      confirmed = true;
      hideVerification?.();

      setShow(false);
    };

    const {message} = options;
    if(paymentForm._ === 'payments.paymentFormStarGift') {
      throw new Error('not implemented');
    }

    if(message) {
      listenerSetter.add(rootScope)('payment_sent', ({peerId, mid}) => {
        if(message.peerId === peerId && message.mid === mid) {
          onConfirmed();
        }
      });
    }

    const mediaInvoice = message?.media as MessageMedia.messageMediaInvoice;
    const isReceipt = options.isReceipt ??
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

    setTitleKey(isReceipt ? 'PaymentReceipt' : 'PaymentCheckout');
    if(isTest) {
      setTitleSuffix(' (Test)');
    }

    setItem({photo, title, description, botPeerId: paymentForm.bot_id.toPeerId()});

    let savedInfo = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_info || (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).info;
    const savedCredentials = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_credentials?.[0];
    let [
      lastRequestedInfo,
      passwordState,
      providerPeerTitle
    ] = await Promise.all([
      !isReceipt && savedInfo && rootScope.managers.appPaymentsManager.validateRequestedInfo(inputInvoice, savedInfo).catch((err: ApiError) => {
        console.error('validateRequestedInfo', err, savedInfo);
        // savedInfo = undefined;
        return undefined as PaymentsValidatedRequestedInfo;
      }),
      savedCredentials && rootScope.managers.passwordManager.getState(),
      wrapPeerTitle({peerId: isStars ? NULL_PEER_ID : (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).provider_id.toPeerId()})
    ]);

    // console.log(paymentForm, lastRequestedInfo);

    const wrapAmount = (amount: string | number, skipSymbol?: boolean) => {
      return paymentsWrapCurrencyAmount(amount, currency, skipSymbol, USE_NATIVE_SYMBOL, true);
    };

    const {invoice} = paymentForm;
    const currency = invoice.currency;

    const isRecurring = invoice.pFlags.recurring && !isReceipt;
    const hasTerms = !!invoice.terms_url;

    const peerTitle2 = isRecurring || hasTerms ? await wrapPeerTitle({peerId: paymentForm.bot_id.toPeerId()}) : undefined;
    setLoading(false);

    const totalAmount = accumulate(invoice.prices.map(({amount}) => +amount), 0);
    const canTip = (invoice.max_tip_amount !== undefined && !isReceipt) ||
      !!(paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).tip_amount;

    // What the server prices (the invoice) does not cover: the chosen shipping option and the tip.
    // Both feed the total, and the total feeds the pay button's label.
    const [shippingPrices, setShippingPrices] = createSignal<LabeledPrice[]>([]);
    const [tipAmount, setTipAmount] = createSignal(0);

    const getShippingAmount = () => accumulate(shippingPrices().map(({amount}) => +amount), 0);
    const getTipsAmount = () => canTip ? tipAmount() : 0;
    const getTotalTotal = () => totalAmount + getTipsAmount() + getShippingAmount();

    // The tip is typed into a plain input that keeps the caret pinned to the end, so the input owns
    // the text and the signal mirrors it — every write goes through here.
    const inputRightNumber = canTip ? new InputRightNumber({fontWeight: 500}) : undefined;
    const setTip = (amount: number) => {
      amount = Math.min(+amount, +invoice.max_tip_amount);
      inputRightNumber.value = wrapAmount(amount, true);
      setTipAmount(amount);
    };

    if(canTip) {
      inputRightNumber.input.classList.add('input-clear', `${className}-tips-input`);
      inputRightNumber.input.addEventListener('input', () => {
        setTip(+inputRightNumber.value.replace(/\D/g, ''));
      });

      setTip(isReceipt ? +(paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).tip_amount : 0);
    }

    // the tip is typed without its currency, so the symbol sits next to the input on the side the
    // currency puts it, with the currency's own spacing
    const currencyData = Currencies[currency];
    const symbolParts = [
      USE_NATIVE_SYMBOL ? currencyData.native || currencyData.symbol : currencyData.symbol,
      currencyData.space_between ? ' ' : ''
    ];
    if(!currencyData.symbol_left) symbolParts.reverse();
    const currencySymbol = symbolParts.join('');

    const PriceLine = (props: {label: JSX.Element, amount: JSX.Element, class?: string}) => (
      <div class={classNames(`${className}-prices-price`, props.class)}>
        <span>{props.label}</span>
        <span>{props.amount}</span>
      </div>
    );

    setPrices(() => () => (
      <div class={`${className}-prices`}>
        <For each={[...invoice.prices, ...shippingPrices()]}>
          {(price) => <PriceLine label={wrapEmojiText(price.label)} amount={wrapAmount(price.amount)} />}
        </For>
        <Show when={canTip}>
          <div
            class={classNames(`${className}-prices-price`, isReceipt && 'disable-hover')}
            style={isReceipt ? undefined : {cursor: 'text'}}
            onMouseDown={(e) => {
              if(!findUpAsChild(e.target as HTMLElement, inputRightNumber.input)) {
                placeCaretAtEnd(inputRightNumber.input);
              }
            }}
          >
            <span>{i18n(isReceipt ? 'PaymentTip' : 'PaymentTipOptional')}</span>
            <span>
              {currencyData.symbol_left && currencySymbol}
              {inputRightNumber.input}
              {!currencyData.symbol_left && currencySymbol}
            </span>
          </div>
          <Show when={!isReceipt}>
            <div class={`${className}-tips`}>
              <For each={invoice.suggested_tip_amounts}>
                {(suggested) => (
                  <button
                    class={`${className}-tips-tip`}
                    classList={{active: tipAmount() === +suggested}}
                    onClick={() => setTip(tipAmount() === +suggested ? 0 : +suggested)}
                  >{wrapAmount(suggested)}</button>
                )}
              </For>
            </div>
          </Show>
        </Show>
        <PriceLine
          class="is-total"
          label={i18n('PaymentTransactionTotal')}
          amount={wrapAmount(getTotalTotal())}
        />
      </div>
    ));

    // /

    // The brand logo is swapped in only once it has decoded, so the row never flashes a blank box.
    const setRowIcon = async(row: PaymentRowState, icon?: string) => {
      const img = new Image();
      img.classList.add('media-photo');
      await renderImageFromUrlPromise(img, getPaymentBrandIconPath(icon));
      row.media[1](img);
    };

    const setRowTitle = (row: PaymentRowState, title: JSX.Element) => {
      row.title[1](title || '');
      row.subtitleVisible[1](!!title);
    };

    const setCardSubtitle = (card: PaymentCardDetailsResult) => {
      const {brand, str, icon} = getCardDetailsInfo(card);

      setRowIcon(methodRow, icon || brand.toLowerCase());
      setRowTitle(methodRow, str);
    };

    const onMethodClick = async() => {
      const user = useUser(rootScope.myId) as User.user;
      assumeType<PaymentsPaymentForm.paymentsPaymentForm>(paymentForm);

      // whichever popup takes the card details answers the same way
      const onFinish = ({token, card}: {token: PaymentsCredentialsToken, card: PaymentCardDetailsResult}) => {
        previousToken = token, previousCardDetails = card;

        setCardSubtitle(card);
      };

      if(paymentForm.additional_methods) {
        showPaymentMethodsPopup({
          paymentForm,
          user,
          savedCard: previousCardDetails as PaymentCardDetails,
          onFinish
        });
      } else {
        showPaymentCardPopup({
          paymentForm,
          user,
          savedCard: previousCardDetails as PaymentCardDetails,
          onFinish
        });
      }
    };

    let previousCardDetails: PaymentCardDetailsResult, previousToken: PaymentsCredentialsToken;
    const methodRow = createPaymentRowState();

    if(savedCredentials) {
      setCardSubtitle(savedCredentials);
    } else if((paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).credentials_title) {
      setCardSubtitle({title: (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).credentials_title});
    }

    const providerRow = createPaymentRowState({title: providerPeerTitle});

    const providerAvatar = avatarNew({
      middleware: middleware,
      size: 32,
      peerId: isStars ? NULL_PEER_ID : (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).provider_id.toPeerId()
    });
    providerRow.media[1](providerAvatar.node);

    let shippingAddressRow: PaymentRowState, shippingNameRow: PaymentRowState, shippingEmailRow: PaymentRowState, shippingPhoneRow: PaymentRowState, shippingMethodRow: PaymentRowState;
    let lastShippingOption: ShippingOption, onShippingAddressClick: (focus?: Parameters<typeof showPaymentShippingPopup>[0]['focus']) => void, onShippingMethodClick: () => void;
    const setShippingTitle = invoice.pFlags.shipping_address_requested ? (shippingAddress?: PaymentShippingAddress) => {
      if(!shippingAddress) {
        shippingMethodRow.title[1](i18n('PaymentShippingAddress'));
        shippingMethodRow.subtitleVisible[1](false);
        return;
      }

      const postAddress = shippingAddress.shipping_address;
      setRowTitle(shippingAddressRow, [
        postAddress.city,
        postAddress.street_line1,
        postAddress.street_line2
      ].filter(Boolean).join(', '));

      shippingMethodRow.hidden[1](!lastRequestedInfo?.shipping_options && !isReceipt);
    } : undefined;

    const setShippingInfo = (info: PaymentRequestedInfo) => {
      setShippingTitle && setShippingTitle?.(info);
      shippingNameRow && setRowTitle(shippingNameRow, info.name);
      shippingEmailRow && setRowTitle(shippingEmailRow, info.email);
      shippingPhoneRow && setRowTitle(shippingPhoneRow, info.phone && ('+' + formatPhoneNumber(info.phone).formatted));
    };

    if(!isReceipt) {
      onShippingAddressClick = (focus) => {
        showPaymentShippingPopup({
          paymentForm: paymentForm as PaymentsPaymentForm.paymentsPaymentForm,
          inputInvoice,
          focus,
          onFinish: ({shippingAddress, requestedInfo}) => {
            lastRequestedInfo = requestedInfo;
            savedInfo = (paymentForm as PaymentsPaymentForm.paymentsPaymentForm).saved_info = shippingAddress;
            setShippingInfo(shippingAddress);
          }
        });
      };
    }

    if(invoice.pFlags.shipping_address_requested) {
      // The rows appear above the fold, so adding them would push the content the user is looking at.
      const setShippingOption = (shippingOption?: ShippingOption) => {
        const scrollSaver = new ScrollSaver(scrollableRef()?.container as any, undefined, true);
        scrollSaver.save();

        if(shippingOption) {
          lastShippingOption = shippingOption;
          setRowTitle(shippingMethodRow, shippingOption.title);
        }

        setShippingPrices(shippingOption ? shippingOption.prices : []);

        scrollSaver.restore();
        scrollableRef()?.onSizeChange();
      };

      shippingAddressRow = createPaymentRowState();

      shippingMethodRow = createPaymentRowState({hidden: true});
      onShippingMethodClick = () => {
        showPaymentShippingMethodsPopup({
          paymentForm: paymentForm as PaymentsPaymentForm,
          requestedInfo: lastRequestedInfo,
          shippingOption: lastShippingOption,
          onFinish: (shippingOption) => {
            setShippingOption(shippingOption);
          }
        });
      };

      const shippingOption = (paymentForm as PaymentsPaymentReceipt.paymentsPaymentReceipt).shipping;
      if(shippingOption) {
        setShippingOption(shippingOption);
      }
    }

    if(invoice.pFlags.name_requested) {
      shippingNameRow = createPaymentRowState();
    }

    if(invoice.pFlags.email_requested) {
      shippingEmailRow = createPaymentRowState();
    }

    if(invoice.pFlags.phone_requested) {
      shippingPhoneRow = createPaymentRowState();
    }

    if(savedInfo) {
      setShippingInfo(savedInfo);
    }

    const acceptTermsSignal = createSignal(!(!isReceipt && (isRecurring || hasTerms)));

    setRows(() => () => (
      <div>
          <PaymentRow
            state={methodRow}
            label="PaymentCheckoutMethod"
            icon="card_filled"
            class={`${className}-method-row`}
            mediaClass="media-container-cover"
            clickable={isReceipt ? undefined : onMethodClick}
          />
          <PaymentRow state={providerRow} label="PaymentCheckoutProvider" />
          <Show when={shippingAddressRow}>
            <PaymentRow
              state={shippingAddressRow}
              label="PaymentShippingAddress"
              icon="location_filled"
              clickable={isReceipt ? undefined : onShippingAddressClick.bind(null, undefined)}
            />
          </Show>
          <Show when={shippingMethodRow}>
            <PaymentRow
              state={shippingMethodRow}
              label="PaymentCheckoutShippingMethod"
              icon="shipping"
              clickable={isReceipt ? undefined : onShippingMethodClick}
            />
          </Show>
          <Show when={shippingNameRow}>
            <PaymentRow
              state={shippingNameRow}
              label="PaymentCheckoutName"
              icon="newprivate_filled"
              clickable={isReceipt ? undefined : onShippingAddressClick.bind(null, 'name')}
            />
          </Show>
          <Show when={shippingEmailRow}>
            <PaymentRow
              state={shippingEmailRow}
              label="PaymentShippingEmailPlaceholder"
              icon="mention_filled"
              clickable={isReceipt ? undefined : onShippingAddressClick.bind(null, 'email')}
            />
          </Show>
          <Show when={shippingPhoneRow}>
            <PaymentRow
              state={shippingPhoneRow}
              label="PaymentCheckoutPhoneNumber"
              icon="phone_filled"
              clickable={isReceipt ? undefined : onShippingAddressClick.bind(null, 'phone')}
            />
          </Show>
          <Show when={!isReceipt && (isRecurring || hasTerms)}>
            <hr />
            <Row class={`${className}-row`} noWrap>
              <Row.CheckboxField>
                <CheckboxFieldTsx signal={acceptTermsSignal} />
              </Row.CheckboxField>
              <Row.Title>{i18n(
                isRecurring ? 'Payments.Recurrent.Accept' : 'Payments.Terms.Accept',
                [wrapRichText(invoice.terms_url), peerTitle2]
              )}</Row.Title>
            </Row>
        </Show>
      </div>
    ));

    // /
    let hideVerification: () => void, lastTmpPasword: AccountTmpPassword;
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

        Promise.resolve(passwordState ?? rootScope.managers.passwordManager.getState()).then((_passwordState) => {
          showPaymentCardConfirmationPopup({
            card: savedCredentials.title,
            passwordState: _passwordState,
            onFinish: (tmpPassword) => {
              passwordState = undefined;
              lastTmpPasword = tmpPassword;
              simulateClickEvent(payButtonElement);

              // * reserve 5 seconds
              const diff = tmpPassword.valid_until - tsNow(true) - 5;
              setTimeout(() => {
                if(lastTmpPasword === tmpPassword) {
                  lastTmpPasword = undefined;
                }
              }, diff * 1000);
            }
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
          result = 'pending';
          const paymentResult = await rootScope.managers.appPaymentsManager.sendPaymentForm(
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
            await new Promise<void>((resolve, reject) => {
              hideVerification = showPaymentVerificationPopup({
                url: paymentResult.url,
                openPathAfter: !mediaInvoice?.extended_media,
                onFinish: () => {
                  hideVerification = undefined;
                  onConfirmed();
                },
                onClose: () => {
                  hideVerification = undefined;
                  if(confirmed) {
                    resolve();
                  } else {
                    const err = makeError(undefined, 'payment not finished');
                    (err as ApiError).handled = true;
                    reject(err);
                    result = 'failed';
                  }
                }
              }).hide;
            });
          }
        } catch(err) {
          if((err as ApiError).type === 'BOT_PRECHECKOUT_TIMEOUT') {
            toastNew({langPackKey: 'Error.AnError'});
            (err as ApiError).handled = true;
          } else if((err as ApiError).type === 'TMP_PASSWORD_INVALID') {
            passwordState = lastTmpPasword = undefined;
            simulateClickEvent(payButtonElement);
            (err as ApiError).handled = true;
          } else {
            result = 'failed';
          }

          throw err;
        }
      });
    };

    const onChange = () => {
      setPayDisabled(!acceptTermsSignal[0]());
    };

    if(isReceipt) {
      setPayButton({callback: () => {}, label: () => i18n('Done')});
    } else {
      setPayButton({
        // the missing-info branches open a sub-popup rather than pay, and checkout has to stay up
        callback: () => {
          const result = onClick();
          return result instanceof Promise ? result : false;
        },
        label: () => i18n('PaymentCheckoutPay', [wrapAmount(getTotalTotal())])
      });
    }

    onChange();
    if(!isReceipt && (isRecurring || hasTerms)) {
      createRoot((dispose) => {
        middlewareHelper.onDestroy(dispose);
        createEffect(onChange);
      });
    }

    scrollableRef()?.onSizeChange();
  }

  build().catch((err) => {
    console.error('payment popup error', err);
    setShow(false);
  });

  return emitter;
}

export async function createPaymentPopup(options: PopupPaymentOptions): Promise<PopupPaymentHandle> {
  let promise: Promise<PaymentsPaymentForm | PaymentsPaymentReceipt>;
  if(!options.paymentForm && !options.transaction && !options.noPaymentForm) {
    if(options.isReceipt) promise = rootScope.managers.appPaymentsManager.getPaymentReceipt(options.message.peerId, (options.message.media as MessageMedia.messageMediaInvoice).receipt_msg_id || (options.inputInvoice as InputInvoice.inputInvoiceMessage).msg_id);
    else promise = rootScope.managers.appPaymentsManager.getPaymentForm(options.inputInvoice);
  } else {
    promise = Promise.resolve(options.paymentForm);
  }

  const paymentForm = await promise;
  const isStars = options.noPaymentForm ||
    options.transaction ||
    options.giftAction ||
    paymentForm._ === 'payments.paymentFormStars' ||
    paymentForm._ === 'payments.paymentReceiptStars' ||
    paymentForm._ === 'payments.paymentFormStarGift';

  if(isStars) {
    return showStarsPayPopup({...options, paymentForm}) as PopupPaymentHandle;
  }

  return showPaymentPopup({...options, paymentForm});
}

export function getCardDetailsInfo(card: PaymentCardDetailsResult) {
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
