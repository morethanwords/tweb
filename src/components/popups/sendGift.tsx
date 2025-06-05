import bigInt from 'big-integer';
import PopupElement from '.';
import {Chat, InputInvoice, Message, StarGift, TextWithEntities, User} from '../../layer';
import {MyPremiumGiftOption, MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {AvatarNewTsx} from '../avatarNew';
import {i18n, LangPackKey} from '../../lib/langPack';
import {Accessor, createMemo, createSignal, For, onMount, Setter, Show} from 'solid-js';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import PopupStars, {StarsBalance, StarsStar} from './stars';
import LottieAnimation from '../lottieAnimation';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import classNames from '../../helpers/string/classNames';
import sortLongsArray from '../../helpers/long/sortLongsArray';
import {StarGiftsGrid} from '../stargifts/stargiftsGrid';
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
import {I18nTsx} from '../../helpers/solid/i18n';
import {StarGiftBadge} from '../stargifts/stargiftBadge';
import Scrollable from '../scrollable2';
import {approxEquals} from '../../helpers/number/approxEquals';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import fastSmoothScroll from '../../helpers/fastSmoothScroll';
import {useAppState} from '../../stores/appState';
import PopupStarGiftUpgrade from './starGiftUpgrade';
import anchorCallback from '../../helpers/dom/anchorCallback';
import {PeerTitleTsx} from '../peerTitleTsx';

type GiftOption = MyStarGift | MyPremiumGiftOption;

const STATIC_CATEGORIES: Record<string, LangPackKey> = {
  All: 'StarGiftCategoryAll',
  Limited: 'StarGiftCategoryLimited',
  InStock: 'StarGiftCategoryInStock'
};

function GiftOptionsPage(props: {
  peer: User.user | Chat.channel
  peerId: PeerId
  premiumOptions: MyPremiumGiftOption[]
  giftOptions: MyStarGift[]
  onGiftChosen: (item: GiftOption) => void
  onClose: () => void
}) {
  const availableCategoriesSet = new Set<string>();
  for(const option of props.giftOptions) {
    availableCategoriesSet.add(String((option.raw as StarGift.starGift).stars));
  }
  const availableCategories = sortLongsArray([...availableCategoriesSet.values()]);

  const [category, setCategory] = createSignal<string>('All');

  let categoriesContainer!: HTMLDivElement;
  let categoriesScrollable!: HTMLDivElement;
  let container!: HTMLDivElement;

  const giftPremiumSection = props.peer._ === 'user' && (
    <>
      <div class="popup-send-gift-title">
        {i18n('GiftPremium')}
      </div>
      <div class="popup-send-gift-subtitle">
        <I18nTsx
          key="GiftTelegramPremiumDescription"
          args={<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />}
        />
      </div>
      <div class="popup-send-gift-premium-options">
        <For each={props.premiumOptions}>
          {(option) => {
            return (
              <div class="popup-send-gift-premium-option" onClick={() => props.onGiftChosen(option)}>
                <LottieAnimation
                  lottieLoader={lottieLoader}
                  class="popup-send-gift-premium-option-sticker"
                  name={`Gift${option.months}`}
                  size={84}
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
                  <StarGiftBadge
                    class="popup-send-gift-premium-option-badge"
                    textClass="popup-send-gift-premium-option-badge-text"
                  >
                      -{Math.round(option.discountPercent)}%
                  </StarGiftBadge>
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
  );

  const wrapCategory = (it: string) => (
    <div
      class={classNames('popup-send-gift-category', category() === it && 'active')}
      onClick={(event: MouseEvent) => {
        const wasPinned = categoriesContainer.classList.contains('is-pinned');
        setCategory(it)
        const categoryEl = (event.target as HTMLElement).closest('.popup-send-gift-category') as HTMLElement;
        fastRaf(() => {
          if(!categoriesContainer.classList.contains('is-pinned')) {
            container.scrollTo({top: categoriesContainer.offsetTop - 56, behavior: wasPinned ? 'instant' : 'smooth'});
          }

          const categoryRect = categoryEl.getBoundingClientRect();
          const visibleRect = getVisibleRect(categoryEl, categoriesScrollable, false, categoryRect);
          if(!visibleRect || visibleRect.overflow.horizontal) {
            fastSmoothScroll({
              element: categoryEl,
              container: categoriesScrollable,
              position: 'center',
              axis: 'x'
            });
          }
        });
      }}
    >
      {it in STATIC_CATEGORIES ? i18n(STATIC_CATEGORIES[it]) : (
          <>
            <StarsStar />
            {it}
          </>
        )}
    </div>
  );

  const filteredGiftOptions = createMemo(() => {
    const category$ = category();
    if(category$ === 'All') return props.giftOptions;
    if(category$ === 'Limited') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_total);
    if(category$ === 'InStock') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_remains > 0);
    return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).stars.toString() === category$);
  });

  const handleGiftClick = (item: MyStarGift) => {
    if((item.raw as StarGift.starGift).availability_remains === 0) {
      PopupElement.createPopup(PopupStarGiftInfo, item);
      return;
    }

    props.onGiftChosen(item);
  };


  onMount(() => {
    fastRaf(() => {
      container.style.setProperty('--height', `${container.offsetHeight}px`);
    });
  });

  return (
    <Scrollable
      ref={container}
      onScroll={() => {
        container.classList.toggle('is-scrolled', container.scrollTop > 0);

        const containerRect = container.getBoundingClientRect();
        const rect = categoriesContainer.getBoundingClientRect();
        const isPinned = approxEquals(rect.top - containerRect.top, 56, 0.1)

        categoriesContainer.classList.toggle('is-pinned', isPinned);
        container.classList.toggle('has-pinned-categories', isPinned);
      }}
    >
      <div class="popup-send-gift-main">
        <div class="popup-send-gift-main-header">
          <ButtonIconTsx icon="close" onClick={props.onClose} />
          <div class="popup-title">
            {i18n('StarGiftSendGift')}
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
          {i18n('StarGiftSendGift')}
        </div>
        <div class="popup-send-gift-subtitle">
          <I18nTsx
            key="SendStarGiftSubtitle"
            args={<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />}
          />
        </div>

        <div class="popup-send-gift-categories" ref={categoriesContainer}>
          <Scrollable axis="x" ref={categoriesScrollable}>
            {wrapCategory('All')}
            {wrapCategory('Limited')}
            {wrapCategory('InStock')}
            <For each={availableCategories}>
              {wrapCategory}
            </For>
          </Scrollable>
        </div>

        <div class="popup-send-gift-gifts">
          <StarGiftsGrid
            class="popup-send-gift-gifts-grid"
            items={filteredGiftOptions()}
            view="list"
            scrollParent={container}
            onClick={handleGiftClick}
          />
        </div>
      </div>
    </Scrollable>
  );
}

