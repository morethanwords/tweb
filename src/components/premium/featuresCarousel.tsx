import {createEffect, createMemo, createSignal, For, JSX, on, onCleanup, onMount, Show} from 'solid-js';
import {PremiumPromoFeature} from '@components/premium/featuresConfig';
import {i18n} from '@lib/langPack';
import {HelpPremiumPromo} from '@layer';
import wrapVideo from '@components/wrappers/video';
import wrapPhoto from '@components/wrappers/photo';
import {IconTsx} from '@components/iconTsx';
import LimitsList from '@components/premium/limitsList';
import UpgradedStoriesList, {UpgradedStoriesHeader} from '@components/premium/upgradedStoriesFeature';
import PremiumStickersCarousel from '@components/premium/premiumStickersCarousel';
import {AppManagers} from '@lib/managers';
import TransitionSlider from '@components/transition';
import {Middleware} from '@helpers/middleware';
import classNames from '@helpers/string/classNames';
import clamp from '@helpers/number/clamp';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import apiManagerProxy from '@lib/apiManagerProxy';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import type {MyDocument} from '@appManagers/appDocsManager';
import A11yButton from '@components/a11yButton';
import attachTabList from '@helpers/dom/tabList';
import Modes from '@config/modes';
import {isElementRTL} from '@helpers/dom/isDocumentRTL';

export type FeaturesCarouselProps = {
  features: PremiumPromoFeature[],
  premiumPromo: HelpPremiumPromo,
  managers: AppManagers,
  middleware: Middleware,
  /** The feature whose slide is on screen. */
  selected: PremiumPromoFeatureType,
  onSelect: (feature: PremiumPromoFeatureType) => void
};

/** A slide is "framed" (phone mockup / sticker stack) rather than a plain content sheet. */
export const isFramedFeature = (feature: PremiumPromoFeature) => (
  !!feature.videoPosition || feature.type === 'premium-stickers'
);

export default function FeaturesCarousel(props: FeaturesCarouselProps) {
  let containerEl!: HTMLDivElement;
  let itemsEl!: HTMLDivElement;

  const index = createMemo(() => Math.max(0, props.features.findIndex((f) => f.feature === props.selected)));
  const current = () => props.features[index()];

  let selectTab: ReturnType<typeof TransitionSlider>;
  // Only a step taken inside the carousel slides. A feature picked from the list
  // is selected while this slide is still off screen and on its way in: sliding
  // there too would run a second transition inside the first, tilting both
  // frames and showing the old page through the new one's empty screen.
  let slideTo: number;

  onMount(() => {
    selectTab = TransitionSlider({
      content: itemsEl,
      type: 'premiumTabs',
      transitionTime: 250,
      animateFirst: false
    });

    createEffect(on(index, (value) => {
      selectTab(value, value === slideTo);
      slideTo = undefined;
    }));
  });

  const step = (featureIndex: number) => {
    const feature = props.features[featureIndex];
    if(!feature) return;
    slideTo = featureIndex;
    props.onSelect(feature.feature);
  };

  // Clicking the left/right half of the stage steps through the features, the way
  // tapping the edges of a story does: the half toward the inline end goes forward,
  // the left one in a right-to-left layout.
  const onStageClick = (e: MouseEvent) => {
    const rect = containerEl.getBoundingClientRect();
    const toEnd = ((rect.left + rect.width / 2) < e.clientX) !== isElementRTL(containerEl);
    step(index() + (toEnd ? 1 : -1));
  };

  return (
    <>
      <div class="carousel-container" ref={containerEl} onClick={onStageClick}>
        <div
          // classList, not a reactive class: TransitionSlider sets `animating` /
          // `backwards` on this container, and rewriting className would drop them.
          class="carousel-items-container tabs-container"
          classList={{full: !isFramedFeature(current())}}
          ref={itemsEl}
        >
          <For each={props.features}>{(feature, featureIndex) => (
            <Slide
              feature={feature}
              premiumPromo={props.premiumPromo}
              managers={props.managers}
              middleware={props.middleware}
              near={Math.abs(index() - featureIndex()) <= 1}
            />
          )}</For>
        </div>
      </div>
      <Dots features={props.features} index={index()} panels={itemsEl} onSelect={step} />
    </>
  );
}

