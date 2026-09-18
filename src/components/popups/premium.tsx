import PopupElement, {createPopup} from '@components/popups/indexTsx';
import PromoSlideTab, {getGiftDetails} from '@components/premium/promoSlideTab';
import TransitionSlider from '@components/transition';
import FeatureSlideTab from '@components/premium/featureSlideTab';
import I18n, {FormatterArguments} from '@lib/langPack';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {HelpPremiumPromo, MessageAction, PaymentsCheckedGiftCode, PremiumSubscriptionOption} from '@layer';
import {PREMIUM_FEATURES, PremiumPromoFeature} from '@components/premium/featuresConfig';
import Icon from '@components/icon';
import {Middleware} from '@helpers/middleware';
import {AppManagers} from '@lib/managers';
import appImManager, {ChatSetPeerOptions} from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {applyGiftCode} from '@components/popups/giftLink';

export type PopupPremiumProps = {
  order: PremiumPromoFeatureType[],
  features: PremiumPromoFeature[],
  middleware: Middleware,
  managers: AppManagers,
  premiumPromo: HelpPremiumPromo,
  appConfig: MTAppConfig,
  isPremiumActive?: boolean,
  gift: MessageAction.messageActionGiftPremium | PaymentsCheckedGiftCode,
  peerId: PeerId,
  emojiStatusId?: DocId,
  isOut: boolean,
  type: 'premium' | 'gift',
  stack: ChatSetPeerOptions['stack'],
  listenerSetter: ListenerSetter
};

import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import {i18n} from '@lib/langPack';

export type PopupPremiumOptions = {
  feature?: PremiumPromoFeatureType,
  gift?: PopupPremiumProps['gift'],
  peerId?: PeerId,
  isOut?: boolean,
  stack?: PopupPremiumProps['stack'],
  emojiStatusId?: DocId
};

