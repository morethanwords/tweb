import bigInt from 'big-integer';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {Birthday, Chat, InputInvoice, Message, StarGift, StarGiftAttribute, StarGiftAttributeId, TextWithEntities, User} from '@layer';
import {MyPremiumGiftOption, MyStarGift} from '@appManagers/appGiftsManager';
import {STARS_CURRENCY} from '@appManagers/constants';
import {AvatarNewTsx} from '@components/avatarNew';
import MediaHeader from '@components/mediaHeader';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Setter, Show} from 'solid-js';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import showStarsPopup, {StarsBalance, StarsStar} from '@components/popups/stars';
import LottieAnimation from '@components/lottieAnimation';
import lottieLoader from '@lib/lottie/lottieLoader';
import classNames from '@helpers/string/classNames';
import {StarGiftsGrid} from '@components/stargifts/stargiftsGrid';
import {fastRaf} from '@helpers/schedulers';
import showStarGiftInfoPopup from '@components/popups/starGiftInfo';
import {FakeBubbles} from '@components/chat/bubbles/fakeBubbles';
import {ServiceBubble} from '@components/chat/bubbles/service';
import {StarGiftBubble} from '@components/chat/bubbles/starGift';
import {InputFieldTsx} from '@components/inputFieldTsx';
import rootScope from '@lib/rootScope';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Button from '@components/buttonTsx';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {PremiumGiftBubble} from '@components/chat/bubbles/premiumGift';
import {formatMonthsDuration} from '@helpers/date';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {render} from 'solid-js/web';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import numberThousandSplitter, {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {createPaymentPopup} from '@components/popups/payment';
import {TransitionSliderTsx} from '@components/transitionTsx';
import maybe2x from '@helpers/maybe2x';
import {I18nTsx} from '@helpers/solid/i18n';
import {StarGiftBadge} from '@components/stargifts/stargiftBadge';
import Scrollable from '@components/scrollable2';
import {approxEquals} from '@helpers/number/approxEquals';
import {useAppState} from '@stores/appState';
import anchorCallback from '@helpers/dom/anchorCallback';
import {getOverlayRoot} from '@helpers/appWindow';
import {PeerTitleTsx} from '@components/peerTitleTsx';

import ButtonMenuToggle from '@components/buttonMenuToggle';
import {IconTsx} from '@components/iconTsx';
import {ButtonMenuSelect, ButtonMenuSelectText} from '@components/buttonMenuSelect';
import {rgbIntToHex} from '@helpers/color';
import {PreloaderTsx} from '@components/putPreloader';
import {FloatingStarsBalance} from '@components/popups/floatingStarsBalance';
import {positionMenuTrigger} from '@helpers/positionMenu';
import {Transition} from '@vendor/solid-transition-group';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {inputStarGiftEquals} from '@appManagers/utils/gifts/inputStarGiftEquals';
import getStarGiftSendPolicy, {DisallowedGifts} from '@appManagers/utils/gifts/getStarGiftSendPolicy';
import {updateStarGift} from '@appManagers/utils/gifts/updateStarGift';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import showPremiumPopup from '@components/popups/premium';
import tsNow from '@helpers/tsNow';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import createStarGiftUpgradePopup from '@components/popups/starGiftUpgrade';
import {createProfileGiftsStore, StarGiftsProfileActions, StarGiftsProfileStore} from '@components/stargifts/profileStore';
import transferStarGift from '@components/popups/transferStarGift';
import {unwrap} from 'solid-js/store';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';

import styles from '@components/popups/sendGift.module.scss';
import Animated from '@helpers/solid/animations';

type GiftOption = MyStarGift | MyPremiumGiftOption;

function prioritizeBirthdayGifts(gifts: MyStarGift[]) {
  return gifts.slice().sort((a, b) => {
    const isBirthdayGift = (gift: MyStarGift) => gift.raw._ === 'starGift' &&
      !gift.isResale &&
      !!gift.raw.pFlags.birthday;

    return Number(isBirthdayGift(b)) - Number(isBirthdayGift(a));
  });
}

function isStarGiftAllowed(gift: MyStarGift, disallowedGifts?: DisallowedGifts) {
  return getStarGiftSendPolicy(gift, disallowedGifts).allowed;
}

function isBirthdayNearby(birthday?: Birthday) {
  if(!birthday) return false;

  const now = new Date();
  return [-1, 0, 1].some((offset) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return birthday.day === date.getDate() && birthday.month === date.getMonth() + 1;
  });
}

