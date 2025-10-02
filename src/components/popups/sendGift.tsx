import bigInt from 'big-integer';
import PopupElement from '.';
import {Chat, InputInvoice, Message, StarGift, StarGiftAttribute, StarGiftAttributeId, TextWithEntities, User} from '../../layer';
import {MyPremiumGiftOption, MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {AvatarNewTsx} from '../avatarNew';
import {i18n, LangPackKey} from '../../lib/langPack';
import {Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Setter, Show} from 'solid-js';
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
import Row from '../rowTsx';
import CheckboxFieldTsx from '../checkboxFieldTsx';
import Button from '../buttonTsx';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import {PremiumGiftBubble} from '../chat/bubbles/premiumGift';
import {formatMonthsDuration} from '../../helpers/date';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {render} from 'solid-js/web';
import {ButtonIconTsx} from '../buttonIconTsx';
import numberThousandSplitter, {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import PopupPayment from './payment';
import useStars from '../../stores/stars';
import {TransitionSliderTsx} from '../transitionTsx';
import maybe2x from '../../helpers/maybe2x';
import {I18nTsx} from '../../helpers/solid/i18n';
import {StarGiftBadge} from '../stargifts/stargiftBadge';
import Scrollable from '../scrollable2';
import {approxEquals} from '../../helpers/number/approxEquals';
import {useAppState} from '../../stores/appState';
import PopupStarGiftUpgrade from './starGiftUpgrade';
import anchorCallback from '../../helpers/dom/anchorCallback';
import {PeerTitleTsx} from '../peerTitleTsx';

import styles from './sendGift.module.scss';
import ButtonMenuToggle from '../buttonMenuToggle';
import {IconTsx} from '../iconTsx';
import {ButtonMenuSelect, ButtonMenuSelectText} from '../buttonMenuSelect';
import {rgbIntToHex} from '../../helpers/color';
import {PreloaderTsx} from '../putPreloader';
import {FloatingStarsBalance} from './floatingStarsBalance';
import {positionMenuTrigger} from '../../helpers/positionMenu';
import {Transition} from '../../vendor/solid-transition-group';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {subscribeOn} from '../../helpers/solid/subscribeOn';
import {inputStarGiftEquals} from '../../lib/appManagers/utils/gifts/inputStarGiftEquals';
import {updateStarGift} from '../../lib/appManagers/utils/gifts/updateStarGift';
import {ChipTab, ChipTabs} from '../chipTabs';
import safeAssign from '../../helpers/object/safeAssign';
import PopupPremium from './premium';
import tsNow from '../../helpers/tsNow';
import confirmationPopup from '../confirmationPopup';
import {toastNew} from '../toast';

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
  const [isPinned, setIsPinned] = createSignal(false);
  const availableCategoriesSet = new Set<string>();
  for(const option of props.giftOptions) {
    availableCategoriesSet.add(String((option.raw as StarGift.starGift).stars));
  }
  const availableCategories = sortLongsArray([...availableCategoriesSet.values()]);

  const [category, setCategory] = createSignal<string>('All');

  let categoriesContainer!: HTMLDivElement;
  let container!: HTMLDivElement;

  const giftPremiumSection = props.peer._ === 'user' && (
    <>
      <div class={styles.mainTitle}>
        {i18n('GiftPremium')}
      </div>
      <div class={styles.mainSubtitle}>
        <I18nTsx
          key="GiftTelegramPremiumDescription"
          args={<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />}
        />
      </div>
      <div class={styles.premiumOptionsContainer}>
        <For each={props.premiumOptions}>
          {(option) => {
            return (
              <div class={styles.premiumOption} onClick={() => props.onGiftChosen(option)}>
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
    setCategory(it);

    fastRaf(() => {
      container.scrollTo({top: categoriesContainer.offsetTop - 56, behavior: wasPinned ? 'instant' : 'smooth'});
    });
  }

  const wrapCategory = (it: string) => (
    <ChipTab value={it}>
      {it in STATIC_CATEGORIES ? i18n(STATIC_CATEGORIES[it]) : (
          <>
            <StarsStar />
            {it}
          </>
        )}
    </ChipTab>
  );

  const filteredGiftOptions = createMemo(() => {
    const category$ = category();
    if(category$ === 'All') return props.giftOptions;
    if(category$ === 'Limited') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_total);
    if(category$ === 'InStock') return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).availability_remains === undefined || (it.raw as StarGift.starGift).availability_remains > 0);
    return props.giftOptions.filter((it) => (it.raw as StarGift.starGift).stars.toString() === category$);
  });

  const handleGiftClick = async(item: MyStarGift) => {
    const gift = item.raw as StarGift.starGift;
    if(gift.availability_remains === 0 && !gift.resell_min_stars) {
      PopupElement.createPopup(PopupStarGiftInfo, {gift: item});
      return;
    }

    if(gift.pFlags.require_premium && !rootScope.premium) {
      PopupPremium.show();
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
    >
      <div class={styles.mainContainer}>
        <div class={styles.mainHeader}>
          <ButtonIconTsx icon="close" onClick={props.onClose} />
          <div class="popup-title">
            {i18n('StarGiftSendGift')}
          </div>
        </div>

        <div class={styles.recipientAvatar}>
          <img
            class={styles.recipientBackground}
            src={`assets/img/${maybe2x('stars_pay')}.png`}
          />
          <AvatarNewTsx peerId={props.peerId} size={100} />
        </div>

        {giftPremiumSection}

        <div class={styles.mainTitle}>
          {i18n('StarGiftSendGift')}
        </div>
        <div class={styles.mainSubtitle}>
          <I18nTsx
            key="SendStarGiftSubtitle"
            args={<PeerTitleTsx peerId={props.peerId} onlyFirstName={props.peer._ === 'user'} />}
          />
        </div>

        <ChipTabs
          value={category()}
          onChange={handleCategoryChanged}
          view={isPinned() ? 'secondary' : 'surface'}
          class={classNames(styles.categoriesContainer, isPinned() && styles.categoriesContainerPinned)}
          ref={categoriesContainer}
        >
          {wrapCategory('All')}
          {wrapCategory('Limited')}
          {wrapCategory('InStock')}
          <For each={availableCategories}>
            {wrapCategory}
          </For>
        </ChipTabs>

        <div class={styles.giftsGridContainer}>
          <StarGiftsGrid
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
              ref={(el) => {
                ButtonMenuToggle({
                  container: el,
                  appendTo: document.body,
                  onOpen: (e, menu) => {
                    positionMenuTrigger(el, menu, 'bottom-right', {top: 8})
                  },
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
              class={styles.resaleFilterSelect}
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
              <div class={styles.resaleFilterChip}>
                <I18nTsx
                  key={hasChosenModelOptions() ? 'StarGiftNModels' : 'StarGiftModel'}
                  args={[String(chosenModelOptions().length)]}
                />
                <IconTsx icon={modelPopupVisible() ? 'down_up' : 'up_down'} />
              </div>
            </ButtonMenuSelect>

            <ButtonMenuSelect<StarGiftAttribute.starGiftAttributeBackdrop>
              class={styles.resaleFilterSelect}
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
              <div class={styles.resaleFilterChip}>
                <I18nTsx
                  key={hasChosenBackdropOptions() ? 'StarGiftNBackdrops' : 'StarGiftBackdrop'}
                  args={[String(chosenBackdropOptions().length)]}
                />
                <IconTsx icon={backdropPopupVisible() ? 'down_up' : 'up_down'} />
              </div>
            </ButtonMenuSelect>

            <ButtonMenuSelect<StarGiftAttribute.starGiftAttributePattern>
              class={styles.resaleFilterSelect}
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
              <div class={styles.resaleFilterChip}>
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
          <Transition name="fade">
            <Show
              when={!loading() && items().length > 0}
              fallback={loading() ? <PreloaderTsx /> : (
                <div class={styles.emptyPlaceholder}>
                  <I18nTsx key="StarGiftResaleNothingFound" />
                </div>
              )}
            >
              <StarGiftsGrid
                items={items()}
                view="resale"
                scrollParent={container}
                autoplay={false} // ! todo: need shared canvas for decent performance
                onClick={(item) => {
                  const popup = PopupElement.createPopup(PopupStarGiftInfo, {
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
          </Transition>
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
  left.classList.add(styles.limitedProgressLeft);

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
      const popup = await PopupPayment.create({
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

          {props.chosenGift.type === 'stargift' && (props.chosenGift.raw as StarGift.starGift).upgrade_stars && (
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

export default class PopupSendGift extends PopupElement {
  private chosenGift: Accessor<MyStarGift | MyPremiumGiftOption | undefined>;
  private setChosenGift: Setter<MyStarGift | MyPremiumGiftOption>;

  readonly peerId: PeerId;
  readonly resaleParams?: {
    giftId: Long;
    filter?: StarGiftAttribute;
  };

  constructor(options: {
    peerId: PeerId;
    resaleParams?: PopupSendGift['resaleParams'];
  }) {
    super(styles.popup, {
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

    safeAssign(this, options);

    this.construct();
  }

  private async construct() {
    const [premiumOptions, giftOptions, peer] = await Promise.all([
      this.peerId.isUser() ? this.managers.appGiftsManager.getPremiumGiftOptions() : [] as MyPremiumGiftOption[],
      this.managers.appGiftsManager.getStarGiftOptions(),
      this.managers.appPeersManager.getPeer(this.peerId)
    ]);

    const [chosenGift, setChosenGift] = createSignal<GiftOption>();
    if(this.resaleParams) {
      setChosenGift(giftOptions.find((it) => it.raw.id === this.resaleParams.giftId && it.isResale));
    }
    this.chosenGift = chosenGift;
    this.setChosenGift = setChosenGift;

    const [currentPage, setCurrentPage] = createSignal(this.resaleParams ? 2 : 0);

    const secondPageNavigationItem: NavigationItem = {
      type: 'left',
      onPop: () => void setCurrentPage(0)
    }

    onCleanup(() => {
      appNavigationController.removeItem(secondPageNavigationItem);
    });

    this.container.replaceChildren();
    const dispose = render(() => (
      <>
        <TransitionSliderTsx
          type="navigation"
          transitionTime={150}
          animateFirst={false}
          onTransitionStart={(id) => {
            this.container.classList.toggle(styles.isChosenGift, id === 1);

            if(id === 0) {
              appNavigationController.removeItem(secondPageNavigationItem);
            } else {
              appNavigationController.pushItem(secondPageNavigationItem);
            }
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
              setCurrentPage((option as MyStarGift).isResale ? 2 : 1);
            }}
            onClose={() => this.hide()}
          />
          <Show when={chosenGift() !== undefined && !(chosenGift() as MyStarGift).isResale}>
            <ChosenGiftPage
              peerId={this.peerId}
              peerName={peer._ === 'user' ? peer.first_name : peer.title}
              chosenGift={chosenGift()}
              onBack={() => setCurrentPage(0)}
              onClose={() => this.hide()}
            />
          </Show>
          <Show when={chosenGift() !== undefined && (chosenGift() as MyStarGift).isResale}>
            <ResaleOptionsPage
              gift={chosenGift() as MyStarGift}
              peerId={this.peerId}
              isFirst={this.resaleParams !== undefined}
              onBack={() => setCurrentPage(0)}
              onClose={() => this.hide()}
              initialFilter={this.resaleParams?.filter}
            />
          </Show>
        </TransitionSliderTsx>
        <FloatingStarsBalance class={styles.starsBalance} />
      </>
    ), this.container);

    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
