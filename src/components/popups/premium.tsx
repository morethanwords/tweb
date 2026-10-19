import {createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack, useContext} from 'solid-js';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import PromoSlide, {getGiftDetails} from '@components/premium/promoSlide';
import FeatureSlide from '@components/premium/featureSlide';
import TransitionSlider from '@components/transition';
import {FormatterArguments, i18n} from '@lib/langPack';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import {HelpPremiumPromo, MessageAction, PaymentsCheckedGiftCode, PremiumSubscriptionOption} from '@layer';
import {
  BUSINESS_FEATURES,
  BUSINESS_FEATURES_FALLBACK_ORDER,
  PREMIUM_FEATURES,
  PremiumPromoFeature
} from '@components/premium/featuresConfig';
import {IconTsx} from '@components/iconTsx';
import {PremiumPromoData} from '@components/premium/types';
import {AppManagers} from '@lib/managers';
import {ChatSetPeerOptions} from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {applyGiftCode} from '@components/popups/giftLink';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export type ShowPremiumPopupOptions = {
  feature?: PremiumPromoFeatureType,
  gift?: MessageAction.messageActionGiftPremium | PaymentsCheckedGiftCode,
  peerId?: PeerId,
  isOut?: boolean,
  stack?: ChatSetPeerOptions['stack'],
  emojiStatusId?: DocId,
  // where the offer was opened from, for the statistics: a link's `ref`
  ref?: string,
  /** Opens the Telegram Business feature set instead of the premium one. */
  business?: boolean
};

const prepareArguments = async(managers: AppManagers, obj: {
  _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>,
  _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>
}) => {
  const [titleLangArgs, subtitleLangArgs] = await Promise.all([
    obj._titleLangArgs,
    obj._subtitleLangArgs
  ].map((c) => c && c(managers)));

  return {titleLangArgs, subtitleLangArgs};
};