export default function showPremiumPopup(options: PopupPremiumOptions = {}) {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const [show, setShow] = createSignal(false);
  const [hasActionButton, setHasActionButton] = createSignal(false);
  const deferredCloseCallbacks: (() => void)[] = [];

  let props: PopupPremiumProps;
  let giftDetails: ReturnType<typeof getGiftDetails>;
  let promoSlideTab: PromoSlideTab;
  let featureSlideTab: FeatureSlideTab;
  let transition: ReturnType<typeof TransitionSlider>;
  let tabsContainer: HTMLElement;
  let actionButton: HTMLButtonElement;
  let actionButtonText: I18n.IntlElement;
  let selectedFeature: PremiumPromoFeature;
  let selectedTab: number;
  let option: PremiumSubscriptionOption;
  let wrapCurrency: (amount: Long) => string;

  let headerEl!: HTMLDivElement, bodyEl!: HTMLDivElement;

  const prepareArguments = async(obj: {
    _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>,
    _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>
  }) => {
    const [titleLangArgs, subtitleLangArgs] = await Promise.all([
      obj._titleLangArgs,
      obj._subtitleLangArgs
    ].map((c) => c && c(rootScope.managers)));

    return {titleLangArgs, subtitleLangArgs};
  };

  function filterOrder(premiumPromo: HelpPremiumPromo, order: PremiumPromoFeatureType[]) {
    return (order || []).filter((feature) => {
      const hasFeature = !!PREMIUM_FEATURES[feature];
      if(!hasFeature) {
        console.warn('premium feature is not implemented', feature);
        const videoIndex = premiumPromo.video_sections.indexOf(feature);
        if(videoIndex !== -1) {
          premiumPromo.video_sections.splice(videoIndex, 1);
          premiumPromo.videos.splice(videoIndex, 1);
        }
      }

      return hasFeature;
    });
  }

  async function createFeatures(premiumPromo: HelpPremiumPromo, order: PremiumPromoFeatureType[]) {
    return Promise.all(order.map(async(feature) => {
      const f = PREMIUM_FEATURES[feature];

      let content = f.content;
      if(content) {
        content = await Promise.all(content.map(async(c) => {
          return {
            ...(await prepareArguments(c)),
            ...c
          };
        }));
      }

      const video = premiumPromo.videos[premiumPromo.video_sections.indexOf(feature)];
      const ff = {
        ...(await prepareArguments(f)),
        ...f,
        ...{content},
        video
      } as PremiumPromoFeature;
      if(video) ff.videoPosition ??= 'bottom';

      return ff;
    }));
  }

  async function initTabs() {
    const [premiumPromo, appConfig] = await Promise.all([
      rootScope.managers.appPaymentsManager.getPremiumPromo(),
      rootScope.managers.apiManager.getAppConfig()
    ]);

    const order = filterOrder(premiumPromo, appConfig.premium_promo_order);

    const isPremiumActive = rootScope.premium;
    props = {
      order,
      features: await createFeatures(premiumPromo, order),
      premiumPromo,
      managers: rootScope.managers,
      middleware: middleware,
      appConfig,
      isPremiumActive,
      gift: options.gift,
      peerId: options.peerId || options.stack?.peerId,
      emojiStatusId: options.emojiStatusId,
      isOut: options.isOut || options.stack?.isOut,
      type: options.gift ? 'gift' : 'premium',
      stack: options.stack,
      listenerSetter: listenerSetter
    };

    giftDetails = getGiftDetails(props);

    option = props.premiumPromo.period_options[0];
    const shortestOption = props.premiumPromo.period_options.slice().sort((a, b) => a.months - b.months)[0];
    wrapCurrency = (amount) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

    const headerBackground = document.createElement('div');
    headerBackground.classList.add('popup-header-background');
    headerEl.prepend(headerBackground);

    createTransitionSlider();
    createActionButton();
    await createPromoSlideTab();
    createFeatureSlideTab();

    const tabs = [promoSlideTab.tab, featureSlideTab.tab].filter(Boolean);
    tabs.forEach((tab) => {
      tab.classList.add('tabs-tab', 'premium-tab');
    });
    tabsContainer.append(...tabs);

    options.feature && await selectFeature(options.feature);
    transition(options.feature ? 1 : 0);

    setShow(true);
  }

  const selectFeature = async(feature: PremiumPromoFeatureType) => {
    selectedFeature = props.features.find((f) => f.feature === feature);
    await featureSlideTab.setCarouselSlide(feature);
    updateActionLayout(selectedFeature);
  };

  function createTransitionSlider() {
    transition = TransitionSlider({
      content: tabsContainer,
      type: 'navigation',
      transitionTime: 150,
      animateFirst: false,
      onTransitionEnd: (id) => {
        selectedTab = id;
        if(id) {
          featureSlideTab.featureCarousel.ready(updateActionLayout);
        } else {
          updateActionLayout();
        }
      }
    });
  }

  function createActionButton() {
    if(props.type === 'gift') {
      if(giftDetails.isOutbound || !giftDetails.isUnclaimed) {
        return;
      }
    }

    actionButtonText = new I18n.IntlElement({key: 'OK'});
    setHasActionButton(true);
  }

  // every branch closes the popup through `setShow` itself, so the button is told not to
  const onActionClick = () => {
    if(props.type === 'gift') {
      // `applyGiftCode` disables the button for as long as it is in flight
      const gift = props.gift as PaymentsCheckedGiftCode;
      applyGiftCode(gift.slug, actionButton, () => setShow(false));
    } else if(props.isPremiumActive) {
      setShow(false);
    } else {
      buyPremium();
    }

    return false;
  };

  async function createPromoSlideTab() {
    promoSlideTab = new PromoSlideTab({
      container: tabsContainer,
      header: headerEl,
      body: bodyEl,
      ...props
    });

    promoSlideTab.transition = transition;
    promoSlideTab.selectFeature = selectFeature;
    promoSlideTab.selectPeriod = (option) => {
      option = option;
      updateActionLayout();
    };
    promoSlideTab.close = close;
    await promoSlideTab.initPromise;
  }

  function createFeatureSlideTab() {
    featureSlideTab = new FeatureSlideTab({
      header: headerEl.cloneNode(true) as HTMLElement,
      ...props
    });
    featureSlideTab.transition = transition;
  }

  const updateActionLayout = (feature?: PremiumPromoFeature) => {
    if(!actionButtonText) {
      return;
    }

    if(props.type === 'gift') {
      const {isOutbound, isUnclaimed} = giftDetails;
      if(!isOutbound && isUnclaimed) {
        actionButtonText.compareAndUpdate({
          key: 'GiftPremiumActivateForFree'
        });
      }

      return;
    }

    if(props.isPremiumActive) {
      return;
    }

    actionButtonText.compareAndUpdate({
      key: feature?.actionTitleLangKey || 'Premium.Boarding.Subscribe',
      args: [wrapCurrency(+option.amount / option.months)]
    });

    const previousIcon = actionButton.querySelector('.tgico');
    const newIcon = feature?.actionIcon && Icon(feature.actionIcon, 'row-icon', 'action-button-icon');
    if(!newIcon) previousIcon?.remove();
    else if(previousIcon) previousIcon?.replaceWith(newIcon);
    else actionButton.append(newIcon);
  };

  const close = (callback?: () => void) => {
    callback && deferredCloseCallbacks.push(callback);
    setShow(false);
  };

  // the popup stays clickable while its hide animation runs, and every further click would
  // queue another `openUrl` — the click listener this replaced was a `once` one
  let buying = false;
  function buyPremium() {
    if(buying) return;
    buying = true;

    close(() => {
      appImManager.openUrl(option.bot_url);
    });
  }

  createPopup(() => {
    onMount(() => {
      initTabs();
    });

    onCleanup(() => {
      featureSlideTab?.cleanup();
      promoSlideTab?.tab.remove();
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    return (
      <PopupElement
        class="popup-premium"
        closable
        show={show()}
        onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
      >
        <PopupElement.Header ref={(element) => headerEl = element}>
          <PopupElement.CloseButton />
          <PopupElement.Title title="Premium.Boarding.Title" />
        </PopupElement.Header>
        <PopupElement.Body ref={(element) => bodyEl = element} />
        {/* the header and the body above are moved into the promo tab, which lives in here */}
        <div class="tabs-container premium-tabs" ref={(element) => tabsContainer = element} />
        <Show when={hasActionButton()}>
          <PopupElement.Footer>
            <PopupElement.FooterButton
              class="popup-gift-premium-confirm action-button shimmer"
              ref={(element) => actionButton = element as HTMLButtonElement}
              callback={onActionClick}
            >
              {actionButtonText.element}
            </PopupElement.FooterButton>
          </PopupElement.Footer>
        </Show>
      </PopupElement>
    );
  });
}
