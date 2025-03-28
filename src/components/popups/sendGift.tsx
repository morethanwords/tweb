import bigInt from 'big-integer';
import PopupElement from '.';
import {Chat, InputInvoice, Message, MessageAction, MessageEntity, PremiumGiftCodeOption, StarGift, StarsTransaction, TextWithEntities, User} from '../../layer';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {AvatarNewTsx} from '../avatarNew';
import {i18n, LangPackKey} from '../../lib/langPack';
import {Accessor, createEffect, createMemo, createSignal, For, onMount, Setter, Show} from 'solid-js';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import PopupStars, {StarsBalance, StarsStar} from './stars';
import LottieAnimation from '../lottieAnimation';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import classNames from '../../helpers/string/classNames';
import sortLongsArray from '../../helpers/long/sortLongsArray';
import {StarGiftsGrid} from '../stargiftsGrid';
import {fastRaf} from '../../helpers/schedulers';
import PopupStarGiftInfo from './starGiftInfo';
import {FakeBubbles} from '../chat/bubbles/fakeBubbles';
import {ServiceBubble} from '../chat/bubbles/service';
import {StarGiftBubble} from '../chat/bubbles/starGift';
import {InputFieldTsx} from '../inputFieldTsx';
import rootScope from '../../lib/rootScope';
import RowTsx from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import Button from '../buttonTsx';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import {PremiumGiftBubble} from '../chat/bubbles/premiumGift';
import {formatMonthsDuration} from '../../helpers/date';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {render} from 'solid-js/web';
import {ButtonIconTsx} from '../buttonIconTsx';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import PopupPayment from './payment';
import useStars from '../../stores/stars';
import {TransitionSliderTsx} from '../transitionTsx';
import maybe2x from '../../helpers/maybe2x';

interface MyPremiumOption {
  months: 3 | 6 | 12
  discountPercent: number
  price: Long
  currency: string
  priceStars?: Long
  rawOption: PremiumGiftCodeOption
}

const STATIC_CATEGORIES: Record<string, LangPackKey> = {
  All: 'StarGiftCategoryAll',
  Limited: 'StarGiftCategoryLimited',
  InStock: 'StarGiftCategoryInStock'
}