/** Drops the features this client doesn't render, and the promo videos that went with them. */
const filterOrder = (
  premiumPromo: HelpPremiumPromo,
  order: PremiumPromoFeatureType[],
  known: {[type in PremiumPromoFeatureType]?: PremiumPromoFeature}
) => {
  return (order || []).filter((feature) => {
    const hasFeature = !!known[feature];
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
};

const createFeatures = async(
  managers: AppManagers,
  premiumPromo: HelpPremiumPromo,
  order: PremiumPromoFeatureType[],
  known: {[type in PremiumPromoFeatureType]?: PremiumPromoFeature}
) => {
  return Promise.all(order.map(async(feature) => {
    const f = known[feature];

    let content = f.content;
    if(content) {
      content = await Promise.all(content.map(async(c) => ({
        ...(await prepareArguments(managers, c)),
        ...c
      })));
    }

    const video = premiumPromo.videos[premiumPromo.video_sections.indexOf(feature)];
    const built = {
      ...(await prepareArguments(managers, f)),
      ...f,
      content,
      video
    } as PremiumPromoFeature;
    // `videoPosition` doubles as "this slide has a phone mockup", so a feature the
    // promo carries no video for renders as a plain sheet rather than an empty frame.
    if(video) built.videoPosition ??= 'bottom';
    else delete built.videoPosition;

    return built;
  }));
};

/**
 * The settings sections the Business promo leads into once the account has Premium, as
 * Android's does: there it is the way into the editors. A feature with no editor on the
 * web keeps its slide.
 */
const BUSINESS_EDITORS: {[type in PremiumPromoFeatureType]?: string} = {
  business_hours: 'AppBusinessHoursTab',
  business_location: 'AppBusinessLocationTab',
  business_bots: 'AppChatAutomationTab',
  folder_tags: 'AppChatFoldersTab'
};

const openBusinessEditor = async(sectionId: string) => {
  const {openSectionTab} = await import('@lib/settingsSearch/openers');
  openSectionTab(sectionId, hotReloadGuard.appSidebarLeft, undefined);
};

/**
 * The Telegram Premium / Telegram Business promo. Two slides in a transition: the
 * feature list, and one feature at a time in a carousel.
 */
export default function showPremiumPopup(options: ShowPremiumPopupOptions = {}): void {
  // * the source the official clients report: the link's `ref`, else the feature opened on, else Settings
  const source = options.ref || options.feature || 'settings';
  const [show, setShow] = createSignal(false);
  const deferredCloseCallbacks: (() => void)[] = [];

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();
    onCleanup(() => listenerSetter.removeAll());

    const [data, setData] = createSignal<PremiumPromoData>();

    const close = (callback?: () => void) => {
      if(callback) deferredCloseCallbacks.push(callback);
      setShow(false);
    };

    (async() => {
      const [premiumPromo, appConfig] = await Promise.all([
        managers.appPaymentsManager.getPremiumPromo(),
        managers.apiManager.getAppConfig()
      ]);
      if(!middleware()) return;

      const known = options.business ? BUSINESS_FEATURES : PREMIUM_FEATURES;
      const configOrder = options.business ?
        (appConfig.business_promo_order || BUSINESS_FEATURES_FALLBACK_ORDER) :
        appConfig.premium_promo_order;
      const order = filterOrder(premiumPromo, configOrder, known);
      // * a feature opened by name that the server puts elsewhere - folder tags are among the business
      // * ones - still gets its slide, as Android's sheet for it shows it
      if(options.feature && known[options.feature] && !order.includes(options.feature)) {
        order.push(options.feature);
      }

      const features = await createFeatures(managers, premiumPromo, order, known);
      if(!middleware()) return;

      const type: PremiumPromoData['type'] = options.gift ?
        'gift' :
        (options.business ? 'business' : 'premium');

      setData({
        order,
        features,
        premiumPromo,
        appConfig,
        managers,
        middleware,
        listenerSetter,
        isPremiumActive: rootScope.premium,
        gift: options.gift,
        peerId: options.peerId || options.stack?.peerId,
        emojiStatusId: options.emojiStatusId,
        isOut: options.isOut ?? options.stack?.isOut,
        type,
        stack: options.stack
      });
      setShow(true);

      // Android reports the Business screen the same way, with the same sources
      if(type !== 'gift') {
        managers.appPaymentsManager.reportPremiumPromoShown(source);
      }
    })();

    return (
      <Show when={data()}>
        <PremiumContent data={data()} initialFeature={options.feature} source={source} close={close} />
      </Show>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-premium"
      closable
      show={show()}
      onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
    >
      <Inner />
    </PopupElement>
  ));
}

function PremiumContent(props: {
  data: PremiumPromoData,
  initialFeature?: PremiumPromoFeatureType,
  source: string,
  close: (callback?: () => void) => void
}) {
  const data = props.data;
  const [selectedFeature, setSelectedFeature] = createSignal(props.initialFeature || data.order[0]);
  const [tabIndex, setTabIndex] = createSignal(props.initialFeature ? 1 : 0);
  const [option, setOption] = createSignal<PremiumSubscriptionOption>(data.premiumPromo.period_options[0]);

  const shortestOption = data.premiumPromo.period_options.slice().sort((a, b) => a.months - b.months)[0];
  const wrapCurrency = (amount: Long) => paymentsWrapCurrencyAmount(amount, shortestOption.currency, false, true, true);

  let tabsEl!: HTMLDivElement;
  let transition: ReturnType<typeof TransitionSlider>;

  onMount(() => {
    transition = TransitionSlider({
      content: tabsEl,
      type: 'navigation',
      transitionTime: 150,
      animateFirst: false
    });

    createEffect(on(tabIndex, (value) => transition(value)));
  });

  const giftDetails = getGiftDetails(data);
  const feature = createMemo(() => (
    tabIndex() ? data.features.find((f) => f.feature === selectedFeature()) : undefined
  ));

  /** Nothing to buy: an already-premium account just dismisses the promo. */
  const isDismiss = () => data.type !== 'gift' && data.isPremiumActive;

  const buttonText = createMemo(() => {
    if(data.type === 'gift') {
      return i18n('GiftPremiumActivateForFree');
    }

    if(isDismiss()) {
      return i18n('OK');
    }

    return i18n(
      feature()?.actionTitleLangKey || 'Premium.Boarding.Subscribe',
      [wrapCurrency(+option().amount / option().months)]
    );
  });

  // the popup stays clickable while its hide animation runs, and every further click would
  // queue another `openUrl`
  let buying = false;
  const buyPremium = () => {
    if(buying) return;
    buying = true;

    data.managers.appPaymentsManager.reportPremiumPromoAccepted();
    props.close(() => {
      const {premium_bot_username, premium_invoice_slug} = data.appConfig;
      const selected = option();
      if(selected?.bot_url) {
        hotReloadGuard.appImManager.openUrl(selected.bot_url);
      } else if(premium_bot_username) {
        // * a period with no link of its own goes through the Premium bot, told where the user came from
        hotReloadGuard.appImManager.openUsername({userName: premium_bot_username, startParam: props.source});
      } else if(premium_invoice_slug) {
        hotReloadGuard.appImManager.openUrl('https://t.me/$' + premium_invoice_slug);
      }
    });
  };

  // every branch closes the popup through `close` itself, so the button is told not to
  const onActionClick = () => {
    if(data.type === 'gift') {
      // `applyGiftCode` disables the button for as long as it is in flight
      applyGiftCode((data.gift as PaymentsCheckedGiftCode).slug, actionButton, () => props.close());
    } else if(isDismiss()) {
      props.close();
    } else {
      buyPremium();
    }

    return false;
  };

  let actionButton!: HTMLButtonElement;
  const showActionButton = data.type !== 'gift' || (!giftDetails?.isOutbound && !!giftDetails?.isUnclaimed);

  return (
    <>
      <div class="tabs-container premium-tabs" ref={tabsEl}>
        <PromoSlide
          data={data}
          onSelectFeature={(value) => {
            const editor = data.type === 'business' && data.isPremiumActive && BUSINESS_EDITORS[value];
            if(editor) {
              props.close(() => openBusinessEditor(editor));
              return;
            }

            setSelectedFeature(value);
            setTabIndex(1);
          }}
          onSelectPeriod={setOption}
          onClose={props.close}
        />
        <FeatureSlide
          data={data}
          selected={selectedFeature()}
          onSelect={setSelectedFeature}
          onBack={() => setTabIndex(0)}
        />
      </div>
      <Show when={showActionButton}>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            class="popup-gift-premium-confirm action-button shimmer"
            ref={(element) => actionButton = element}
            callback={onActionClick}
          >
            {buttonText()}
            <Show when={feature()?.actionIcon}>
              <IconTsx icon={feature().actionIcon} class="row-icon action-button-icon" />
            </Show>
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </Show>
    </>
  );
}

/** `Telegram Business` — the same promo, with the business feature set. */
export function showBusinessPopup(options: Omit<ShowPremiumPopupOptions, 'business' | 'gift'> = {}) {
  showPremiumPopup({...options, business: true});
}