function Slide(props: {
  feature: PremiumPromoFeature,
  premiumPromo: HelpPremiumPromo,
  managers: AppManagers,
  middleware: Middleware,
  /** On screen or next to it — see {@link DeviceFrame}. */
  near: boolean
}) {
  // The feature a slide renders never changes, so its content is built once.
  const feature = props.feature;
  const framed = isFramedFeature(feature);
  const scrolls = feature.type === 'limits' || feature.type === 'upgraded-stories';
  // Neither a mockup nor one of the built-in content types: the promo carries no
  // video for it, so the slide is just its title and subtitle.
  const bare = !framed && !feature.type;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [overflows, setOverflows] = createSignal(true);

  const onScroll = (e: Event) => {
    const target = e.currentTarget as HTMLElement;
    setScrollTop(target.scrollTop);
    setOverflows((target.scrollHeight - target.scrollTop) > target.clientHeight);
  };

  let content: JSX.Element;
  if(feature.videoPosition) {
    content = <DeviceFrame feature={feature} middleware={props.middleware} near={props.near} />;
  } else if(feature.type === 'limits') {
    content = <LimitsList limits={feature.content} managers={props.managers} />;
  } else if(feature.type === 'upgraded-stories') {
    content = <UpgradedStoriesList features={feature.content} />;
  } else if(feature.type === 'premium-stickers') {
    content = <StickersStage managers={props.managers} />;
  }

  return (
    <div
      // Static `class` for the same reason as the promo slide: the carousel's
      // TransitionSlider owns `active` / `to` / `from` on this .tabs-tab.
      class={classNames(
        'carousel-item',
        'tabs-tab',
        !framed && 'feature-background',
        bare && 'no-content',
        feature.type === 'upgraded-stories' && 'upgraded-stories'
      )}
    >
      <Show when={feature.type === 'upgraded-stories'}>
        <UpgradedStoriesHeader
          premiumPromo={props.premiumPromo}
          middleware={props.middleware}
          titleLangKey={feature.titleLangKey}
        />
      </Show>
      <div
        class={classNames(
          'carousel-item-content-top-section',
          feature.type === 'premium-stickers' && 'no-padding',
          feature.type === 'limits' && 'scrollable scrollable-y no-scrollbar top-margin',
          feature.type === 'upgraded-stories' && 'scrollable scrollable-y no-scrollbar',
          scrolls && scrollTop() > 0 && 'top-border',
          scrolls && overflows() && 'bottom-border'
        )}
        style={feature.type === 'upgraded-stories' ? {position: 'relative'} : undefined}
        tabIndex={scrolls && Modes.a11y ? 0 : undefined}
        onScroll={scrolls ? onScroll : undefined}
      >
        {content}
      </div>
      <Show when={framed || bare}>
        <div class="carousel-item-content-bottom-section">
          <div class="carousel-item-content-title">
            {i18n(feature.titleLangKey, feature.titleLangArgs)}
          </div>
          <div class="carousel-item-content-subtitle">
            {i18n(feature.subtitleLangKey, feature.subtitleLangArgs)}
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Thumbnail size asked for: the screen area of the mockup, roughly. */
const POSTER_BOX_WIDTH = 300;
const POSTER_BOX_HEIGHT = 450;

/**
 * The Android phone mockup with the promo video playing inside it. The video's
 * blurred thumbnail fills the screen from the first frame. The sharper thumbnail
 * and the video itself load once the slide is on screen or next to it, so a swipe
 * finds them ready — Android's pager keeps its neighbours built the same way.
 */
function DeviceFrame(props: {
  feature: PremiumPromoFeature,
  middleware: Middleware,
  near: boolean
}) {
  const doc = props.feature.video as MyDocument;
  const [video, setVideo] = createSignal<HTMLElement>();
  const [loaded, setLoaded] = createSignal(false);
  let poster!: HTMLDivElement;
  let started = false;

  onMount(() => {
    const strippedThumb = getMediaThumbIfNeeded({
      photo: doc,
      cacheContext: apiManagerProxy.getCacheContext(doc),
      useBlur: true,
      ignoreCache: true,
      onlyStripped: true
    });
    if(strippedThumb) {
      strippedThumb.image.classList.add('media-photo');
      poster.append(strippedThumb.image);
    }
  });

  createEffect(() => {
    if(!props.near || started) return;
    started = true;

    const size = choosePhotoSize(doc, POSTER_BOX_WIDTH, POSTER_BOX_HEIGHT);
    if(size._ !== 'photoSizeEmpty') {
      wrapPhoto({
        photo: doc,
        container: poster,
        size,
        noThumb: true,
        withoutPreloader: true,
        middleware: props.middleware
      });
    }

    wrapVideo({
      doc,
      withoutPreloader: true,
      noInfo: true,
      noPlayButton: true,
      noPreview: true,
      middleware: props.middleware
    }).then((wrapped) => {
      if(!props.middleware()) return;

      setVideo(wrapped.video);
      Promise.resolve(wrapped.loadPromise).then(() => props.middleware() && setLoaded(true));
    });
  });

  return (
    <div class={classNames('device-frame', props.feature.videoPosition !== 'top' && 'bottom')}>
      <img class="device-frame-image" src="assets/img/android-device.svg" alt="" />
      <div class="device-frame-poster" ref={poster} />
      <Show when={!loaded()}>
        <div class="shimmer" />
        <IconTsx icon="star" class="device-frame-preload-icon" />
      </Show>
      {video()}
    </div>
  );
}

/** The rotating stack of premium stickers — kept imperative, it animates itself. */
function StickersStage(props: {managers: AppManagers}) {
  let stage!: HTMLDivElement;

  onMount(() => {
    const carousel = new PremiumStickersCarousel({topSection: stage, managers: props.managers});
    onCleanup(() => carousel.cleanup());
  });

  return <div ref={stage} />;
}

/** How many dots the row shows at most; the rest scroll in as the active one moves. */
const DOTS_VISIBLE = 7;

/**
 * The row of dots under the stage. With more features than fit, it is a window of
 * {@link DOTS_VISIBLE} that keeps the active dot in its middle (stopping at either
 * end of the list), and a window edge with more dots beyond it tapers off — so the
 * active dot is never one of the shrunk ones.
 */
function Dots(props: {
  features: PremiumPromoFeature[],
  index: number,
  /** The slides, which the dots are the tabs of. */
  panels: HTMLElement,
  onSelect: (featureIndex: number) => void
}) {
  let dotsEl!: HTMLDivElement;
  onMount(() => onCleanup(attachTabList(dotsEl, props.panels)));

  const length = () => props.features.length;
  const windowStart = () => clamp(
    props.index - Math.floor(DOTS_VISIBLE / 2),
    0,
    Math.max(0, length() - DOTS_VISIBLE)
  );

  const scaleOf = (dotIndex: number) => {
    if(length() <= DOTS_VISIBLE) return 1;

    const first = windowStart(), last = first + DOTS_VISIBLE - 1;
    if(dotIndex < first || dotIndex > last) return 0;
    if(first > 0 && dotIndex <= first + 1) return dotIndex === first ? .5 : .75;
    if(last < length() - 1 && dotIndex >= last - 1) return dotIndex === last ? .5 : .75;
    return 1;
  };

  return (
    <div
      class="popup-premium-controls"
      style={{'--visible': '' + Math.min(length(), DOTS_VISIBLE)}}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        class="popup-premium-controls-dots"
        style={{'--start': '' + windowStart()}}
        ref={dotsEl}
      >
        <For each={props.features}>{(feature, dotIndex) => (
          <A11yButton
            class={classNames('popup-premium-controls-dot', dotIndex() === props.index && 'active')}
            role="tab"
            aria-label={i18n(feature.titleLangKey, feature.titleLangArgs).textContent}
            data-feature={feature.feature}
            style={{transform: `scale(${scaleOf(dotIndex())})`}}
            onClick={(e) => {
              e.stopPropagation();
              if(dotIndex() !== props.index) props.onSelect(dotIndex());
            }}
          />
        )}</For>
      </div>
    </div>
  );
}