function StarGiftLimitedProgress(props: {
  gift: StarGift.starGift
}) {
  // NB: deliberately not reactive, gift won't change
  const left = i18n('StarGiftLimitedLeft', [props.gift.availability_remains]);
  left.classList.add('popup-send-gift-limited-progress-left');

  const progress = 100 * props.gift.availability_remains / props.gift.availability_total;

  return (
    <div class="popup-send-gift-limited-progress-wrap">
      <div class="popup-send-gift-limited-progress-bar">
        <div class="popup-send-gift-limited-progress" style={{width: `${100 * props.gift.availability_remains / props.gift.availability_total}%`}} />
        <div class="popup-send-gift-limited-progress-text" style={{
          'background-image': `linear-gradient(90deg, #fff ${progress}%, var(--secondary-text-color) ${progress}%)`
        }}>
          {left}
          {i18n('StarGiftLimitedSold2', [props.gift.availability_total - props.gift.availability_remains])}
        </div>
      </div>
    </div>
  );
}

function ChosenGiftPage(props: {
  peerId: PeerId
  peerName: string
  chosenGift: GiftOption
  onBack: () => void
  onClose: () => void
}) {
  const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();
  const [anonymous, setAnonymous] = createSignal(false);
  const [payWithStars, setPayWithStars] = createSignal(false);
  const [withUpgrade, setWithUpgrade] = createSignal(false);
  const [sending, setSending] = createSignal(false);

  const message = createMemo<Message.messageService>(() => ({
    _: 'messageService',
    pFlags: {out: true},
    id: 0,
    peer_id: {_: 'peerUser', user_id: props.peerId.toUserId()},
    date: 0,
    action: props.chosenGift.type === 'stargift' ? {
      _: 'messageActionStarGift',
      gift: props.chosenGift.raw,
      pFlags: {}
    } : {
      _: 'messageActionGiftPremium',
      currency: payWithStars() ? STARS_CURRENCY : props.chosenGift.currency,
      amount: payWithStars() ? props.chosenGift.priceStars : props.chosenGift.price,
      months: props.chosenGift.months
    }
  }));

  async function handleSubmit() {
    setSending(true);
    let invoice: InputInvoice;
    if(props.chosenGift.type === 'stargift') {
      const peer = props.peerId.isUser() ?
        await rootScope.managers.appUsersManager.getUserInputPeer(props.peerId.toUserId()) :
        await rootScope.managers.appChatsManager.getChannelInputPeer(props.peerId.toChatId());
      invoice = {
        _: 'inputInvoiceStarGift',
        pFlags: {
          hide_name: anonymous() ? true : undefined,
          include_upgrade: withUpgrade() ? true : undefined
        },
        message: textWithEntities(),
        peer,
        gift_id: props.chosenGift.raw.id
      };
    } else {
      const payWithStars$ = payWithStars();
      const inputUser = await rootScope.managers.appUsersManager.getUserInput(props.peerId.toUserId());
      if(payWithStars$) {
        invoice = {
          _: 'inputInvoicePremiumGiftStars',
          user_id: inputUser,
          months: props.chosenGift.months,
          message: textWithEntities()
        };
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
          option: props.chosenGift.raw
        };
      }
    }

    const popup = await PopupPayment.create({
      inputInvoice: invoice,
      noShowIfStars: true,
      purpose: 'stargift'
    });
    popup.addEventListener('finish', (result) => {
      if(result === 'paid' || result === 'pending') {
        props.onClose();
      } else {
        setSending(false);
      }
    });
  }

  return (
    <div class="popup-send-gift-form">
      <div class="popup-send-gift-form-header">
        <ButtonIconTsx
          icon="back"
          onClick={props.onBack}
        />
        <div class="popup-title">
          {i18n('StarGiftSendGift')}
        </div>
        {StarsBalance()}
      </div>

      <div class="popup-send-gift-form-body">
        <Scrollable>
          <FakeBubbles peerId={props.peerId} class="popup-send-gift-bubbles">
            <ServiceBubble message={message()}>
              {props.chosenGift.type === 'stargift' ? (
              <StarGiftBubble
                gift={props.chosenGift}
                fromId={rootScope.myId}
                asUpgrade={withUpgrade()}
                ownerId={props.peerId}
                message={textWithEntities()}
                wrapStickerOptions={{play: true, loop: false}}
              />
            ) : (
              <PremiumGiftBubble
                title={i18n('ActionGiftPremiumTitle2', [formatMonthsDuration(props.chosenGift.months, false)])}
                subtitle={
                  textWithEntities() ?
                    wrapRichText(textWithEntities().text, {entities: textWithEntities().entities}) :
                    i18n('ActionGiftPremiumSubtitle2')
                }
                buttonText={i18n('ActionGiftPremiumView')}
                assetName={`Gift${props.chosenGift.months}`}
              />
            )}
            </ServiceBubble>
          </FakeBubbles>

          <div class="popup-send-gift-form-sheet">
            {props.chosenGift.type === 'stargift' && (props.chosenGift.raw as StarGift.starGift).availability_total && (
              <StarGiftLimitedProgress gift={props.chosenGift.raw as StarGift.starGift} />
            )}
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
              maxLength={useAppState()[0].appConfig.stargifts_message_length_max}
            />
            {props.chosenGift.type === 'stargift' && (
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
                  <I18nTsx
                    key="PayWithStars"
                    args={[
                      <StarsStar />,
                      numberThousandSplitterForStars(props.chosenGift.priceStars)
                    ]}
                  />
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
            {props.chosenGift.type === 'stargift' ? i18n('StarGiftHideMyNameHint', [
              wrapRichText(props.peerName),
              wrapRichText(props.peerName)
            ]) : ''}
          </div>

          {props.chosenGift.type === 'stargift' && (props.chosenGift.raw as StarGift.starGift).upgrade_stars && (
            <>
              <div class="popup-send-gift-form-sheet">
                <RowTsx
                  title={
                    <I18nTsx
                      key="StarGiftMakeUnique"
                      args={[
                        <StarsStar />,
                        numberThousandSplitterForStars((props.chosenGift.raw as StarGift.starGift).upgrade_stars)
                      ]}
                    >
                    </I18nTsx>
                  }
                  checkboxFieldToggle={
                    <CheckboxFieldTsx
                      checked={withUpgrade()}
                      toggle
                      onChange={setWithUpgrade}
                    />
                  }
                />
              </div>
              <div class="popup-send-gift-form-hint">
                <I18nTsx
                  key="StarGiftMakeUniqueHint"
                  args={[
                    wrapRichText(props.peerName),
                    (() => {
                      const a = anchorCallback(() => PopupStarGiftUpgrade.create(props.chosenGift as MyStarGift, props.peerId));
                      a.append(i18n('StarGiftMakeUniqueLink'));
                      return a;
                    })()
                  ]}
                />
              </div>
            </>
          )}
        </Scrollable>
      </div>

      <Button
        class="popup-send-gift-form-send btn-primary btn-color-primary"
        onClick={handleSubmit}
        disabled={sending()}
      >
        <I18nTsx
          key="StarGiftSend"
          args={[(() => {
            if(props.chosenGift.type === 'stargift') {
              const gift = props.chosenGift.raw as StarGift.starGift;
              let stars = gift.stars;
              if(withUpgrade()) {
                stars = bigInt(stars as string).add(gift.upgrade_stars).toString();
              }
              return paymentsWrapCurrencyAmount(stars, STARS_CURRENCY);
            }

            if(payWithStars()) {
              return paymentsWrapCurrencyAmount(
                props.chosenGift.priceStars,
                STARS_CURRENCY
              );
            }

            return paymentsWrapCurrencyAmount(
              props.chosenGift.price,
              props.chosenGift.currency
            );
          })()
          ]}
        />
      </Button>
    </div>
  )
}

function StarsBalanceAlt() {
  const balance = useStars();
  return (
    <div class="popup-send-gift-balance">
      <I18nTsx
        key="StarsBalanceLong"
        args={[
          <StarsStar />,
          <b>{balance()}</b>
        ]}
      />
      <a
        class="popup-send-gift-balance-get-more"
        onClick={() => PopupElement.createPopup(PopupStars)}
      >
        {i18n('GetMoreStars')}
      </a>
    </div>
  );
}

export default class PopupSendGift extends PopupElement {
  private chosenGift: Accessor<MyStarGift | MyPremiumGiftOption | undefined>;
  private setChosenGift: Setter<MyStarGift | MyPremiumGiftOption>;
  constructor(readonly peerId: PeerId) {
    super('popup-send-gift', {
      title: 'StarGiftSendGift',
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

  private async construct() {
    const [premiumOptions, giftOptions, peer] = await Promise.all([
      this.peerId.isUser() ? this.managers.appGiftsManager.getPremiumGiftOptions() : [] as MyPremiumGiftOption[],
      this.managers.appGiftsManager.getStarGiftOptions(),
      this.managers.appPeersManager.getPeer(this.peerId)
    ]);

    const [chosenGift, setChosenGift] = createSignal<GiftOption>();
    this.chosenGift = chosenGift;
    this.setChosenGift = setChosenGift;

    const [currentPage, setCurrentPage] = createSignal(0);

    this.container.replaceChildren();
    const dispose = render(() => (
      <>
        <TransitionSliderTsx
          type="navigation"
          transitionTime={150}
          animateFirst={false}
          onTransitionStart={(id) => {
            this.container.classList.toggle('is-chosen-gift', id === 1);
          }}
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
            premiumOptions={premiumOptions}
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
    ), this.container);

    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
