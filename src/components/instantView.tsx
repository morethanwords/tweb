import {For, createEffect, createContext, useContext, Show, createSignal, Setter, onCleanup, createReaction, createMemo, on, Accessor, batch} from 'solid-js';
import type {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {
  Document,
  Page,
  PageBlock,
  PageCaption,
  PageListOrderedItem,
  PageTableCell,
  PageTableRow,
  Photo,
  RichText
} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import styles from '@components/instantView.module.scss';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import GenericTable, {GenericTableCell, GenericTableRow} from '@components/genericTable';
import {SolidJSHotReloadGuardContextValue, useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {formatDate, formatFullSentTime} from '@helpers/date';
import findUpClassName from '@helpers/dom/findUpClassName';
import cancelEvent from '@helpers/dom/cancelEvent';
import Scrollable, {ScrollableContext} from '@components/scrollable2';
import fastSmoothScroll, {fastSmoothScrollToStart} from '@helpers/fastSmoothScroll';
import Animated from '@helpers/solid/animations';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {CustomEmojiRendererElement} from '@lib/customEmoji/renderer';
import createMiddleware from '@helpers/solid/createMiddleware';
import type {Middleware} from '@helpers/middleware';
import MySuspense from '@helpers/solid/mySuspense';
import TelegramWebView from '@components/telegramWebView';
import getWebFileLocation from '@helpers/getWebFileLocation';
import makeGoogleMapsUrl from '@helpers/makeGoogleMapsUrl';
import {GeoPoint} from '@layer';
import GeoPin from '@components/geoPin';
import ScrollSaver from '@helpers/scrollSaver';
import windowSize from '@helpers/windowSize';
import {Message} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import prepareAlbum from '@components/prepareAlbum';
import type AppMediaViewer from '@components/mediaViewer';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {useAppSettings} from '@stores/appSettings';
import {StaticCheckbox} from '@components/staticCheckbox';
import copyFromElement from '@helpers/dom/copyFromElement';
import {toastNew} from '@components/toast';
import {Latex, hydrateInlineMath} from '@components/instantViewMath';
import {getCodeBlockClickTarget, toggleCodeBlockWrap} from '@helpers/dom/codeBlockClick';
import {reconcileStablePageBlockEntries} from '@components/instantView/stablePageBlocks';
import {
  MessageTextLayoutEvent,
  MessageTextPhase,
  MessageTextRevealCoordinator,
  SolidInlineText
} from '@components/chat/bubbleParts/solidMessageText';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import filterDisabledEntities, {
  MESSAGE_LINK_ENTITY_TYPES
} from '@lib/richTextProcessor/filterDisabledEntities';

export type ReactiveInstantViewValue<T> = T | Accessor<T>;

export type InstantViewRichTextOptions = Parameters<typeof wrapRichText>[1];

export function hasInstantViewDisabledNavigation(options?: InstantViewRichTextOptions) {
  return !!(options?.noNavigation || options?.noLinks);
}

export function getInstantViewDisabledEntities(options?: InstantViewRichTextOptions) {
  const disabledEntities = options?.disabledEntities;
  if(!hasInstantViewDisabledNavigation(options)) return disabledEntities;
  if(!disabledEntities) return MESSAGE_LINK_ENTITY_TYPES;

  for(const type of MESSAGE_LINK_ENTITY_TYPES) {
    if(!disabledEntities.has(type)) {
      return new Set([...disabledEntities, ...MESSAGE_LINK_ENTITY_TYPES]);
    }
  }

  return disabledEntities;
}

export function readReactiveInstantViewValue<T>(value: ReactiveInstantViewValue<T>): T {
  return typeof(value) === 'function' ? (value as Accessor<T>)() : value;
}

type InstantViewContextValue = {
  webPageId: Long,
  page: Page.page,
  sourceRevision: number,
  phase: MessageTextPhase,
  revealCoordinator?: MessageTextRevealCoordinator,
  onTextLayout?: (event: MessageTextLayoutEvent) => void,
  richTextOptions?: InstantViewRichTextOptions,
  randomId: string,
  openNewPage: (url: string) => void,
  collapse: () => void,
  scrollToAnchor: (anchor: string, instantly: boolean) => void,
  customEmojiRenderer: CustomEmojiRendererElement,
  details: WeakMap<HTMLElement, Setter<boolean>>,
  ready: boolean,
  savingScroll: boolean,
  isAlive: () => boolean,
  navigationGeneration: number,
  media: Array<{ref: HTMLElement, media: Photo.photo | Document.document, caption: PageCaption}>
};

const InstantViewContext = createContext<InstantViewContextValue>();

// Match in-page fragment URLs: `#x` (raw markdown) or `<protocol>://#x`
// (after wrapUrl prepends the missing scheme to a bare fragment).
const FRAGMENT_HREF_RE = /^(?:[a-z]+:\/\/)?(#[^#?]+)$/i;

// An embed block carries third-party provider markup (GitHub Gist, Twitter, YouTube, ...).
// Without a sandbox the frame keeps every capability it is given by default, and an
// `html` embed additionally inherits this origin, so its scripts would run as
// web.telegram.org with access to the parent document and its storage.
const EMBED_SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  'allow-popups',
  'allow-popups-to-escape-sandbox', // links inside the embed must open as normal pages
  'allow-forms',
  'allow-modals'
].join(' ');

// A cross-origin `url` embed already loads under the provider's own origin, so keeping it
// costs nothing here and preserves the provider's cookies and storage.
const EMBED_URL_SANDBOX_ATTRIBUTES = EMBED_SANDBOX_ATTRIBUTES + ' allow-same-origin';

// The height in a `resize_frame` event is authored by the embedded document — a third-party page,
// and after a navigation away not even the one the block asked for — so it only ever grows the
// block to something a tall embed could plausibly need, never to an arbitrary size.
const MAX_EMBED_VIEWPORTS = 4;

// An `html` embed is a wrapper document whose canonical link points at Telegram's own embed host
// (embed.telegra.ph), which serves the very same markup. Pointing the frame at that URL is what
// isolates it: the frame lands on a real, non-Telegram origin instead of inheriting this one.
// Rendering the markup inline would work too, but only in an opaque origin, and provider widgets
// need storage there — Twitter's createTweet() resolves to null and draws nothing.
function extractEmbedUrl(html: string) {
  try {
    const href = new DOMParser().parseFromString(html, 'text/html') // does not run scripts
    .querySelector('link[rel~="canonical" i]')
    ?.getAttribute('href')
    ?.trim();
    const url = href && new URL(href);
    return url && (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : undefined;
  } catch(err) {
    return undefined;
  }
}

function getEmbedSandbox(html: string, url: string) {
  if(html) { // srcdoc — allow-same-origin would hand it this origin, which is the whole problem
    return EMBED_SANDBOX_ATTRIBUTES;
  }

  let isCrossOrigin: boolean;
  try {
    isCrossOrigin = new URL(url, location.href).origin !== location.origin;
  } catch(err) {
    isCrossOrigin = false;
  }

  // a same-origin frame with allow-same-origin can reach into the parent and lift its own sandbox
  return isCrossOrigin ? EMBED_URL_SANDBOX_ATTRIBUTES : EMBED_SANDBOX_ATTRIBUTES;
}

function hasDisabledNavigation(context: InstantViewContextValue) {
  return hasInstantViewDisabledNavigation(context.richTextOptions);
}

function onClick(context: InstantViewContextValue, e: MouseEvent) {
  // Code block header buttons (copy / wrap toggle) — same affordance as chat bubbles, since IV
  // reuses wrapRichText's `messageEntityPre` markup for highlighted code.
  const codeTarget = getCodeBlockClickTarget(e.target);
  if(codeTarget) {
    cancelEvent(e);
    if(codeTarget.isWrapToggle) {
      toggleCodeBlockWrap(codeTarget);
    } else {
      copyFromElement(codeTarget.code);
      toastNew({langPackKey: 'CodeCopied'});
    }
    return;
  }

  const anchor = findUpClassName(e.target, 'anchor-url') as HTMLAnchorElement;
  if(anchor) {
    const href = anchor.getAttribute('href') || '';
    const m = href.match(FRAGMENT_HREF_RE);
    if(m) {
      cancelEvent(e);
      context.scrollToAnchor(m[1], false);
      return;
    }
  }
}

// Expand every collapsed <details> the anchor target sits inside, so it's actually visible before we
// scroll to it. Shared by the full-page IV and inline RichMessage anchor navigation.
function expandDetailsAncestors(context: InstantViewContextValue, element: HTMLElement) {
  let detailsElement: HTMLElement = element;
  do {
    detailsElement = findUpClassName(detailsElement, styles.Details);
    if(!detailsElement) {
      break;
    }

    context.details.get(detailsElement)?.(true);
    detailsElement = detailsElement.parentElement;
  } while(true);
}

export function InstantViewBlocks(props: {
  webPageId: ReactiveInstantViewValue<Long>,
  page: ReactiveInstantViewValue<Page.page>,
  sourceRevision?: ReactiveInstantViewValue<number>,
  phase?: ReactiveInstantViewValue<MessageTextPhase>,
  richTextOptions?: ReactiveInstantViewValue<InstantViewRichTextOptions>,
  onTextLayout?: (event: MessageTextLayoutEvent) => void,
  revealCoordinator?: MessageTextRevealCoordinator,
  afterBlocks?: JSX.Element,
  openNewPage: (url: string) => void,
  collapse: () => void,
  // host-provided scroll for in-page anchor jumps (the embedding chat passes its viewport-aware
  // bubbles.scrollToBubble); omitted → anchor links are inert
  scrollToElement?: (element: HTMLElement) => void,
  class?: string,
  contentClass?: string,
  paddings?: number,
  style?: JSX.CSSProperties
}) {
  let disposed = false;
  let navigationGeneration = 0;
  const customEmojiRenderer = CustomEmojiRendererElement.create({
    textColor: 'primary-text-color',
    middleware: createMiddleware().get(),
    renderNonSticker: true
  });

  const value: InstantViewContextValue = {
    get webPageId() {
      return readReactiveInstantViewValue(props.webPageId);
    },
    get page() {
      return readReactiveInstantViewValue(props.page);
    },
    get sourceRevision() {
      return props.sourceRevision === undefined ? 0 : readReactiveInstantViewValue(props.sourceRevision);
    },
    get phase() {
      return props.phase === undefined ? 'final' : readReactiveInstantViewValue(props.phase);
    },
    get richTextOptions() {
      return props.richTextOptions === undefined ? undefined : readReactiveInstantViewValue(props.richTextOptions);
    },
    onTextLayout: props.onTextLayout,
    revealCoordinator: props.revealCoordinator,
    ready: true,
    randomId: '' + (Math.random() * 1000 | 0),
    openNewPage: (url) => {
      if(!hasDisabledNavigation(value)) props.openNewPage(url);
    },
    collapse: props.collapse,
    scrollToAnchor: (anchor) => {
      if(!anchor || hasDisabledNavigation(value)) {
        return;
      }

      const element = document.getElementById(value.randomId + anchor.slice(1)) as HTMLElement;
      if(!element) {
        return;
      }

      expandDetailsAncestors(value, element);
      props.scrollToElement?.(element);
    },
    customEmojiRenderer,
    details: new WeakMap(),
    savingScroll: false,
    isAlive: () => !disposed,
    get navigationGeneration() {
      return navigationGeneration;
    },
    media: []
  };

  let policyInitialized = false;
  createEffect(() => {
    // `richTextOptions` is a value or an accessor of one (ReactiveInstantViewValue), never a
    // store, so reading the getter below is the whole dependency — the individual policy flags
    // are plain properties and reading them would track nothing.
    value.richTextOptions;
    if(policyInitialized) ++navigationGeneration;
    else policyInitialized = true;
  });
  onCleanup(() => {
    disposed = true;
    ++navigationGeneration;
  });

  return (
    <InstantViewContent
      value={value}
      class={props.class}
      contentClass={props.contentClass}
      paddings={props.paddings}
      style={props.style}
      afterBlocks={props.afterBlocks}
    />
  );
}

// Shared render of the context provider + `.InstantView` wrapper + block list. Both the full-page
// `InstantView` (wrapped in Scrollable/MySuspense with a footer) and the inline `InstantViewBlocks`
// (used to embed rich messages inside chat bubbles) delegate here so the block markup lives in one
// place. The distinct context values (ready/scrollToAnchor) and outer chrome stay in each caller.
function InstantViewContent(props: {
  value: InstantViewContextValue,
  class?: string,
  contentClass?: string,
  paddings?: number,
  style?: JSX.CSSProperties,
  children?: JSX.Element,
  afterBlocks?: JSX.Element
}) {
  return (
    <InstantViewContext.Provider value={props.value}>
      <div
        dir={props.value.page.pFlags.rtl ? 'auto' : undefined}
        class={classNames(styles.InstantView, props.class, 'text-overflow-wrap')}
        onClick={onClick.bind(null, props.value)}
        style={props.style}
      >
        {props.value.customEmojiRenderer}
        <div class={classNames(styles.InstantViewContent, props.contentClass)}>
          <StablePageBlocks
            blocks={props.value.page.blocks}
            paddings={props.paddings ?? 2}
          />
          {props.afterBlocks}
        </div>
        {props.children}
      </div>
    </InstantViewContext.Provider>
  );
}

export function InstantView(props: {
  webPageId: Long,
  page: Page.page,
  openNewPage: (url: string) => void,
  collapse: () => void,
  needFadeIn?: boolean,
  anchor?: string, // * expect it to be '#name'
  onReady?: () => void
}) {
  let disposed = false;
  const [ready, setReady] = createSignal(false);
  const value: InstantViewContextValue = {
    get webPageId() {
      return props.webPageId;
    },
    get ready() {
      return ready();
    },
    get page() {
      return props.page;
    },
    sourceRevision: 0,
    phase: 'final',
    randomId: '' + (Math.random() * 1000 | 0),
    openNewPage: props.openNewPage,
    collapse: props.collapse,
    scrollToAnchor: (anchor, instantly) => {
      const forceDuration = instantly ? 0 : undefined;
      if(!anchor) {
        fastSmoothScrollToStart(scrollableRef, 'y', forceDuration);
        return;
      }

      const element = document.getElementById(value.randomId + anchor.slice(1)) as HTMLElement;
      if(!element) {
        return;
      }

      expandDetailsAncestors(value, element);
      fastSmoothScroll({container: scrollableRef, element, position: 'start', forceDuration});
    },
    customEmojiRenderer: CustomEmojiRendererElement.create({
      textColor: 'primary-text-color',
      middleware: createMiddleware().get(),
      renderNonSticker: true
    }),
    details: new WeakMap(),
    savingScroll: false,
    isAlive: () => !disposed,
    navigationGeneration: 0,
    media: []
  };
  onCleanup(() => disposed = true);

  // console.log(props.page);

  let firstAnchor = true;
  createEffect(() => {
    if(!ready()) {
      return;
    }

    const anchor = props.anchor;
    const _firstAnchor = firstAnchor;
    firstAnchor = false;
    if(_firstAnchor && !anchor) {
      return;
    }

    queueMicrotask(() => {
      value.scrollToAnchor(anchor, _firstAnchor);
    });
  });

  const {i18n, appImManager, rootScope} = useHotReloadGuard();
  const [appSettings] = useAppSettings();
  let scrollableRef: HTMLDivElement;
  return (
    <Animated type="cross-fade" appear={props.needFadeIn} mode="add-remove">
      <MySuspense
        onReady={() => {
          setReady(true);
          props.onReady?.();
        }}
      >
        <Scrollable ref={scrollableRef}>
          <InstantViewContent
            value={value}
            paddings={2}
            style={{'--iv-scale': (1.125 * appSettings.instantView.scale).toFixed(3)}}
          >
            <div
              dir="auto"
              class={classNames(styles.InstantViewFooter, 'secondary')}
            >
              <Show when={props.page.views}>
                {i18n('Views', [props.page.views])}
                {` • `}
              </Show>
              <a
                class={styles.WrongLayout}
                href="#"
                onClick={async(e) => {
                  cancelEvent(e);
                  value.collapse();
                  const user = await rootScope.managers.appUsersManager.resolveUserByUsername('@previews');
                  const startParam = `webpage${value.webPageId}`;
                  appImManager.setInnerPeer({
                    peerId: user.id.toPeerId(false),
                    startParam
                  });
                }}
              >
                {i18n('InstantView.WrongLayout')}
              </a>
            </div>
          </InstantViewContent>
        </Scrollable>
      </MySuspense>
    </Animated>
  );
}

function _onMediaResult(
  ref: HTMLElement,
  width: number,
  height: number,
  paddings: number
) {
  if(Number.isFinite(width) && width > 0) {
    ref.style.setProperty('--iv-media-width', width + 'px');
  }

  ref.style.setProperty(
    '--aspect-ratio',
    '' + (width / height)
  );

  ref.style.setProperty(
    '--paddings',
    // '' + (paddings > 1 ? paddings + 1 : 0)
    '' + (paddings > 2 ? paddings : 0)
  );
}

function onMediaResult(
  ref: HTMLDivElement,
  paddings: number,
  onSize?: (size: {width: number, height: number}) => void
) {
  const {width, height} = ref.style;
  const widthNum = parseInt(width);
  const heightNum = parseInt(height);
  _onMediaResult(ref, widthNum, heightNum, paddings);

  const r = {width: widthNum, height: heightNum};
  onSize?.(r);
  return r;
}

function findPagePhoto(context: InstantViewContextValue, id: string | number) {
  return unwrap(context.page.photos.find((photo) => photo.id === id)) as Photo.photo;
}

function findPageDocument(context: InstantViewContextValue, id: string | number) {
  return unwrap(context.page.documents.find((document) => document.id === id)) as Document.document;
}

function Caption(props: {caption: PageCaption}) {
  return (
    <Show when={!isRichTextEmpty(props.caption.text) || !isRichTextEmpty(props.caption.credit)}>
      <div class={classNames(styles.Padding, styles.Caption, 'secondary')}>
        <Show when={!isRichTextEmpty(props.caption.text)}>
          <div class={classNames(styles.CaptionText, 'text-bold')}>
            <RichTextRenderer text={props.caption.text} />
          </div>
        </Show>
        <Show when={!isRichTextEmpty(props.caption.credit)}>
          <div class={styles.CaptionCredit}>
            <RichTextRenderer text={props.caption.credit} />
          </div>
        </Show>
      </div>
    </Show>
  );
}

function prepareMediaForViewer(
  ref: HTMLDivElement,
  media: Accessor<Photo.photo | Document.document>,
  caption: Accessor<PageCaption>,
  webPageId?: Accessor<Long | undefined>,
  url?: Accessor<string | undefined>
) {
  const context = useContext(InstantViewContext);
  const hotReloadGuard = useHotReloadGuard();
  const item = {
    ref,
    get media() {
      return media();
    },
    get caption() {
      return caption();
    }
  };
  context.media.push(item);

  onCleanup(() => {
    indexOfAndSplice(context.media, item);
  });

  return () => onMediaClick({
    context,
    ref,
    hotReloadGuard,
    webPageId: hasDisabledNavigation(context) ? undefined : webPageId?.(),
    url: hasDisabledNavigation(context) ? undefined : url?.()
  });
}

function getMediaItemsInDomOrder(context: InstantViewContextValue) {
  return context.media.slice().sort((left, right) => {
    if(left.ref === right.ref) return 0;
    const position = left.ref.compareDocumentPosition(right.ref);
    if(position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if(position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function EmbedWebView(props: {
  block: PageBlock.pageBlockEmbed,
  context: InstantViewContextValue,
  onHeight: (height: number) => void
}) {
  // Prefer the canonical URL, and only render the markup inline when there is none.
  const embedUrl = props.block.url || (props.block.html ? extractEmbedUrl(props.block.html) : undefined);
  const embedHtml = embedUrl ? undefined : props.block.html;
  const webView = new TelegramWebView({
    html: embedHtml,
    url: embedUrl,
    sandbox: getEmbedSandbox(embedHtml, embedUrl)
  });
  webView.iframe.classList.add(styles.EmbedIframe);
  webView.iframe.allowFullscreen = true;
  if(props.block.url) {
    webView.iframe.style.width = '100%';
    webView.iframe.style.height = '100%';
    webView.iframe.style.border = '0';
  }

  createEffect(() => {
    webView.iframe.scrolling = props.block.pFlags?.allow_scrolling ? 'yes' : 'no';
  });

  let cleaned = false;
  let restoreGeneration = 0;
  let ownsScrollSave = false;
  createEffect(() => {
    if(!props.context.ready) return;
    queueMicrotask(() => {
      if(!cleaned) webView.onMount();
    });
  });

  const scrollableContext = useContext(ScrollableContext);
  webView.addEventListener('resize_frame', ({height}) => {
    if(!height) return;

    height = Math.min(height, windowSize.height * MAX_EMBED_VIEWPORTS);

    const scrollSaver = props.context.savingScroll ?
      undefined :
      new ScrollSaver(scrollableContext, undefined, false);
    if(scrollSaver) {
      props.context.savingScroll = true;
      ownsScrollSave = true;
      scrollSaver.save();
    }

    props.onHeight(height);
    if(scrollSaver) {
      const generation = ++restoreGeneration;
      queueMicrotask(() => {
        queueMicrotask(() => {
          if(cleaned || generation !== restoreGeneration) return;
          ownsScrollSave = false;
          props.context.savingScroll = false;
          scrollSaver.restore();
        });
      });
    }
  });

  onCleanup(() => {
    cleaned = true;
    ++restoreGeneration;
    if(ownsScrollSave) {
      ownsScrollSave = false;
      props.context.savingScroll = false;
    }
    webView.destroy();
  });

  return webView.iframe;
}

async function onMediaClick({
  context,
  ref,
  hotReloadGuard,
  webPageId,
  url
}: {
  context: InstantViewContextValue,
  ref: HTMLElement,
  hotReloadGuard: SolidJSHotReloadGuardContextValue,
  webPageId?: Long,
  url?: string
}) {
  const {rootScope, AppMediaViewer, I18n} = hotReloadGuard;
  if(!context.isAlive()) return;

  const navigationGeneration = context.navigationGeneration;
  const sourceRevision = context.sourceRevision;
  const navigationDisabled = hasDisabledNavigation(context);
  const disabledEntities = getInstantViewDisabledEntities(context.richTextOptions);
  if(navigationDisabled) {
    webPageId = undefined;
    url = undefined;
  }
  const mediaItems = getMediaItemsInDomOrder(context);
  const promises = mediaItems.map(async({ref, media, caption}, index) => {
    const message = await rootScope.managers.appMessagesManager.generateStandaloneOutgoingMessage(NULL_PEER_ID);
    message.media = media._ === 'photo' ?
      {_: 'messageMediaPhoto', pFlags: {}, photo: media} :
      {_: 'messageMediaDocument', pFlags: {video: true}, document: media};
    message.id = message.mid = 0;
    message.date = media.date;
    message.fromId = NULL_PEER_ID;

    if(!isRichTextEmpty(caption.text)) {
      const textWithEntities = wrapTelegramRichText(caption.text);
      message.totalEntities = disabledEntities ?
        filterDisabledEntities(textWithEntities.entities || [], disabledEntities) :
        textWithEntities.entities;
      message.message = textWithEntities.text;
    }

    if(url) {
      const string = I18n.format(
        IS_TOUCH_SUPPORTED ? 'InstantView.Media.Url.Touch' : 'InstantView.Media.Url',
        true
      ) + '\n';

      const addingString = string + url + '\n\n';

      message.message = addingString + message.message;
      message.totalEntities ||= [];
      message.totalEntities.forEach((entity) => {
        entity.offset += addingString.length;
      });
      message.totalEntities.unshift({
        _: 'messageEntityTextUrl',
        offset: string.length,
        length: url.length,
        url: webPageId ?
          'tg://iv?url=' + encodeURIComponent(url) :
          url,
        safe: !!webPageId
      });
    }

    const target: AppMediaViewer['target'] = {
      message,
      element: ref,
      mid: 0,
      peerId: NULL_PEER_ID,
      index
    };
    return target;
  });
  const targets = await Promise.all(promises);
  if(
    !context.isAlive() ||
    context.navigationGeneration !== navigationGeneration ||
    context.sourceRevision !== sourceRevision
  ) {
    return;
  }

  const currentMedia = getMediaItemsInDomOrder(context);
  if(
    currentMedia.length !== mediaItems.length ||
    currentMedia.some((item, index) => (
      item.ref !== mediaItems[index].ref ||
      !item.ref.isConnected
    ))
  ) {
    return;
  }

  const target = targets.find(({element}) => element === ref);
  if(!target) return;
  targets.forEach((target) => target.element = target.element.lastElementChild as any);

  new AppMediaViewer(true)
  .setSearchContext({peerId: NULL_PEER_ID, inputFilter: {_: 'inputMessagesFilterEmpty'}, useSearch: false})
  .openMedia({
    message: target.message,
    target: target.element,
    fromRight: 0,
    reverse: false,
    prevTargets: targets.slice(0, target.index),
    nextTargets: targets.slice(target.index + 1)
  });
}

function StablePageBlocks(props: {
  blocks: PageBlock[],
  paddings: number,
  noCaption?: boolean,
  render?: (block: PageBlock) => JSX.Element
}) {
  const entries = createStablePageBlockEntries(() => props.blocks);

  return (
    <For each={entries()}>{(entry) => (
      props.render ?
        props.render(entry.block) :
        <Block block={entry.block} paddings={props.paddings} noCaption={props.noCaption} />
    )}</For>
  );
}

function createStablePageBlockEntries(blocks: Accessor<PageBlock[]>) {
  const context = useContext(InstantViewContext);
  let nextKey = 0;
  const createKey = () => `iv-block-${++nextKey}`;
  const blockSetters = new Map<string, (block: PageBlock) => void>();
  const createEntry = ({key, block}: ReturnType<typeof reconcileStablePageBlockEntries>[number]) => {
    const [reactiveBlock, setReactiveBlock] = createStore(copy(block));
    blockSetters.set(key, (nextBlock) => {
      const current = unwrap(reactiveBlock) as PageBlock & Record<string, unknown>;
      const next = unwrap(nextBlock) as PageBlock & Record<string, unknown>;
      const setProperty = setReactiveBlock as (...args: any[]) => void;
      Object.keys(current).forEach((property) => {
        if(!(property in next)) setProperty(property, undefined);
      });
      Object.keys(next).forEach((property) => {
        if(deepEqual(current[property], next[property])) return;
        if(isNestedPageBlockSnapshot(nextBlock, property)) {
          // The nested StablePageBlocks owner needs a new collection snapshot
          // so it can reconcile PageBlock identities itself. Mutating this
          // array by index would turn a media reorder into changed media props
          // on the old DOM owners and can also race the revision-triggered
          // nested reconciliation effect.
          setProperty(property, copy(next[property]));
          return;
        }
        // Merge nested arrays/objects in place. Page-list items, table rows and
        // related articles have no protocol ids, so replacing a deep-copied
        // array would make Solid's <For> remount every sibling on each token.
        setProperty(property, reconcile(next[property], {merge: true}));
      });
    });
    return {key, block: reactiveBlock as PageBlock};
  };
  const [entries, setEntries] = createSignal(
    reconcileStablePageBlockEntries([], blocks() || [], createKey).map(createEntry),
    {equals: false}
  );

  createEffect(on(
    [() => context.sourceRevision, blocks],
    ([, nextBlocks]) => {
      const previous = entries();
      const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));
      const next = reconcileStablePageBlockEntries(previous, nextBlocks || [], createKey);
      const nextKeys = new Set(next.map((entry) => entry.key));

      batch(() => {
        const nextEntries = next.map((entry) => {
          const current = previousByKey.get(entry.key);
          if(!current) return createEntry(entry);
          blockSetters.get(entry.key)(entry.block);
          return current;
        });
        for(const key of blockSetters.keys()) {
          if(!nextKeys.has(key)) blockSetters.delete(key);
        }
        if(
          nextEntries.length !== previous.length ||
          nextEntries.some((entry, index) => entry !== previous[index])
        ) {
          setEntries(nextEntries);
        }
      });
    },
    {defer: true}
  ));

  return entries;
}

function isNestedPageBlockSnapshot(block: PageBlock, property: string) {
  return property === 'blocks' ||
    property === 'cover' ||
    property === 'items' && (
      block._ === 'pageBlockCollage' ||
      block._ === 'pageBlockSlideshow'
    );
}

function Block(props: {
  block: PageBlock,
  paddings: number,
  noCaption?: boolean,
  onSize?: (size: {width: number, height: number}) => void,
}) {
  const block = props.block;

  const CaptionC: typeof Caption = props.noCaption ? (...args: any[]) => false : Caption;
  // if(block._ !== 'pageBlockRelatedArticles' && Math.random() !== undefined) {
  //   return;
  // }

  switch(block._) {
    case 'pageBlockTitle':
      return <h1 class={classNames(styles.Padding, styles.Title)}><RichTextRenderer text={block.text} /></h1>;
    case 'pageBlockHeading1':
      return <h1 class={classNames(styles.Padding, styles.Title)}><RichTextRenderer text={block.text} /></h1>;
    case 'pageBlockSubtitle':
      return <h2 class={classNames(styles.Padding, styles.Subtitle, 'secondary')}><RichTextRenderer text={block.text} /></h2>;
    case 'pageBlockHeading2':
      return <h2 class={classNames(styles.Padding, styles.Subtitle)}><RichTextRenderer text={block.text} /></h2>;
    case 'pageBlockHeader':
    case 'pageBlockSubheader': {
      // Markdown levels 1-6 are stashed as `headingLevel` on the block by parseMarkdownToPage
      // (see comment there). Without it (e.g. native IV articles) fall back to the original
      // h3 / h4 tag. With it, render the matching semantic tag and add `HeadingH{n}` so the
      // CSS module can size each level distinctly.
      const isHeader = block._ === 'pageBlockHeader';
      const level = () => (block as typeof block & {headingLevel?: number}).headingLevel;
      const tag = () => level() ? `h${Math.min(level() + 1, 6)}` : (isHeader ? 'h3' : 'h4');
      return (
        <Dynamic
          component={tag()}
          class={classNames(
            styles.Padding,
            isHeader ? styles.Header : styles.Subheader,
            level() && styles[`HeadingH${level()}`]
          )}
        >
          <RichTextRenderer text={block.text} />
        </Dynamic>
      );
    }
    case 'pageBlockHeading3':
      return <h3 class={classNames(styles.Padding, styles.Header)}><RichTextRenderer text={block.text} /></h3>;
    case 'pageBlockHeading4':
      return <h4 class={classNames(styles.Padding, styles.Subheader)}><RichTextRenderer text={block.text} /></h4>;
    case 'pageBlockHeading5':
      return <h5 class={classNames(styles.Padding, styles.Subheader)}><RichTextRenderer text={block.text} /></h5>;
    case 'pageBlockHeading6':
      return <h6 class={classNames(styles.Padding, styles.Subheader)}><RichTextRenderer text={block.text} /></h6>;
    case 'pageBlockParagraph':
      return <p class={classNames(styles.Padding, styles.Paragraph)}><RichTextRenderer text={block.text} /></p>;
    case 'pageBlockPreformatted': {
      // `$$…$$` blocks are tagged language `math` by parseMarkdownToPage — render them as display
      // formulas via Temml (like WebA), wrapped in a horizontal scroller for wide equations.
      return (
        <Show
          when={block.language === 'math'}
          fallback={<PreformattedCode text={block.text} language={block.language} />}
        >
          <div class={classNames(styles.Padding, styles.MathBlockWrapper)}>
            <BlockLatex source={richTextToString(block.text)} />
          </div>
        </Show>
      );
    }
    case 'pageBlockMath':
      // Server-sent `pageBlockMath` (rich messages) — render as a display formula through the same
      // Temml path master uses for markdown `$$…$$` blocks, instead of dumping the raw LaTeX source.
      return (
        <div class={classNames(styles.Padding, styles.MathBlockWrapper)}>
          <BlockLatex source={block.source} />
        </div>
      );
    case 'pageBlockFooter':
      return <footer class={classNames(styles.Padding, styles.Footer, 'secondary')}><RichTextRenderer text={block.text} /></footer>;
    case 'pageBlockDivider':
      return <div class={styles.Divider} />;
    case 'pageBlockOrderedList':
    case 'pageBlockList': {
      // * own numbers cannot be perfectly vertical aligned if children is not plain text
      const isOrdered = block._ === 'pageBlockOrderedList';
      const orderedBlock = block as PageBlock.pageBlockOrderedList;
      const shouldHaveOwnNumbers = createMemo(() => (
        isOrdered && block.items.some((item) => item.num && !item.num.match(/^\d+$/))
      ));
      const {wrapEmojiText} = useHotReloadGuard();
      return (
        <Dynamic
          component={isOrdered ? 'ol' : 'ul'}
          reversed={isOrdered ? orderedBlock.pFlags.reversed : undefined}
          start={isOrdered ? orderedBlock.start : undefined}
          type={isOrdered ? orderedBlock.type as '1' | 'a' | 'i' | 'A' | 'I' : undefined}
          class={classNames(
            styles.List,
            styles.BlockContainer,
            styles.BlockGutter,
            shouldHaveOwnNumbers() && styles.ListOrdered,
            'browser-default'
          )}
        >
          <For each={block.items}>{(item, idx) => (
            <li class={styles.ListItem}>
              {shouldHaveOwnNumbers() && (
                <span class={styles.ListItemNumber}>
                  {(item as PageListOrderedItem.pageListOrderedItemText).num ?
                    wrapEmojiText((item as PageListOrderedItem.pageListOrderedItemText).num) :
                    idx() + 1}
                  {`. `}
                </span>
              )}
              {item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText' ? (
                <>
                  <Show when={item.pFlags?.checkbox}>
                    <StaticCheckbox
                      class={styles.TaskCheckbox}
                      checked={item.pFlags?.checked}
                    />
                  </Show>
                  <RichTextRenderer text={item.text} />
                </>
              ) : (
                <StablePageBlocks blocks={item.blocks} paddings={props.paddings + 1} />
              )}
            </li>
          )}</For>
        </Dynamic>
      );
    }
    case 'pageBlockBlockquote':
      return (
        <div class={classNames(styles.Padding, styles.BlockquoteWrapper)}>
          {/* reuse the app-standard quote styling (left accent bar + tinted bg + quote glyph) */}
          <blockquote class={classNames('quote-like', 'quote-like-border', 'quote-like-icon', styles.Blockquote)}>
            <RichTextRenderer text={block.text} />
            <Show when={!isRichTextEmpty(block.caption)}>
              <div class={classNames(styles.BlockquoteCaption, 'secondary')}>
                <RichTextRenderer text={block.caption} />
              </div>
            </Show>
          </blockquote>
        </div>
      );
    case 'pageBlockBlockquoteBlocks':
      return (
        <div class={classNames(styles.Padding, styles.BlockquoteWrapper)}>
          {/* same app-standard quote chrome as the inline blockquote (accent bar + tinted bg + glyph),
              but hosting parsed child blocks instead of a single rich-text run */}
          <blockquote class={classNames('quote-like', 'quote-like-border', 'quote-like-icon', styles.Blockquote, styles.BlockquoteBlocks, styles.BlockContainer)}>
            <StablePageBlocks blocks={block.blocks} paddings={props.paddings + 1} />
            <Show when={!isRichTextEmpty(block.caption)}>
              <div class={classNames(styles.BlockquoteCaption, 'secondary')}>
                <RichTextRenderer text={block.caption} />
              </div>
            </Show>
          </blockquote>
        </div>
      );
    case 'pageBlockCover':
      return (
        <div class={styles.Cover}>
          <StablePageBlocks blocks={[block.cover]} paddings={props.paddings} />
        </div>
      );
    case 'pageBlockPhoto': {
      const context = useContext(InstantViewContext);
      const {PhotoTsx} = useHotReloadGuard();
      const photo = createMemo(() => findPagePhoto(context, block.photo_id));
      let ref: HTMLDivElement, onClick: () => void;
      return (
        <>
          <PhotoTsx
            ref={(_ref) => {
              ref = _ref;
              onClick = prepareMediaForViewer(
                ref,
                photo,
                () => block.caption,
                () => block.webpage_id,
                () => block.url
              );
            }}
            class={styles.Media}
            photo={photo()}
            withoutPreloader
            onResult={() => onMediaResult(ref, props.paddings, props.onSize)}
            onClick={() => onClick()}
          />
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockVideo': {
      const context = useContext(InstantViewContext);
      const {VideoTsx} = useHotReloadGuard();
      const doc = createMemo(() => findPageDocument(context, block.video_id));
      let ref: HTMLDivElement, onClick: () => void;
      return (
        <>
          <VideoTsx
            ref={(_ref) => {
              ref = _ref;
              onClick = prepareMediaForViewer(ref, doc, () => block.caption);
            }}
            doc={doc()}
            class={styles.Media}
            withoutPreloader
            withPreview
            noInfo
            onResult={() => onMediaResult(ref, props.paddings, props.onSize)}
            onClick={() => onClick()}
          />
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockAudio': {
      const context = useContext(InstantViewContext);
      const {DocumentTsx} = useHotReloadGuard();
      const doc = createMemo(() => findPageDocument(context, block.audio_id));
      const message = createMemo<Message.message>(() => ({
        _: 'message',
        id: (Number(block.audio_id) || 0) as number, // Fake ID
        peer_id: {_: 'peerUser', user_id: 0},
        date: 0,
        message: '',
        media: {
          _: 'messageMediaDocument',
          document: doc(),
          pFlags: {}
        },
        pFlags: {},
        mid: (Number(block.audio_id) || 0) as number, // Fake MID
        peerId: NULL_PEER_ID
      }));

      return (
        <>
          <DocumentTsx
            class={classNames(styles.Padding, styles.Audio)}
            message={message()}
            withTime={false}
            clickable
            autoDownloadSize={10 * 1024 * 1024} // 10MB auto-download limit
          />
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockChannel': {
      const {PeerTitleTsx, appImManager} = useHotReloadGuard();
      const context = useContext(InstantViewContext);
      const {collapse} = context;
      const peerId = block.channel.id.toPeerId(true);
      return (
        <div
          class={classNames(
            styles.SectionName,
            styles.Channel,
            !hasDisabledNavigation(context) && 'hover-effect',
            'text-bold'
          )}
          onClick={() => {
            if(hasDisabledNavigation(context)) return;
            collapse();
            appImManager.setInnerPeer({peerId});
          }}
        >
          <PeerTitleTsx peerId={peerId} />
        </div>
      );
    }
    case 'pageBlockAuthorDate':
      return (
        <div
          dir="auto"
          class={classNames(
            styles.Padding,
            styles.AuthorDate,
            'secondary',
            useContext(InstantViewContext).page.pFlags.rtl && 'text-right'
          )}
        >
          <Show when={!isRichTextEmpty(block.author)}>
            <RichTextRenderer text={block.author} />
            {` • `}
          </Show>
          {block.published_date ?
            formatFullSentTime(block.published_date, true) :
            formatDate(new Date())}
        </div>
      );
    case 'pageBlockAnchor':
      return (
        <div
          class={styles.Anchor}
          id={useContext(InstantViewContext).randomId + block.name}
        />
      );
    case 'pageBlockTable': {
      const rowViews = new WeakMap<PageTableRow, GenericTableRow>();
      const cellViews = new WeakMap<PageTableCell, GenericTableCell>();
      const getCellView = (cell: PageTableCell) => {
        let view = cellViews.get(cell);
        if(view) return view;
        view = {
          // A function child is mounted by GenericTable's stable cell owner.
          // Its RichTextRenderer therefore survives source changes instead of
          // being recreated by the rows mapping computation.
          renderContent: () => cell.text ? <RichTextRenderer text={cell.text} /> : undefined,
          get header() {
            return cell.pFlags.header;
          },
          get colspan() {
            return cell.colspan;
          },
          get rowspan() {
            return cell.rowspan;
          },
          get alignCenter() {
            return cell.pFlags.align_center;
          },
          get alignRight() {
            return cell.pFlags.align_right;
          },
          get valignMiddle() {
            return cell.pFlags.valign_middle;
          },
          get valignBottom() {
            return cell.pFlags.valign_bottom;
          }
        };
        cellViews.set(cell, view);
        return view;
      };
      const getRowView = (row: PageTableRow) => {
        let view = rowViews.get(row);
        if(view) return view;
        view = {
          get cells() {
            return row.cells.map(getCellView);
          }
        };
        rowViews.set(row, view);
        return view;
      };
      const rows = createMemo<GenericTableRow[]>(() => block.rows.map(getRowView));

      return (
        <div class={styles.TableWrapper}>
          <Show when={!isRichTextEmpty(block.title)}>
            <div class={styles.TableName}>
              <RichTextRenderer text={block.title} />
            </div>
          </Show>
          <div class={styles.Table}>
            <GenericTable
              rows={rows()}
              bordered={block.pFlags.bordered}
              striped={block.pFlags.striped}
            />
          </div>
        </div>
      );
    }
    case 'pageBlockRelatedArticles': {
      const {PhotoTsx} = useHotReloadGuard();
      return (
        <>
          <div class={styles.SectionName}>
            {/* {useHotReloadGuard().i18n('InstantView.RelatedArticles')} */}
            <RichTextRenderer text={block.title} />
          </div>
          <For each={block.articles}>{(article, idx) => {
            const context = useContext(InstantViewContext);
            const wrapped = createMemo(() => wrapUrl('tg://iv?url=' + encodeURIComponent(article.url)));
            const photo = createMemo(() => article.photo_id ?
              findPagePhoto(context, article.photo_id) :
              undefined);
            return (
              <>
                {idx() && <div class={styles.Border} />}
                <a
                  dir="auto"
                  href={hasDisabledNavigation(context) ? undefined : wrapped().url}
                  aria-disabled={hasDisabledNavigation(context)}
                  class={classNames(
                    styles.RelatedArticle,
                    photo() && styles.WithPhoto,
                    idx() && styles.BorderTop,
                    !hasDisabledNavigation(context) && 'hover-effect'
                  )}
                  // @ts-ignore
                  attr:onclick={hasDisabledNavigation(context) ? undefined : wrapped().onclick + '(this)'}
                >
                  <div class={classNames(styles.RelatedArticleTitle, 'text-bold')}>
                    <RichTextRenderer text={{_: 'textPlain', text: article.title}} />
                  </div>
                  <div class={styles.RelatedArticleDescription}>
                    <RichTextRenderer text={{_: 'textPlain', text: article.description}} />
                  </div>
                  <div class={classNames(styles.RelatedArticleAuthor, 'secondary')}>
                    <Show when={article.author}>
                      <RichTextRenderer text={{_: 'textPlain', text: article.author}} />
                      {` • `}
                    </Show>
                    <Show when={article.published_date}>
                      <span dir="auto">{formatFullSentTime(article.published_date, true)}</span>
                    </Show>
                  </div>
                  <Show when={photo()}>
                    {(photo) => (
                      <PhotoTsx
                        photo={photo() as Photo.photo}
                        class={styles.RelatedArticlePhoto}
                        boxWidth={100}
                        boxHeight={100}
                        withoutPreloader
                      />
                    )}
                  </Show>
                </a>
              </>
            );
          }}</For>
        </>
      );
    }
    case 'pageBlockEmbed': {
      const context = useContext(InstantViewContext);
      const {PhotoTsx} = useHotReloadGuard();
      const isFullWidth = () => block.pFlags?.full_width;
      const posterPhoto = createMemo(() => block.poster_photo_id ?
        findPagePhoto(context, block.poster_photo_id) :
        undefined);

      const [height, setHeight] = createSignal(0);
      let mediaRef: HTMLDivElement;
      const canMountWebView = () => !hasDisabledNavigation(context) && !!(block.html || block.url);
      createEffect(() => {
        const width = block.w || 4;
        const blockHeight = block.h || 3;
        const paddings = Math.max(isFullWidth() ? 0 : 2, props.paddings);
        if(mediaRef) _onMediaResult(mediaRef, width, blockHeight, paddings);
      });
      createEffect(() => {
        if(!canMountWebView()) setHeight(0);
      });

      return (
        <>
          <div
            ref={mediaRef}
            class={classNames(
              styles.Media,
              styles.Embed,
              isFullWidth() ? styles.EmbedFullWidth : styles.EmbedAutoWidth,
              height() && styles.EmbedHasHeight
            )}
            style={{
              '--height': height() && height() + 'px'
            }}
          >
            <Show
              when={canMountWebView()}
              fallback={
                <Show when={posterPhoto()}>
                  {(posterPhoto) => <PhotoTsx photo={posterPhoto()} withoutPreloader />}
                </Show>
              }
            >
              <EmbedWebView block={block} context={context} onHeight={setHeight} />
            </Show>
          </div>
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockEmbedPost': {
      const context = useContext(InstantViewContext);
      const {Row, PhotoTsx} = useHotReloadGuard();
      const authorPhoto = createMemo(() => block.author_photo_id ?
        findPagePhoto(context, block.author_photo_id) :
        undefined);

      return (
        <div class={classNames(styles.Post, styles.BlockGutter)}>
          <div class={styles.PostBorder} />
          <Row class={styles.PostAuthor}>
            <Row.Title class="text-bold">
              <RichTextRenderer text={{_: 'textPlain', text: block.author}} />
            </Row.Title>
            <Row.Subtitle>
              {formatFullSentTime(block.date, true)}
            </Row.Subtitle>
            <Row.Media size="abitbigger">
              <PhotoTsx
                class={styles.PostAuthorPhoto}
                photo={authorPhoto()}
                withoutPreloader
                boxWidth={42}
                boxHeight={42}
              />
            </Row.Media>
          </Row>
          <div class={styles.BlockContainer}>
            <StablePageBlocks blocks={block.blocks} paddings={props.paddings + 1} />
          </div>
        </div>
      );
    }
    case 'pageBlockSlideshow': {
      const {Slideshow} = useHotReloadGuard();
      const items = createStablePageBlockEntries(() => block.items);

      return (
        <>
          <Slideshow
            class={styles.Slideshow}
            items={items()}
            getItemKey={(item) => item.key}
          >
            {(item, idx) => (
              <Block block={item.block} paddings={0} noCaption />
            )}
          </Slideshow>
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockMap': {
      const context = useContext(InstantViewContext);
      const geo = block.geo as GeoPoint.geoPoint;
      const url = makeGoogleMapsUrl(geo);
      const location = getWebFileLocation(geo, block.w, block.h, block.zoom);
      const {PhotoTsx} = useHotReloadGuard();

      return (
        <>
          <a
            ref={(ref) => {
              _onMediaResult(
                ref,
                block.w,
                block.h,
                props.paddings
              );
            }}
            href={hasDisabledNavigation(context) ? undefined : url}
            target="_blank"
            aria-disabled={hasDisabledNavigation(context)}
            class={styles.Map}
            style={{'--max-height': block.h + 'px'}}
          >
            <PhotoTsx
              photo={location}
              class={styles.Media}
              withoutPreloader
            />
            <GeoPin />
          </a>
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockKicker':
      return (
        <div class={classNames(styles.Padding, styles.Kicker, 'text-bold')}>
          <RichTextRenderer text={block.text} />
        </div>
      );
    case 'pageBlockThinking':
      return (
        <p class={classNames(styles.Padding, styles.Paragraph, 'secondary')}>
          <RichTextRenderer text={block.text} />
        </p>
      );
    case 'pageBlockPullquote':
      return (
        <div class={styles.Pullquote}>
          <RichTextRenderer text={block.text} />
          <Show when={!isRichTextEmpty(block.caption)}>
            <div class={classNames(styles.BlockquoteCaption, 'secondary')}>
              <RichTextRenderer text={block.caption} />
            </div>
          </Show>
        </div>
      );
    case 'pageBlockDetails': {
      const [open, setOpen] = createSignal(!!block.pFlags.open);
      const detailsMap = useContext(InstantViewContext).details;
      let userToggled = false;
      createEffect(() => {
        const serverOpen = !!block.pFlags.open;
        if(!userToggled) setOpen(serverOpen);
      });
      return (
        <div
          ref={(ref) => {detailsMap.set(ref, setOpen)}}
          class={classNames(styles.Details)}
        >
          <div
            class={classNames(styles.DetailsSummary, 'hover-effect')}
            onClick={() => {
              userToggled = true;
              setOpen(!open());
            }}
          >
            <IconTsx
              icon="down"
              class={classNames(styles.DetailsIcon, open() && styles.DetailsIconOpen)}
            />
            <div class={classNames(styles.DetailsTitle, 'text-bold')}>
              <RichTextRenderer text={block.title} />
            </div>
          </div>
          <div class={styles.Border} />
          <div
            class={classNames(
              styles.DetailsContent,
              open() && styles.DetailsContentOpen
            )}
          >
            <div class={styles.DetailsContentInner}>
              <StablePageBlocks blocks={block.blocks} paddings={props.paddings} />
            </div>
          </div>
        </div>
      );
    }
    case 'pageBlockCollage': {
      let ref: HTMLDivElement;
      const map: Map<HTMLDivElement, {width: number, height: number}> = new Map();
      const [sizeRevision, setSizeRevision] = createSignal(0);
      const items = createStablePageBlockEntries(() => block.items);
      const ret = (
        <div
          ref={ref}
          class={classNames(styles.Collage, styles.Media)}
        >
          <For each={items()}>{(item) => {
            let ref: HTMLDivElement;
            onCleanup(() => {
              map.delete(ref);
              setSizeRevision((revision) => revision + 1);
            });
            const ret = (
              <div
                ref={ref}
                class={styles.CollageItem}
              >
                <Block
                  block={item.block}
                  paddings={props.paddings}
                  onSize={(size) => {
                    map.set(ref, size);
                    setSizeRevision((revision) => revision + 1);
                  }}
                />
              </div>
            );

            return ret;
          }}</For>
        </div>
      );

      createEffect(() => {
        sizeRevision();
        const currentItems = items();
        currentItems.map((item) => item.key);
        const length = currentItems.length;
        const sizes = Array.from(ref.children).map((element) => map.get(element as HTMLDivElement))
        .filter(Boolean)
        .map(({width, height}) => ({w: width, h: height}));
        if(!length || sizes.length !== length) return;
        const {width, height} = prepareAlbum({
          container: ref,
          items: sizes,
          maxWidth: 400,
          minWidth: 100,
          spacing: 2
        });
        _onMediaResult(ref, width, height, props.paddings);
        // console.warn('collage map', map, ref.childElementCount);
      });

      return (
        <>
          {ret}
          <CaptionC caption={block.caption} />
        </>
      );
    }
    default:
      return (
        <div class={classNames(styles.Padding, styles.Unsupported)}>
          Unsupported block: {block._}
        </div>
      );
  }
}

function isRichTextEmpty(text: RichText) {
  return text._ === 'textEmpty' || (text._ === 'textPlain' && !text.text.trim());
}

// Flatten a RichText tree to its plain string (preformatted code is plain text; any inline
// formatting is dropped since a code block renders verbatim).
function richTextToString(text: RichText): string {
  if(!text) return '';
  switch(text._) {
    case 'textEmpty': return '';
    case 'textPlain': return text.text;
    case 'textConcat': return text.texts.map(richTextToString).join('');
    default: return richTextToString((text as Exclude<RichText, RichText.textConcat | RichText.textPlain | RichText.textEmpty> & {text: RichText}).text);
  }
}

function BlockLatex(props: {source: string}) {
  const context = useContext(InstantViewContext);
  return (
    <Latex
      source={props.source}
      isBlock
      sourceRevision={() => context.sourceRevision}
      phase={() => context.phase}
      revealCoordinator={context.revealCoordinator}
      onTextLayout={context.onTextLayout}
    />
  );
}

function getInstantViewRichTextOptions(context: InstantViewContextValue) {
  const options = context.richTextOptions;
  return {
    ...options,
    disabledEntities: getInstantViewDisabledEntities(options),
    customEmojiRenderer: context.customEmojiRenderer
  };
}

function RichTextRenderer(props: {text: RichText}) {
  const context = useContext(InstantViewContext);
  const value = createMemo(() => {
    return wrapTelegramRichText(
      props.text,
      {webPageId: context.webPageId, url: context.page.url, randomId: context.randomId}
    );
  });
  const hasInlineMath = createMemo(() => value().text.includes('\x02'));
  const needsPostprocessing = createMemo(() => {
    const wrapped = value();
    return hasInlineMath() || wrapped.entities?.some((entity) => (
      entity._ === 'messageEntityAnchor' ||
      entity._ === 'messageEntityUrl' ||
      entity._ === 'messageEntityTextUrl'
    ));
  });
  const richTextOptions = createMemo(() => getInstantViewRichTextOptions(context));
  const effectivePhase = createMemo(() => (
    context.revealCoordinator?.phase() ?? context.phase
  ));

  const processFragment = (
    fragment: DocumentFragment,
    middleware: Middleware,
    typesetMath: boolean
  ) => {
    fragment.querySelectorAll('[onclick="tg_iv(this)"]').forEach((el) => {
      el.classList.add(styles.Anchor);
    });
    // In-page fragment links (`#x`) get wrapped by wrapUrl into `https://#x` and flagged as
    // masked → wrapRichText attaches `showMaskedAlert` onclick. That alert is meaningless for
    // a same-page scroll, strip it so the IV onClick delegator can run scrollToAnchor.
    fragment.querySelectorAll<HTMLAnchorElement>('a.anchor-url[onclick="showMaskedAlert(this)"]').forEach((el) => {
      if(FRAGMENT_HREF_RE.test(el.getAttribute('href') || '')) {
        el.removeAttribute('onclick');
      }
    });
    // Inline math markers (`$x$`) are carried as plain-text base64 by the parser. Decode them into
    // spans before insertion; streaming stays raw and the final render lets Temml typeset them.
    return hydrateInlineMath(fragment, middleware, typesetMath);
  };
  const processFinalFragment = (fragment: DocumentFragment, middleware: Middleware) => (
    processFragment(fragment, middleware, true)
  );
  const processStreamingFragment = (fragment: DocumentFragment, middleware: Middleware) => (
    processFragment(fragment, middleware, false)
  );
  const selectedProcessFragment = createMemo(() => {
    if(!needsPostprocessing()) return;
    return hasInlineMath() && effectivePhase() !== 'final' ?
      processStreamingFragment :
      processFinalFragment;
  });

  return (
    <SolidInlineText
      value={value}
      sourceRevision={() => context.sourceRevision}
      phase={() => context.phase}
      revealCoordinator={context.revealCoordinator}
      richTextOptions={richTextOptions}
      processFragment={selectedProcessFragment()}
      processFragmentMode="chunk"
      onLayout={context.onTextLayout}
    />
  );
}

function PreformattedCode(props: {text: RichText, language: string}) {
  const context = useContext(InstantViewContext);
  const value = createMemo(() => {
    const code = richTextToString(props.text);
    return {
      _: 'textWithEntities' as const,
      text: code,
      entities: [{
        _: 'messageEntityPre' as const,
        offset: 0,
        length: code.length,
        language: props.language || ''
      }]
    };
  });

  const richTextOptions = createMemo(() => getInstantViewRichTextOptions(context));

  return (
    <SolidInlineText
      value={value}
      sourceRevision={() => context.sourceRevision}
      phase={() => context.phase}
      revealCoordinator={context.revealCoordinator}
      richTextOptions={richTextOptions}
      inline={false}
      class={classNames(styles.Padding, styles.PreformattedWrapper)}
      onLayout={context.onTextLayout}
    />
  );
}