function GiftOptionsPage(props: {
  peer: User.user | Chat.channel
  peerId: PeerId
  premiumOptions: MyPremiumOption[]
  giftOptions: MyStarGift[]
  onGiftChosen: (item: MyStarGift | MyPremiumOption) => void
  onClose: () => void
}) {
  const availableCategoriesSet = new Set<string>()
  for(const option of props.giftOptions) {
    availableCategoriesSet.add(String((option.raw as StarGift.starGift).stars))
  }
  const availableCategories = sortLongsArray([...availableCategoriesSet.values()])

  const [category, setCategory] = createSignal<string>('All');


  let categoriesContainer!: HTMLDivElement;

  const giftPremiumSection = props.peer._ === 'user' && (
    <>
      <div class="popup-send-gift-title">
        {i18n('GiftPremium')}
      </div>
      <div class="popup-send-gift-subtitle">
        {i18n('GiftTelegramPremiumDescription', [props.peer.first_name])}
      </div>
      <div class="popup-send-gift-premium-options">
        <For each={props.premiumOptions}>
          {(option) => {
            return (
              <div class="star-gifts-grid-item view-list" onClick={() => props.onGiftChosen(option)}>
                <LottieAnimation
                  lottieLoader={lottieLoader}
                  class="star-gifts-grid-item-sticker"
                  name={`Gift${option.months}`}
                  size={90}
                />
                <div class="popup-send-gift-premium-option-title">
                  {formatMonthsDuration(option.months, false)}
                </div>
                <div class="popup-send-gift-premium-option-subtitle">
                  {i18n('PremiumStickersShort')}
                </div>
                <div class="popup-send-gift-premium-option-price">
                  {paymentsWrapCurrencyAmount(option.price, option.currency)}
                </div>

                {option.discountPercent && (
                  <div class="star-gifts-grid-item-badge">
                    <div class="star-gifts-grid-item-badge-text">
                      -{Math.round(option.discountPercent)}%
                    </div>
                  </div>
                )}

                {option.priceStars && (
                  <div class="popup-send-gift-premium-option-price-stars">
                    {i18n('PremiumOr')}
                    <div class="popup-send-gift-premium-option-price-stars-inner">
                      <StarsStar />
                      {option.priceStars}
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        </For>
      </div>
    </>
  )

  const wrapCategory = (it: string) => (
    <div
      class={classNames('popup-send-gift-category', category() === it && 'active')}
      onClick={(event: MouseEvent) => {
        // if(!categoriesContainer.classList.contains('is-pinned')) {
        //   this.container.scrollTo({top: categoriesContainer.offsetTop, behavior: 'smooth'});
        // }
        // (event.target as HTMLElement).scrollIntoView({behavior: 'smooth'});
        setCategory(it)
      }}
    >
      {it in STATIC_CATEGORIES ? i18n(STATIC_CATEGORIES[it]) : (
          <>
            <StarsStar />
            {it}
          </>
        )}
    </div>
  )

  const filteredGiftOptions = createMemo(() => {
    const category$ = category()
    if(category$ === 'All') return props.giftOptions
    if(category$ === 'Limited') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_total)
    if(category$ === 'InStock') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_remains > 0)
    return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).stars.toString() === category$)
  })

  const handleGiftClick = (item: MyStarGift) => {
    if((item.raw as StarGift.starGift).availability_remains === 0) {
      PopupElement.createPopup(PopupStarGiftInfo, item)
      return
    }

    props.onGiftChosen(item);
  }

  let container!: HTMLDivElement;

  onMount(() => {
    fastRaf(() => {
      container.style.setProperty('--height', `${container.offsetHeight}px`);
    })
  })

  return (
    <div
      class="popup-send-gift-main"
      ref={container}
      onScroll={() => {
        container.classList.toggle('is-scrolled', container.scrollTop > 0);

        const containerRect = container.getBoundingClientRect();
        const rect = categoriesContainer.getBoundingClientRect();
        const isPinned = rect.top - containerRect.top === 56

        categoriesContainer.classList.toggle('is-pinned', isPinned);
        container.classList.toggle('has-pinned-categories', isPinned);
      }}
    >
      <div class="popup-send-gift-main-header">
        <ButtonIconTsx icon="close" onClick={props.onClose} />
        <div class="popup-title">
          {i18n('Chat.Menu.SendGift')}
        </div>
      </div>

      <div class="popup-send-gift-avatar">
        <img
          class="popup-send-gift-image"
          src={`assets/img/${maybe2x('stars_pay')}.png`}
        />
        <AvatarNewTsx peerId={props.peerId} size={100} />
      </div>

      {giftPremiumSection}

      <div class="popup-send-gift-title">
        {i18n('Chat.Menu.SendGift')}
      </div>
      <div class="popup-send-gift-subtitle">
        {i18n('SendStarGiftSubtitle', [props.peer._ === 'user' ? props.peer.first_name : props.peer.title])}
      </div>

      <div class="popup-send-gift-categories" ref={categoriesContainer}>
        {wrapCategory('All')}
        {wrapCategory('Limited')}
        {wrapCategory('InStock')}
        <For each={availableCategories}>
          {wrapCategory}
        </For>
      </div>

      <StarGiftsGrid
        items={filteredGiftOptions()}
        view="list"
        scrollParent={container}
        onClick={handleGiftClick}
      />
    </div>
  )
}

function ChosenGiftPage(props: {
  peerId: PeerId
  peerName: string
  chosenGift: MyStarGift | MyPremiumOption
  onBack: () => void
  onClose: () => void
}) {
  const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();
  const [anonymous, setAnonymous] = createSignal(false);
  const [payWithStars, setPayWithStars] = createSignal(false);

  const message = createMemo<Message.messageService>(() => ({
    _: 'messageService',
    pFlags: {out: true},
    id: 0,
    peer_id: {_: 'peerUser', user_id: props.peerId.toUserId()},
    date: 0,
    action: 'raw' in props.chosenGift ? {
      _: 'messageActionStarGift',
      gift: props.chosenGift.raw,
      pFlags: {}
    } : {
      _: 'messageActionGiftPremium',
      currency: payWithStars() ? STARS_CURRENCY : props.chosenGift.currency,
      amount: payWithStars() ? props.chosenGift.priceStars : props.chosenGift.price,
      months: props.chosenGift.months
    }
  }))

  async function handleSubmit() {
    let invoice: InputInvoice
    if('raw' in props.chosenGift) {
      const peer = props.peerId.isUser() ?
        await rootScope.managers.appUsersManager.getUserInputPeer(props.peerId.toUserId()) :
        await rootScope.managers.appChatsManager.getChannelInputPeer(props.peerId.toChatId())
      invoice = {
        _: 'inputInvoiceStarGift',
        pFlags: {
          hide_name: anonymous() ? true : undefined
        },
        message: textWithEntities(),
        peer,
        gift_id: props.chosenGift.raw.id
      }
    } else {
      const payWithStars$ = payWithStars()
      const inputUser = await rootScope.managers.appUsersManager.getUserInput(props.peerId.toUserId())
      if(payWithStars$) {
        invoice = {
          _: 'inputInvoicePremiumGiftStars',
          user_id: inputUser,
          months: props.chosenGift.months,
          message: textWithEntities()
        }
      } else {
        invoice = {
          _: 'inputInvoicePremiumGiftCode',
          purpose: {
            _: 'inputStorePaymentPremiumGiftCode',
            users: [inputUser],
            currency: props.chosenGift.currency,
            amount: props.chosenGift.price,
            message: textWithEntities()
          },
          option: props.chosenGift.rawOption
        }
      }
    }

    const popup = await PopupPayment.create({
      inputInvoice: invoice
    })
    popup.addEventListener('finish', (result) => {
      if(result === 'paid' || result === 'pending') {
        props.onClose();
      }
    })
  }

  return (
    <div class="popup-send-gift-form">
      <div class="popup-send-gift-form-header">
        <ButtonIconTsx
          icon="back"
          onClick={props.onBack}
        />
        <div class="popup-title">
          {i18n('Chat.Menu.SendGift')}
        </div>
        {StarsBalance()}
      </div>

      <FakeBubbles peerId={props.peerId} class="popup-send-gift-bubbles">
        <ServiceBubble message={message()}>
          {'raw' in props.chosenGift ? (
            <StarGiftBubble
              sticker={props.chosenGift.sticker}
              fromId={rootScope.myId}
              message={textWithEntities()}
              starsAmount={(props.chosenGift.raw as StarGift.starGift).stars}
              wrapStickerOptions={{play: true, loop: false}}
            />
          ) : (
            <PremiumGiftBubble
              title={i18n('ActionGiftPremiumTitle', [formatMonthsDuration(props.chosenGift.months, false)])}
              subtitle={
                textWithEntities() ?
                  wrapRichText(textWithEntities().text, {entities: textWithEntities().entities}) :
                  i18n('ActionGiftPremiumSubtitle')
              }
              buttonText={i18n('ActionGiftPremiumView')}
              assetName={`Gift${props.chosenGift.months}`}
            />
          )}
        </ServiceBubble>
      </FakeBubbles>

      <div class="popup-send-gift-form-sheet">
        <InputFieldTsx
          class="popup-send-gift-form-input"
          placeholder='StarGiftMessagePlaceholder'
          instanceRef={(input) => {
            input.input.addEventListener('input', () => {
              const value = getRichValueWithCaret(input.input, true)
              setTextWithEntities(value.value ? {
                _: 'textWithEntities',
                text: value.value,
                entities: value.entities
              } : undefined)
            })
          }}
          maxLength={100} // todo: what's the correct limit here?
        />
        {'raw' in props.chosenGift && (
          <RowTsx
            title={i18n('StarGiftHideMyName')}
            checkboxFieldToggle={
              <CheckboxFieldTsx
                checked={anonymous()}
                toggle
                onChange={setAnonymous}
              />
            }
          />
        )}
        {'months' in props.chosenGift && props.chosenGift.priceStars && (
          <RowTsx
            title={
              <span class="popup-send-gift-form-pay-with-stars">
                {i18n('PayWithStars')}
                <StarsStar />
                {numberThousandSplitterForStars(props.chosenGift.priceStars)}
              </span>
            }
            checkboxFieldToggle={
              <CheckboxFieldTsx
                checked={payWithStars()}
                toggle
                onChange={setPayWithStars}
              />
            }
          />
        )}
      </div>
      <div class="popup-send-gift-form-hint">
        {'raw' in props.chosenGift ? i18n('StarGiftHideMyNameHint', [props.peerName, props.peerName]) : ''}
      </div>

      <Button
        class="popup-send-gift-form-send btn-primary btn-color-primary"
        onClick={handleSubmit}
      >
        {i18n('StarGiftSend', [
          'raw' in props.chosenGift ?
            paymentsWrapCurrencyAmount(
              (props.chosenGift.raw as StarGift.starGift).stars,
              STARS_CURRENCY
            ) :
            payWithStars() ?
              paymentsWrapCurrencyAmount(
                props.chosenGift.priceStars,
                STARS_CURRENCY
              ) :
              paymentsWrapCurrencyAmount(
                props.chosenGift.price,
                props.chosenGift.currency
              )
        ])}
      </Button>
    </div>
  )
}

function StarsBalanceAlt() {
  const balance = useStars();
  return (
    <div class="popup-send-gift-balance">
      {i18n('StarsBalanceLong', [
          (<span class="i18n">
            <StarsStar />
            <b>{balance()}</b>
          </span>) as HTMLElement
      ])}
      <a
        class="popup-send-gift-balance-get-more"
        onClick={() => PopupElement.createPopup(PopupStars)}
      >
        {i18n('GetMoreStars')}
      </a>
    </div>
  )
}

export default class SendGiftPopup extends PopupElement {
  private chosenGift: Accessor<MyStarGift | MyPremiumOption | undefined>;
  private setChosenGift: Setter<MyStarGift | MyPremiumOption>;
  constructor(readonly peerId: PeerId) {
    super('popup-send-gift', {
      title: 'Chat.Menu.SendGift',
      closable: true,
      overlayClosable: true,
      body: true,
      onBackClick: () => {
        if(this.chosenGift()) {
          this.setChosenGift(undefined);
        }
      }
    });

    this.construct();
  }

  private mapPremiumOptions(premiumOptions: PremiumGiftCodeOption.premiumGiftCodeOption[]) {
    const map: Map<MyPremiumOption['months'], MyPremiumOption> = new Map();
    for(const option of premiumOptions) {
      if(option.users !== 1) continue;
      if(option.months !== 3 && option.months !== 6 && option.months !== 12) continue;

      if(map.has(option.months)) {
        const oldOption = map.get(option.months);
        if(oldOption.currency === STARS_CURRENCY) {
          oldOption.priceStars = oldOption.price
          oldOption.price = option.amount
          oldOption.currency = option.currency
          oldOption.rawOption = option
        } else if(option.currency === STARS_CURRENCY) {
          oldOption.priceStars = option.amount
        }
        continue
      }

      map.set(option.months, {
        months: option.months,
        price: option.amount,
        currency: option.currency,
        discountPercent: 0,
        rawOption: option
      });
    }

    const threePrice = bigInt(map.get(3).price as number);
    const calcDiscount = (option: MyPremiumOption, mul: number) => {
      const optionPrice = option.price;
      const rawPrice = threePrice.multiply(mul)

      if(rawPrice.lt(optionPrice)) return
      option.discountPercent = rawPrice.subtract(optionPrice).toJSNumber() / rawPrice.toJSNumber() * 100;
    }

    calcDiscount(map.get(6), 2);
    calcDiscount(map.get(12), 4);

    return [
      map.get(3),
      map.get(6),
      map.get(12)
    ];
  }

  private async construct() {
    const [premiumOptions, giftOptions, peer] = await Promise.all([
      this.peerId.isUser() ? this.managers.appPaymentsManager.getPremiumGiftCodeOptions() : [] as PremiumGiftCodeOption[],
      this.managers.appGiftsManager.getStarGiftOptions(),
      this.managers.appPeersManager.getPeer(this.peerId)
    ])

    const [chosenGift, setChosenGift] = createSignal<MyStarGift | MyPremiumOption>();
    this.chosenGift = chosenGift;
    this.setChosenGift = setChosenGift;

    const [currentPage, setCurrentPage] = createSignal(0);

    this.container.replaceChildren()
    const dispose = render(() => (
      <>
        <TransitionSliderTsx
          type="navigation"
          transitionTime={150}
          animateFirst={false}
          onTransitionEnd={(id) => {
            if(id === 0) {
              this.setChosenGift(undefined);
            }
          }}
          currentPage={currentPage()}
        >
          <GiftOptionsPage
            peer={peer as User.user | Chat.channel}
            peerId={this.peerId}
            premiumOptions={this.mapPremiumOptions(premiumOptions)}
            giftOptions={giftOptions}
            onGiftChosen={(option) => {
              setChosenGift(option);
              setCurrentPage(1);
            }}
            onClose={() => this.hide()}
          />
          <Show when={chosenGift() !== undefined}>
            <ChosenGiftPage
              peerId={this.peerId}
              peerName={peer._ === 'user' ? peer.first_name : peer.title}
              chosenGift={chosenGift()}
              onBack={() => setCurrentPage(0)}
              onClose={() => this.hide()}
            />
          </Show>
        </TransitionSliderTsx>
        <StarsBalanceAlt />
      </>
    ), this.container)

    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