function GiftOptionsPage(props: {
  peer: User.user | Chat.channel
  peerId: PeerId
  premiumOptions: MyPremiumGiftOption[]
  giftOptions: MyStarGift[]
  disallowedGifts?: DisallowedGifts
  onGiftChosen: (item: GiftOption) => void
  onClose: () => void

  profileStore: StarGiftsProfileStore
  profileStoreActions: StarGiftsProfileActions
}) {
  const [isPinned, setIsPinned] = createSignal(false);
  const isToSelf = props.peerId === rootScope.myId;

  type CategoryName = 'All' | 'Owned' | 'Collectibles';
  const [category, setCategory] = createSignal<CategoryName>('All');

  let categoriesContainer!: HTMLDivElement;
  let container!: HTMLDivElement;

  const giftPremiumSection = !!props.premiumOptions.length && props.peer._ === 'user' && !isToSelf && (
    <>
      <MediaHeader class={styles.intro}>
        <MediaHeader.Title>{i18n('GiftPremium')}</MediaHeader.Title>
        <MediaHeader.Subtitle>
          <I18nTsx
            key="GiftTelegramPremiumDescription"
            args={<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />}
          />
        </MediaHeader.Subtitle>
      </MediaHeader>
      <div class={styles.premiumOptionsContainer}>
        <For each={props.premiumOptions}>
          {(option) => {
            return (
              <div class={styles.premiumOption} role="button" tabindex={0} onClick={() => props.onGiftChosen(option)} onKeyDown={buttonKeyDown}>
                <LottieAnimation
                  lottieLoader={lottieLoader}
                  class={styles.premiumOptionSticker}
                  name={`Gift${option.months}`}
                  size={84}
                />
                <div class={styles.premiumOptionTitle}>
                  {formatMonthsDuration(option.months, false)}
                </div>
                <div class={styles.premiumOptionSubtitle}>
                  {i18n('PremiumStickersShort')}
                </div>
                <div class={styles.premiumOptionPrice}>
                  {paymentsWrapCurrencyAmount(option.price, option.currency)}
                </div>

                {option.discountPercent && (
                  <StarGiftBadge
                    class={styles.premiumOptionBadge}
                    textClass={styles.premiumOptionBadgeText}
                  >
                      -{Math.round(option.discountPercent)}%
                  </StarGiftBadge>
                )}

                {option.priceStars && (
                  <div class={styles.premiumOptionPriceStars}>
                    {i18n('PremiumOr')}
                    <div class={styles.premiumOptionPriceStarsInner}>
                      <StarsStar />
                      {numberThousandSplitterForStars(option.priceStars)}
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

  const handleCategoryChanged = (it: string) => {
    const wasPinned = isPinned()
    setCategory(it as CategoryName);

    fastRaf(() => {
      container.scrollTo({top: categoriesContainer.offsetTop - 56, behavior: wasPinned ? 'instant' : 'smooth'});
    });
  }

  const allowedOwnedGifts = createMemo(() => (
    unwrap(props.profileStore.items).filter((gift) => isStarGiftAllowed(gift, props.disallowedGifts))
  ));

  const filteredGiftOptions = createMemo(() => {
    const category$ = category();
    if(category$ === 'All') return props.giftOptions;
    if(category$ === 'Collectibles') {
      return props.giftOptions.filter((it) =>
        ((it.raw as StarGift.starGift).availability_remains > 0 && (it.raw as StarGift.starGift).upgrade_stars !== undefined) ||
        it.isResale
      );
    }
    return allowedOwnedGifts();
  });

  const handleGiftClick = async(item: MyStarGift) => {
    if(category() === 'Owned') {
      transferStarGift(item, props.peerId).then((result) => {
        if(result) {
          props.onClose();
        }
      });
      return
    }

    const gift = item.raw as StarGift.starGift;
    if(gift.availability_remains === 0 && !gift.resell_min_stars) {
      showStarGiftInfoPopup({gift: item});
      return;
    }

    if(gift.pFlags.require_premium && !rootScope.premium) {
      showPremiumPopup();
      return;
    }

    if(gift.per_user_total && !gift.per_user_remains) {
      toastNew({langPackKey: 'StarGiftLimitReached', langPackArguments: [gift.per_user_total]})
      return
    }

    if(gift.locked_until_date > tsNow(true)) {
      const result = await rootScope.managers.apiManager.invokeApi('payments.checkCanSendGift', {
        gift_id: gift.id
      })

      if(result._ === 'payments.checkCanSendGiftResultFail') {
        confirmationPopup({
          button: {langKey: 'OK', isCancel: true},
          description: wrapRichText(result.reason.text, {entities: result.reason.entities})
        });
        return;
      }
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
        container.classList.toggle(styles.isScrolled, container.scrollTop > 0);

        const containerRect = container.getBoundingClientRect();
        const rect = categoriesContainer.getBoundingClientRect();
        setIsPinned(approxEquals(rect.top - containerRect.top, 56, 0.1));
      }}
      onScrolledBottom={() => {
        if(category() === 'Owned') {
          props.profileStoreActions.loadNext();
        }
      }}
    >
      <div class={styles.mainContainer}>
        <div class={styles.mainHeader}>
          <ButtonIconTsx icon="close" aria-label={I18n.format('Close', true)} onClick={props.onClose} />
          <div class="popup-title">
            {i18n('StarGiftSendGift')}
          </div>
        </div>

        <div class={styles.recipientAvatar}>
          <img
            class={styles.recipientBackground}
            src={`assets/img/${maybe2x('stars_pay')}.png`}
            alt=""
          />
          <AvatarNewTsx peerId={props.peerId} size={100} />
        </div>

        {giftPremiumSection}

        <MediaHeader class={styles.intro}>
          <MediaHeader.Title>
            {isToSelf ? i18n('StarGiftSendGiftSelf') : i18n('StarGiftSendGift')}
          </MediaHeader.Title>
          <MediaHeader.Subtitle>
            <I18nTsx
              key={isToSelf ? 'SendStarGiftSubtitleSelf' : 'SendStarGiftSubtitle'}
              args={isToSelf ? undefined : [<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />]}
            />
          </MediaHeader.Subtitle>
        </MediaHeader>

        <ChipTabs
          value={category()}
          onChange={handleCategoryChanged}
          view={isPinned() ? 'secondary' : 'surface'}
          class={classNames(styles.categoriesContainer, isPinned() && styles.categoriesContainerPinned)}
          ref={categoriesContainer}
          center
        >
          <ChipTab value="All">
            {i18n('StarGiftCategoryAll')}
          </ChipTab>
          <Show when={!isToSelf && allowedOwnedGifts().length > 0}>
            <ChipTab value="Owned">
              {i18n('StarGiftCategoryOwned')}
            </ChipTab>
          </Show>
          <ChipTab value="Collectibles">
            {i18n('StarGiftCategoryCollectibles')}
          </ChipTab>
        </ChipTabs>

        <div class={styles.giftsGridContainer}>
          <Show when={category() === 'Owned' && props.profileStore.loading}>
            <PreloaderTsx />
          </Show>
          <StarGiftsGrid
            items={filteredGiftOptions()}
            view={category() === 'Owned' ? 'transfer' : 'list'}
            scrollParent={container}
            onClick={handleGiftClick}
          />
        </div>
      </div>
    </Scrollable>
  );
}

function createSomeOrAll<T>(options: () => T[]) {
  const [chosen, setChosen] = createSignal<T[] | null>(null);

  return [
    () => {
      const chosen$ = chosen();
      if(chosen$ === null) return options();
      return chosen$;
    },
    (value: T[] | null) => {
      if(value && (value.length === options().length || value.length === 0)) {
        value = null;
      }

      setChosen(value);
    },
    () => chosen() !== null
  ] as const
}

function ResaleOptionsPage(props: {
  gift: MyStarGift
  peerId: PeerId
  isFirst: boolean
  initialFilter?: StarGiftAttribute;
  onBack: () => void
  onClose: () => void
}) {
  const [total, setTotal] = createSignal<Long | null>(null);
  const [sort, setSort] = createSignal<'price' | 'date' | 'num'>('price');
  const [sortPopupVisible, setSortPopupVisible] = createSignal(false);
  const [items, setItems] = createSignal<MyStarGift[]>([]);
  const [loading, setLoading] = createSignal(true);

  const [modelOptions, setModelOptions] = createSignal<StarGiftAttribute.starGiftAttributeModel[]>([]);
  const [chosenModelOptions, setChosenModelOptions, hasChosenModelOptions] = createSomeOrAll(modelOptions);
  const [modelPopupVisible, setModelPopupVisible] = createSignal(false);

  const [patternOptions, setPatternOptions] = createSignal<StarGiftAttribute.starGiftAttributePattern[]>([]);
  const [chosenPatternOptions, setChosenPatternOptions, hasChosenPatternOptions] = createSomeOrAll(patternOptions);
  const [patternPopupVisible, setPatternPopupVisible] = createSignal(false);

  const [backdropOptions, setBackdropOptions] = createSignal<StarGiftAttribute.starGiftAttributeBackdrop[]>([]);
  const [chosenBackdropOptions, setChosenBackdropOptions, hasChosenBackdropOptions] = createSomeOrAll(backdropOptions);
  const [backdropPopupVisible, setBackdropPopupVisible] = createSignal(false);

  if(props.initialFilter) {
    switch(props.initialFilter._) {
      case 'starGiftAttributeModel':
        setChosenModelOptions([props.initialFilter]);
        break;
      case 'starGiftAttributePattern':
        setChosenPatternOptions([props.initialFilter]);
        break;
      case 'starGiftAttributeBackdrop':
        setChosenBackdropOptions([props.initialFilter]);
        break;
    }
  }

  let offset = '';
  let attributesHash: Long = 0;
  let tempId = 0;
  const countersMap = new Map<string, number>();

  function getCounterKey(attribute: StarGiftAttributeId | StarGiftAttribute) {
    switch(attribute._) {
      case 'starGiftAttributeModel':
      case 'starGiftAttributePattern':
        return `model:${attribute.document.id}`;
      case 'starGiftAttributeIdModel':
      case 'starGiftAttributeIdPattern':
        return `model:${attribute.document_id}`;
      case 'starGiftAttributeIdBackdrop':
      case 'starGiftAttributeBackdrop':
        return `backdrop:${attribute.backdrop_id}`;
    }
  }

  let lastRequestedOffset: string | null = null;
  async function loadMore() {
    const _tempId = tempId;
    if(lastRequestedOffset === offset) return;
    if(offset === undefined) return; // no more items
    lastRequestedOffset = offset;

    const filters: StarGiftAttributeId[] = [];
    if(hasChosenModelOptions()) {
      for(const option of chosenModelOptions()) {
        filters.push({_: 'starGiftAttributeIdModel', document_id: option.document.id});
      }
    }
    if(hasChosenPatternOptions()) {
      for(const option of chosenPatternOptions()) {
        filters.push({_: 'starGiftAttributeIdPattern', document_id: option.document.id});
      }
    }
    if(hasChosenBackdropOptions()) {
      for(const option of chosenBackdropOptions()) {
        filters.push({_: 'starGiftAttributeIdBackdrop', backdrop_id: option.backdrop_id});
      }
    }

    const res = await rootScope.managers.appGiftsManager.getResaleOptions({
      giftId: props.gift.raw.id,
      sort: sort(),
      attributesHash,
      filters,
      offset
    })

    if(_tempId !== tempId) return;

    if(res.counters) {
      for(const it of res.counters) {
        countersMap.set(getCounterKey(it.attribute), it.count);
      }
    }

    if(res.attributes) {
      // ! filter attributes with 0 counts because they dont work server-side
      setModelOptions(res.attributes.models.filter(it => countersMap.get(getCounterKey(it)) ?? 0 > 0));
      setPatternOptions(res.attributes.patterns.filter(it => countersMap.get(getCounterKey(it)) ?? 0 > 0));
      setBackdropOptions(res.attributes.backdrops.filter(it => countersMap.get(getCounterKey(it)) ?? 0 > 0));
      attributesHash = res.attributesHash;
    }

    setItems((prev) => [...prev, ...res.items]);
    offset = res.next;
    setTotal(res.count);
    setLoading(false);
  }

  onMount(() => {
    loadMore();
  });

  function loadFromStart() {
    offset = ''
    setItems([])
    countersMap.clear()
    attributesHash = 0;
    lastRequestedOffset = null;
    tempId += 1;
    setLoading(true);

    loadMore();
  }

  subscribeOn(rootScope)('star_gift_update', (event) => {
    const idx = items().findIndex((it) => inputStarGiftEquals(it, event.input));
    if(idx !== -1) {
      if(event.resalePrice) {
        loadFromStart();
      } else {
        updateStarGift(items()[idx], event);
      }
    }
  })

  createEffect(on(
    () => [sort(), hasChosenModelOptions(), hasChosenPatternOptions(), hasChosenBackdropOptions()],
    loadFromStart,
    {defer: true}
  ));

  const SORT_OPTIONS: Record<'price' | 'date' | 'num', {icon: Icon, text: LangPackKey}> = {
    price: {
      icon: 'sort_price',
      text: 'StarGiftResaleSortPriceShort'
    },
    date: {
      icon: 'sort_date',
      text: 'StarGiftResaleSortDateShort'
    },
    num: {
      icon: 'sort_num',
      text: 'StarGiftResaleSortNumShort'
    }
  };

  let container!: HTMLDivElement

  return (
    <div class={styles.secondPageContainer}>
      <div class={styles.resaleHeader}>
        <div class={styles.resaleHeaderInner}>
          <ButtonIconTsx
            icon={props.isFirst ? 'close' : 'back'}
            aria-label={I18n.format('Close', true)}
            onClick={props.isFirst ? props.onClose : props.onBack}
          />
          <div class={`popup-title ${styles.resaleTitle}`}>
            {props.gift.raw.title}
            <I18nTsx
              class={styles.resaleSubtitle}
              key="StarGiftResaleSubtitle"
              args={[total() !== null ? numberThousandSplitter(total()) : '...']}
            />
          </div>
        </div>
        <div class={styles.resaleFilters}>
          <Scrollable axis="x">
            <div
              class={`${styles.resaleFilterChip} ${styles.resaleFilterChipSort} btn-menu-toggle`}
              role="button"
              tabindex={0}
              aria-haspopup="menu"
              aria-expanded={sortPopupVisible()}
              ref={(el) => {
                ButtonMenuToggle({
                  container: el,
                  appendTo: getOverlayRoot(),
                  onOpen: (e, menu) => {
                    setSortPopupVisible(true);
                    positionMenuTrigger(el, menu, 'bottom-right', {top: 8})
                  },
                  onClose: () => setSortPopupVisible(false),
                  direction: 'bottom-right',
                  buttons: [
                    {
                      icon: 'sort_price',
                      text: 'StarGiftResaleSortPrice',
                      onClick: () => setSort('price')
                    },
                    {
                      icon: 'sort_date',
                      text: 'StarGiftResaleSortDate',
                      onClick: () => setSort('date')
                    },
                    {
                      icon: 'sort_num',
                      text: 'StarGiftResaleSortNum',
                      onClick: () => setSort('num')
                    }
                  ]
                })
              }}
            >
              <IconTsx icon={SORT_OPTIONS[sort()].icon} />
              <I18nTsx key={SORT_OPTIONS[sort()].text} />
            </div>

            <ButtonMenuSelect<StarGiftAttribute.starGiftAttributeModel>
              value={chosenModelOptions()}
              onValueChange={setChosenModelOptions}
              options={modelOptions()}
              deselectAllOnFirstSelect
              needStickerRenderer
              renderOption={(props) => {
                let stickerRef: HTMLDivElement;
                onMount(() => {
                  props.stickerRenderer.renderSticker(props.option.document as any, stickerRef);
                  props.stickerRenderer.observeAnimated(stickerRef);
                })
                return (
                  <>
                    <div class="btn-menu-item-icon" ref={stickerRef} />
                    <div class="btn-menu-item-text">
                      <ButtonMenuSelectText
                        text={props.option.name}
                        highlight={props.highlight}
                      />
                      <span class={styles.resaleFilterChipCount}>
                        {' '}
                        {countersMap.get(getCounterKey(props.option)) ?? 0}
                      </span>
                    </div>
                    {props.chosen && <IconTsx icon="check" class="btn-menu-item-icon-right" />}
                  </>
                );
              }}
              optionSearchText={(it) => it.name}
              optionKey={(it) => String(it.document.id)}
              onToggleMenu={setModelPopupVisible}
              direction="bottom-right"
            >
              <div
                class={styles.resaleFilterChip}
                role="button"
                tabindex={0}
                aria-haspopup="menu"
                aria-expanded={modelPopupVisible()}
                onKeyDown={buttonKeyDown}
              >
                <I18nTsx
                  key={hasChosenModelOptions() ? 'StarGiftNModels' : 'StarGiftModel'}
                  args={[String(chosenModelOptions().length)]}
                />
                <IconTsx icon={modelPopupVisible() ? 'down_up' : 'up_down'} />
              </div>
            </ButtonMenuSelect>

            <ButtonMenuSelect<StarGiftAttribute.starGiftAttributeBackdrop>
              value={chosenBackdropOptions()}
              onValueChange={setChosenBackdropOptions}
              options={backdropOptions()}
              deselectAllOnFirstSelect
              renderOption={(props) => (
                <>
                  <div class="btn-menu-item-icon">
                    <div
                      class={styles.resaleFilterChipBackdrop}
                      style={{
                        '--backdrop-center-color': rgbIntToHex(props.option.center_color),
                        '--backdrop-edge-color': rgbIntToHex(props.option.edge_color)
                      }}
                    />
                  </div>
                  <div class="btn-menu-item-text">
                    <ButtonMenuSelectText
                      text={props.option.name}
                      highlight={props.highlight}
                    />
                    <span class={styles.resaleFilterChipCount}>
                      {' '}
                      {countersMap.get(getCounterKey(props.option)) ?? 0}
                    </span>
                  </div>
                  {props.chosen && <IconTsx icon="check" class="btn-menu-item-icon-right" />}
                </>
              )}
              optionSearchText={(it) => it.name}
              optionKey={(it) => String(it.backdrop_id)}
              onToggleMenu={setBackdropPopupVisible}
              direction="bottom-left"
            >
              <div
                class={styles.resaleFilterChip}
                role="button"
                tabindex={0}
                aria-haspopup="menu"
                aria-expanded={backdropPopupVisible()}
                onKeyDown={buttonKeyDown}
              >
                <I18nTsx
                  key={hasChosenBackdropOptions() ? 'StarGiftNBackdrops' : 'StarGiftBackdrop'}
                  args={[String(chosenBackdropOptions().length)]}
                />
                <IconTsx icon={backdropPopupVisible() ? 'down_up' : 'up_down'} />
              </div>
            </ButtonMenuSelect>

            <ButtonMenuSelect<StarGiftAttribute.starGiftAttributePattern>
              value={chosenPatternOptions()}
              onValueChange={setChosenPatternOptions}
              options={patternOptions()}
              deselectAllOnFirstSelect
              needStickerRenderer
              stickerOptions={{textColor: 'primary-text-color'}}
              renderOption={(props) => {
                let stickerRef: HTMLDivElement;
                onMount(() => {
                  props.stickerRenderer.renderSticker(props.option.document as any, stickerRef);
                  props.stickerRenderer.observeAnimated(stickerRef);
                })
                return (
                  <>
                    <div class="btn-menu-item-icon" ref={stickerRef} />
                    <div class="btn-menu-item-text">
                      <ButtonMenuSelectText
                        text={props.option.name}
                        highlight={props.highlight}
                      />
                      <span class={styles.resaleFilterChipCount}>
                        {' '}
                        {countersMap.get(getCounterKey(props.option)) ?? 0}
                      </span>
                    </div>
                    {props.chosen && <IconTsx icon="check" class="btn-menu-item-icon-right" />}
                  </>
                );
              }}
              optionSearchText={(it) => it.name}
              optionKey={(it) => String(it.document.id)}
              onToggleMenu={setPatternPopupVisible}
              direction="bottom-left"
            >
              <div
                class={styles.resaleFilterChip}
                role="button"
                tabindex={0}
                aria-haspopup="menu"
                aria-expanded={patternPopupVisible()}
                onKeyDown={buttonKeyDown}
              >
                <I18nTsx
                  key={hasChosenPatternOptions() ? 'StarGiftNPatterns' : 'StarGiftPattern'}
                  args={[String(chosenPatternOptions().length)]}
                />
                <IconTsx icon={patternPopupVisible() ? 'down_up' : 'up_down'} />
              </div>
            </ButtonMenuSelect>
          </Scrollable>
        </div>
      </div>

      <div class={styles.secondPageBody}>
        <Scrollable ref={container} onScrolledBottom={loadMore}>
          <Animated type="cross-fade">
            <Show
              when={!loading() && items().length > 0}
              fallback={loading() ? <PreloaderTsx /> : (
                <div class={styles.emptyPlaceholder}>
                  <I18nTsx key="StarGiftResaleNothingFound" />
                </div>
              )}
            >
              <StarGiftsGrid
                class={styles.resaleGrid}
                items={items()}
                view="resale"
                scrollParent={container}
                autoplay={false} // ! todo: need shared canvas for decent performance
                onClick={(item) => {
                  const popup = showStarGiftInfoPopup({
                    gift: item,
                    resaleRecipient: props.peerId,
                    onClickAway: props.onClose,
                    onAttributeClick: (attribute) => {
                      switch(attribute._) {
                        case 'starGiftAttributeModel':
                          setChosenModelOptions([attribute]);
                          break;
                        case 'starGiftAttributeBackdrop':
                          setChosenBackdropOptions([attribute]);
                          break;
                        case 'starGiftAttributePattern':
                          setChosenPatternOptions([attribute]);
                          break;
                      }
                      popup.hide();
                    }
                  })
                }}
              />
            </Show>
          </Animated>
        </Scrollable>
      </div>
    </div>
  );
}

function StarGiftLimitedProgress(props: {
  gift: StarGift.starGift
}) {
  // NB: deliberately not reactive, gift won't change
  const left = i18n('StarGiftLimitedLeft', [props.gift.availability_remains]);

  const progress = 100 * props.gift.availability_remains / props.gift.availability_total;

  return (
    <div class={styles.limitedProgressWrap}>
      <div class={styles.limitedProgressBar}>
        <div class={styles.limitedProgressProgress} style={{width: `${100 * props.gift.availability_remains / props.gift.availability_total}%`}} />
        <div class={styles.limitedProgressText} style={{
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
  disallowedGifts?: DisallowedGifts
  onBack: () => void
  onClose: () => void
}) {
  const giftPolicy = props.chosenGift.type === 'stargift' ?
    getStarGiftSendPolicy(props.chosenGift, props.disallowedGifts) : undefined;
  const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();
  const [anonymous, setAnonymous] = createSignal(false);
  const [payWithStars, setPayWithStars] = createSignal(false);
  const [withUpgrade, setWithUpgrade] = createSignal(!!giftPolicy?.forceUpgrade);
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
      days: props.chosenGift.months * 30
    }
  }));

  async function handleSubmit() {
    setSending(true);
    let invoice: InputInvoice;
    if(props.chosenGift.type === 'stargift') {
      const peer = await rootScope.managers.appPeersManager.getInputPeerById(props.peerId)
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

    try {
      const popup = await createPaymentPopup({
        inputInvoice: invoice,
        noShowIfStars: true,
        purpose: 'stargift'
      });
      popup.addEventListener('finish', (result) => {
        if(result === 'paid' || result === 'pending') {
          props.onClose();
          if(
            props.chosenGift.type === 'stargift' &&
            props.chosenGift.raw._ === 'starGift' &&
            props.chosenGift.raw.per_user_total &&
            props.chosenGift.raw.per_user_remains
          ) {
            toastNew({
              langPackKey: 'StarGiftLimitSent',
              langPackArguments: [props.chosenGift.raw.per_user_remains - 1]
            })
          }
        } else {
          setSending(false);
        }
      });
    } catch(err) {
      setSending(false);
      toastNew({langPackKey: 'Error.AnError'});
      console.error('send gift error', err);
    }
  }

  return (
    <div class={styles.secondPageContainer}>
      <div class={styles.secondPageHeader}>
        <ButtonIconTsx
          icon="back"
          aria-label={I18n.format('StarsRating.Back', true)}
          onClick={props.onBack}
        />
        <div class="popup-title">
          {i18n('StarGiftSendGift')}
        </div>
        {StarsBalance()}
      </div>

      <div class={styles.secondPageBody}>
        <Scrollable>
          <FakeBubbles peerId={props.peerId} class={styles.bubblesContainer}>
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

          <div class={styles.formSheet}>
            {props.chosenGift.type === 'stargift' && (props.chosenGift.raw as StarGift.starGift).availability_total && (
              <StarGiftLimitedProgress gift={props.chosenGift.raw as StarGift.starGift} />
            )}
            <InputFieldTsx
              class={styles.formInput}
              placeholder='StarGiftMessagePlaceholder'
              instanceRef={(input) => {
                input.input.setAttribute('aria-label', I18n.format('StarGiftMessagePlaceholder', true))
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
              <Row>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    checked={anonymous()}
                    toggle
                    onChange={setAnonymous}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title>{i18n('StarGiftHideMyName')}</Row.Title>
              </Row>
            )}
            {'months' in props.chosenGift && props.chosenGift.priceStars && (
              <Row>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    checked={payWithStars()}
                    toggle
                    onChange={setPayWithStars}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title>
                  <I18nTsx
                    key="PayWithStars"
                    args={[
                      <StarsStar />,
                      numberThousandSplitterForStars(props.chosenGift.priceStars)
                    ]}
                  />
                </Row.Title>
              </Row>
            )}
          </div>
          <div class={styles.formHint}>
            {props.chosenGift.type === 'stargift' ? i18n('StarGiftHideMyNameHint', [
              wrapRichText(props.peerName),
              wrapRichText(props.peerName)
            ]) : ''}
          </div>

          {props.chosenGift.type === 'stargift' &&
            (props.chosenGift.raw as StarGift.starGift).upgrade_stars &&
            giftPolicy?.upgradeAllowed &&
            !giftPolicy.forceUpgrade && (
            <>
              <div class={styles.formSheet}>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      checked={withUpgrade()}
                      toggle
                      onChange={setWithUpgrade}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title>
                    <I18nTsx
                      key="StarGiftMakeUnique"
                      args={[
                        <StarsStar />,
                        numberThousandSplitterForStars((props.chosenGift.raw as StarGift.starGift).upgrade_stars)
                      ]}
                    >
                    </I18nTsx>
                  </Row.Title>
                </Row>
              </div>
              <div class={styles.formHint}>
                <I18nTsx
                  key="StarGiftMakeUniqueHint"
                  args={[
                    wrapRichText(props.peerName),
                    (() => {
                      const a = anchorCallback(() => createStarGiftUpgradePopup({
                        gift: props.chosenGift as MyStarGift,
                        descriptionForPeerId: props.peerId
                      }));
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
        class={`${styles.formSend} btn-primary btn-color-primary`}
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

export default async function showSendGiftPopup(options: {
  peerId: PeerId;
  birthday?: boolean;
  resaleParams?: {
    giftId: Long;
    filter?: StarGiftAttribute;
  };
}) {
  const {peerId, birthday, resaleParams} = options;
  const [show, setShow] = createSignal(true);
  let containerEl!: HTMLDivElement;

  const [profileStore, profileStoreActions] = createProfileGiftsStore({
    peerId: rootScope.myId,
    initialFilters: {
      unlimited: false,
      limited: false,
      upgradable: false
    }
  })
  const [loadedPremiumOptions, loadedGiftOptions, peer, cachedBirthdayNearby, userFull] = await Promise.all([
    peerId.isUser() ? rootScope.managers.appGiftsManager.getPremiumGiftOptions() : [] as MyPremiumGiftOption[],
    rootScope.managers.appGiftsManager.getStarGiftOptions(),
    rootScope.managers.appPeersManager.getPeer(peerId),
    peerId.isUser() ? rootScope.managers.appPromoManager.isCachedBirthdayNearby(peerId).catch(() => false) : false,
    peerId.isUser() && peerId !== rootScope.myId ?
      rootScope.managers.appProfileManager.getProfile(peerId.toUserId()).catch((): undefined => undefined) : undefined,
    !resaleParams && peerId !== rootScope.myId && profileStoreActions.loadNext()
  ]);
  const disallowedGifts = userFull?.disallowed_gifts?.pFlags;
  const premiumOptions = disallowedGifts?.disallow_premium_gifts ? [] : loadedPremiumOptions;
  const allowedGiftOptions = loadedGiftOptions.filter((gift) => isStarGiftAllowed(gift, disallowedGifts));
  const allowedOwnedGifts = unwrap(profileStore.items).filter((gift) => isStarGiftAllowed(gift, disallowedGifts));
  const isBirthday = birthday || cachedBirthdayNearby || isBirthdayNearby(userFull?.birthday);
  const giftOptions = isBirthday ? prioritizeBirthdayGifts(allowedGiftOptions) : allowedGiftOptions;
  const hasAvailableGift = premiumOptions.length > 0 ||
    giftOptions.length > 0 ||
    allowedOwnedGifts.length > 0;

  if(!resaleParams && peer._ === 'user' && peerId !== rootScope.myId && !hasAvailableGift) {
    setShow(false);
    toastNew({langPackKey: 'GiftRecipientDoesNotAccept'});
    return;
  }

  const [chosenGift, setChosenGift] = createSignal<GiftOption>();
  if(resaleParams) {
    const selectedGift = giftOptions.find((it) => it.raw.id === resaleParams.giftId && it.isResale);
    if(!selectedGift && disallowedGifts &&
      loadedGiftOptions.some((it) => it.raw.id === resaleParams.giftId && it.isResale)) {
      setShow(false);
      toastNew({langPackKey: 'GiftRecipientDoesNotAccept'});
      return;
    }

    setChosenGift(selectedGift);
  }

  const [currentPage, setCurrentPage] = createSignal(resaleParams ? 2 : 0);

  const secondPageNavigationItem: NavigationItem = {
    type: 'left',
    onPop: () => void setCurrentPage(0)
  }

  onCleanup(() => {
    appNavigationController.removeItem(secondPageNavigationItem);
  });

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      closable
      show={show()}
      containerProps={{ref: (element) => containerEl = element}}
    >
      <TransitionSliderTsx
        type="navigation"
        transitionTime={150}
        animateFirst={false}
        onTransitionStart={(id) => {
          containerEl.classList.toggle(styles.isChosenGift, id === 1);

          if(id === 0) {
            appNavigationController.removeItem(secondPageNavigationItem);
          } else {
            appNavigationController.pushItem(secondPageNavigationItem);
          }
        }}
        onTransitionEnd={(id) => {
          if(id === 0) {
            setChosenGift(undefined);
          }
        }}
        currentPage={currentPage()}
      >
        <GiftOptionsPage
          peer={peer as User.user | Chat.channel}
          peerId={peerId}
          premiumOptions={premiumOptions}
          giftOptions={giftOptions}
          disallowedGifts={disallowedGifts}
          onGiftChosen={(option) => {
            setChosenGift(option);
            setCurrentPage((option as MyStarGift).isResale ? 2 : 1);
          }}
          onClose={() => setShow(false)}
          profileStore={profileStore}
          profileStoreActions={profileStoreActions}
        />
        <Show when={chosenGift() !== undefined && !(chosenGift() as MyStarGift).isResale}>
          <ChosenGiftPage
            peerId={peerId}
            peerName={peer._ === 'user' ? peer.first_name : peer.title}
            chosenGift={chosenGift()}
            disallowedGifts={disallowedGifts}
            onBack={() => setCurrentPage(0)}
            onClose={() => setShow(false)}
          />
        </Show>
        <Show when={chosenGift() !== undefined && (chosenGift() as MyStarGift).isResale}>
          <ResaleOptionsPage
            gift={chosenGift() as MyStarGift}
            peerId={peerId}
            isFirst={resaleParams !== undefined}
            onBack={() => setCurrentPage(0)}
            onClose={() => setShow(false)}
            initialFilter={resaleParams?.filter}
          />
        </Show>
      </TransitionSliderTsx>
      <FloatingStarsBalance class={styles.starsBalance} />
    </PopupElement>
  ));
}
