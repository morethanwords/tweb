import {For, createEffect, createContext, useContext, Show, createSignal, createUniqueId, Setter, onCleanup, createMemo, on, Accessor, batch} from 'solid-js';
import type {JSX} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {
  Document,
  Page,
  PageBlock,
  PageButton,
  PageCaption,
  PageListOrderedItem,
  PageTableCell,
  PageTableRow,
  Photo,
  RichText
} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import {
  applyInstantViewMediaSize,
  getMaximumHeightMediaSize,
  getInstantViewHeadingPresentation,
  getPageButtonClasses,
  getPageButtonRowClasses,
  INSTANT_VIEW_MEDIA_MAX_HEIGHT,
  instantViewStyles as styles,
  type InstantViewHeadingLevel
} from '@components/instantViewFormatting';
import {orderedListCounterStyle, orderedListItemStyle} from '@components/instantViewList';
import {canonicalOrderedListType, getOrderedListTypePresentation} from '@lib/richTextProcessor/orderedList';
import wrapRichText, {makeQuoteCollapsable} from '@lib/richTextProcessor/wrapRichText';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import GenericTable, {GenericTableCell, GenericTableRow} from '@components/genericTable';
import {SolidJSHotReloadGuardContextValue, useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {formatDate, formatFullSentTime} from '@helpers/date';
import findUpClassName from '@helpers/dom/findUpClassName';
import findUpTag from '@helpers/dom/findUpTag';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import onQuoteClick from '@helpers/dom/onQuoteClick';
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
import Modes from '@config/modes';
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
import wrapMediaSpoiler, {onMediaSpoilerClick} from '@components/wrappers/mediaSpoiler';
import showTooltip from '@components/tooltip';
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
import {
  CHATLESS_BUTTON_TYPES,
  RichPageButton,
  getButtonBackground,
  getButtonTypeIcon,
  getPageButtonRowAlign
} from '@components/wrappers/buttonTypes';
import {
  RICH_BUTTON_LINK_CLASS,
  copyUrlButtonAnchor,
  createUrlButtonAnchor
} from '@components/wrappers/urlButtonAnchor';
import {getRichTextButton, RICH_TEXT_BUTTON_SELECTOR} from '@lib/richTextProcessor/richTextButtons';
import type Chat from '@components/chat/chat';

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
  // the message a rich message's page is shown in: its buttons act on it (absent for a page
  // opened on its own, where only links, copying and profiles work)
  chat?: Chat,
  message?: Message.message,
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
  referenceTooltipClose?: () => void,
  ready: boolean,
  savingScroll: boolean,
  displayTextDiff?: boolean,
  onChecklistToggle?: (path: number[], checked: boolean) => void,
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
      const target = document.getElementById(context.randomId + m[1].slice(1));
      if(target?.classList.contains('tg-reference')) {
        const textElement = document.createDocumentFragment();
        textElement.append(...Array.from(target.childNodes, (node) => node.cloneNode(true)));
        context.referenceTooltipClose?.();
        context.referenceTooltipClose = showTooltip({
          element: anchor,
          container: anchor.closest(`.${styles.InstantView}`) as HTMLElement || anchor.parentElement,
          vertical: 'top',
          textElement
        }).close;
        return;
      }

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
  chat?: Chat,
  message?: ReactiveInstantViewValue<Message.message>,
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
  displayTextDiff?: boolean,
  onChecklistToggle?: (path: number[], checked: boolean) => void,
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
    chat: props.chat,
    get message() {
      return props.message === undefined ? undefined : readReactiveInstantViewValue(props.message);
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
    get displayTextDiff() {
      return props.displayTextDiff;
    },
    get onChecklistToggle() {
      return props.onChecklistToggle;
    },
    media: []
  };

  onCleanup(() => value.referenceTooltipClose?.());
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
        class={classNames(styles.RichText, styles.InstantView, props.class, 'text-overflow-wrap')}
        onClick={onClick.bind(null, props.value)}
        style={props.style}
      >
        {props.value.customEmojiRenderer}
        <div class={classNames(styles.InstantViewContent, styles.Blocks, props.contentClass)}>
          <StablePageBlocks
            blocks={props.value.page.blocks}
            path={[]}
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

  onCleanup(() => value.referenceTooltipClose?.());

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
        <Scrollable ref={scrollableRef} tabIndex={0}>
          <InstantViewContent
            value={value}
            paddings={2}
            style={{'--iv-scale': appSettings.instantView.scale.toFixed(3)}}
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
  applyInstantViewMediaSize(ref, width, height, paddings);
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
      <div class={classNames(styles.Padding, styles.Caption)}>
        <Show when={!isRichTextEmpty(props.caption.text)}>
          <div class={styles.CaptionText}>
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
  path?: number[],
  render?: (block: PageBlock) => JSX.Element
}) {
  const entries = createStablePageBlockEntries(() => props.blocks);

  return (
    <For each={entries()}>{(entry, index) => (
      props.render ?
        props.render(entry.block) :
        <Block block={entry.block} paddings={props.paddings} noCaption={props.noCaption} path={props.path && [...props.path, index()]} />
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

function createMediaSpoilerAttacher(
  media: Accessor<Photo.photo | Document.document>,
  enabled: Accessor<boolean>
) {
  const [target, setTarget] = createSignal<{
    container: HTMLElement,
    size: {width: number, height: number}
  }>();
  createEffect(() => {
    const current = target();
    const source = media();
    if(!enabled() || !source || !current) return;
    const middleware = createMiddleware().get();
    let spoiler: HTMLElement;
    onCleanup(() => spoiler?.remove());
    void wrapMediaSpoiler({
      animationGroup: 'chat',
      media: source,
      middleware,
      width: Math.max(1, current.size.width || current.container.clientWidth),
      height: Math.max(1, current.size.height || current.container.clientHeight),
      multiply: 0.3
    }).then((mediaSpoiler) => {
      if(!mediaSpoiler || !middleware()) return;
      spoiler = mediaSpoiler;
      mediaSpoiler.setAttribute('role', 'button');
      mediaSpoiler.setAttribute('aria-label', 'Spoiler');
      const reveal = (event: Event) => onMediaSpoilerClick({mediaSpoiler, event});
      mediaSpoiler.addEventListener('click', reveal);
      if(Modes.a11y) {
        mediaSpoiler.tabIndex = 0;
        mediaSpoiler.addEventListener('keydown', (event) => {
          if(event.key === 'Enter' || event.key === ' ') reveal(event);
        });
      }
      current.container.append(mediaSpoiler);
    }).catch(() => {});
  });
  return (container: HTMLElement, size: {width: number, height: number}) => {
    setTarget((current) => current?.container === container &&
      current.size.width === size.width && current.size.height === size.height ? current : {container, size});
  };
}

function orderedListItemValue(block: PageBlock.pageBlockOrderedList, index: number) {
  const step = block.pFlags.reversed ? -1 : 1;
  let value = block.start ?? (block.pFlags.reversed ? block.items.length : 1);
  for(let i = 0; i <= index; ++i) {
    value = block.items[i].value ?? value;
    if(i === index) {
      return value;
    }

    value += step;
  }
}

function toRoman(value: number) {
  if(value <= 0 || value >= 4000) {
    return '' + value;
  }

  const parts: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for(const [amount, marker] of parts) {
    while(value >= amount) {
      result += marker;
      value -= amount;
    }
  }

  return result;
}

function toAlpha(value: number) {
  if(value <= 0) {
    return '' + value;
  }

  let result = '';
  while(value > 0) {
    --value;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

function getOrderedListMarker(
  block: PageBlock.pageBlockOrderedList,
  item: PageListOrderedItem,
  index: number
) {
  if(item.num !== undefined && item.num !== '') {
    return '' + item.num;
  }

  const value = orderedListItemValue(block, index);
  const type = canonicalOrderedListType(item.type || block.type);
  switch(type) {
    case 'a':
      return toAlpha(value).toLowerCase();
    case 'A':
      return toAlpha(value);
    case 'i':
      return toRoman(value).toLowerCase();
    case 'I':
      return toRoman(value);
    default:
      return '' + value;
  }
}

function getOrderedListType(type?: string): '1' | 'a' | 'A' | 'i' | 'I' | undefined {
  return getOrderedListTypePresentation(type)?.htmlType as '1' | 'a' | 'A' | 'i' | 'I' | undefined;
}

function Block(props: {
  block: PageBlock,
  paddings: number,
  path?: number[],
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
    case 'pageBlockSubtitle':
    case 'pageBlockHeader':
    case 'pageBlockSubheader': {
      const nativeLevel = {pageBlockTitle: 1, pageBlockSubtitle: 2, pageBlockHeader: 3, pageBlockSubheader: 4}[block._];
      const level = (block as typeof block & {headingLevel?: number}).headingLevel || nativeLevel;
      const presentation = getInstantViewHeadingPresentation(Math.max(1, Math.min(6, level)) as InstantViewHeadingLevel);
      return (
        <Dynamic component={presentation.tag} class={presentation.class}>
          <RichTextRenderer text={block.text} />
        </Dynamic>
      );
    }
    case 'pageBlockHeading1':
    case 'pageBlockHeading2':
    case 'pageBlockHeading3':
    case 'pageBlockHeading4':
    case 'pageBlockHeading5':
    case 'pageBlockHeading6': {
      const level = Number(block._.slice('pageBlockHeading'.length)) as InstantViewHeadingLevel;
      const presentation = getInstantViewHeadingPresentation(level);
      return (
        <Dynamic component={presentation.tag} class={presentation.class}>
          <RichTextRenderer text={block.text} />
        </Dynamic>
      );
    }
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
      const isOrdered = block._ === 'pageBlockOrderedList';
      const orderedBlock = block as PageBlock.pageBlockOrderedList;
      const isChecklist = createMemo(() => block.items.length > 0 && block.items.every((item) => item.pFlags?.checkbox));
      const shouldHaveOwnNumbers = createMemo(() => isOrdered && orderedBlock.items.some((item) => item.num !== undefined && item.num !== ''));
      const {i18n, wrapEmojiText} = useHotReloadGuard();
      const context = useContext(InstantViewContext);
      return (
        <Dynamic
          component={isOrdered ? 'ol' : 'ul'}
          reversed={isOrdered ? orderedBlock.pFlags.reversed : undefined}
          start={isOrdered ? orderedBlock.start : undefined}
          type={isOrdered ? getOrderedListType(orderedBlock.type) : undefined}
          style={isOrdered ? orderedListCounterStyle(
            orderedBlock.start ?? (orderedBlock.pFlags.reversed ? orderedBlock.items.length : 1),
            !!orderedBlock.pFlags.reversed,
            orderedBlock.type
          ) : undefined}
          class={classNames(
            styles.List,
            isChecklist() && styles.ListChecklist,
            styles.BlockContainer,
            styles.BlockGutter,
            !isOrdered && styles.ListBullet,
            isOrdered && styles.ListOrdered,
            'browser-default'
          )}
        >
          <For each={block.items}>{(item, idx) => {
            const orderedItem = isOrdered ? item as PageListOrderedItem : undefined;
            return (
              <li
                class={classNames(styles.ListItem, shouldHaveOwnNumbers() && styles.ListItemHasNumber)}
                data-checkbox={item.pFlags?.checkbox ? 'true' : undefined}
                value={orderedItem?.value}
                type={getOrderedListType(orderedItem?.type)}
                style={isOrdered ? orderedListItemStyle(orderedItem.value, orderedItem.type) : undefined}
              >
                {shouldHaveOwnNumbers() && (
                  <span class={styles.ListItemNumber}>
                    {wrapEmojiText(getOrderedListMarker(orderedBlock!, orderedItem!, idx()))}
                    {`. `}
                  </span>
                )}
                <Show when={item.pFlags?.checkbox}>
                  <Show
                    when={context.onChecklistToggle && props.path}
                    fallback={
                      <span class={styles.TaskCheckboxButton}>
                        <StaticCheckbox class={styles.TaskCheckbox} checked={item.pFlags?.checked} />
                      </span>
                    }
                  >
                    <button
                      type="button"
                      class={styles.TaskCheckboxButton}
                      role="checkbox"
                      aria-checked={!!item.pFlags?.checked}
                      aria-label={i18n(
                        item.pFlags?.checked ? 'ChecklistUncheck' : 'ChecklistCheck'
                      ).textContent || undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        context.onChecklistToggle!(
                          [...props.path!, idx()],
                          !item.pFlags?.checked
                        );
                      }}
                    >
                      <StaticCheckbox
                        class={styles.TaskCheckbox}
                        checked={item.pFlags?.checked}
                      />
                    </button>
                  </Show>
                </Show>
                <div class={styles.ListItemContent}>
                  {item._ === 'pageListItemText' || item._ === 'pageListOrderedItemText' ? (
                    <RichTextRenderer text={item.text} />
                  ) : (
                    <StablePageBlocks
                      blocks={item.blocks}
                      paddings={props.paddings + 1}
                      path={props.path && [...props.path, idx()]}
                    />
                  )}
                </div>
              </li>
            );
          }}</For>
        </Dynamic>
      );
    }
    case 'pageBlockButtonRow':
      return <PageButtonRow block={block} />;
    case 'pageBlockBlockquote':
      return (
        <div class={classNames(styles.Padding, styles.BlockquoteWrapper)}>
          {/* reuse the app-standard quote styling (left accent bar + tinted bg + quote glyph) */}
          <CollapsableBlockquote collapsed={block.pFlags.collapsed}>
            <RichTextRenderer text={block.text} />
            <Show when={!isRichTextEmpty(block.caption)}>
              <div class={styles.BlockquoteCaption}>
                <RichTextRenderer text={block.caption} />
              </div>
            </Show>
          </CollapsableBlockquote>
        </div>
      );
    case 'pageBlockBlockquoteBlocks':
      return (
        <div class={classNames(styles.Padding, styles.BlockquoteWrapper)}>
          {/* same app-standard quote chrome as the inline blockquote (accent bar + tinted bg + glyph),
              but hosting parsed child blocks instead of a single rich-text run */}
          <blockquote class={classNames('quote-like', 'quote-like-border', 'quote-like-icon', styles.Blockquote, styles.BlockContainer)}>
            <StablePageBlocks path={props.path} blocks={block.blocks} paddings={props.paddings + 1} />
            <Show when={!isRichTextEmpty(block.caption)}>
              <div class={styles.BlockquoteCaption}>
                <RichTextRenderer text={block.caption} />
              </div>
            </Show>
          </blockquote>
        </div>
      );
    case 'pageBlockCover':
      return (
        <div>
          <StablePageBlocks blocks={[block.cover]} paddings={props.paddings} render={(cover) => <Block block={cover} paddings={props.paddings} path={props.path} />} />
        </div>
      );
    case 'pageBlockPhoto': {
      const context = useContext(InstantViewContext);
      const {PhotoTsx} = useHotReloadGuard();
      const photo = createMemo(() => findPagePhoto(context, block.photo_id));
      const attachSpoiler = createMediaSpoilerAttacher(photo, () => !!block.pFlags.spoiler);
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
            onResult={() => {
              const size = onMediaResult(ref, props.paddings, props.onSize);
              void attachSpoiler(ref, size);
            }}
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
      const attachSpoiler = createMediaSpoilerAttacher(doc, () => !!block.pFlags.spoiler);
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
            onResult={() => {
              const size = onMediaResult(ref, props.paddings, props.onSize);
              void attachSpoiler(ref, size);
            }}
            onClick={() => onClick()}
          />
          <CaptionC caption={block.caption} />
        </>
      );
    }
    // layer 229: a plain file attached to the page. Rendered with the same document row the audio
    // block uses — it already covers download, progress and the file/audio distinction.
    case 'pageBlockDocument': {
      const context = useContext(InstantViewContext);
      const {DocumentTsx} = useHotReloadGuard();
      const doc = createMemo(() => findPageDocument(context, block.document_id));
      const message = createMemo<Message.message>(() => ({
        _: 'message',
        id: (Number(block.document_id) || 0) as number, // Fake ID
        peer_id: {_: 'peerUser', user_id: 0},
        date: 0,
        message: '',
        media: {
          _: 'messageMediaDocument',
          document: doc(),
          pFlags: {}
        },
        pFlags: {},
        mid: (Number(block.document_id) || 0) as number, // Fake MID
        peerId: NULL_PEER_ID
      }));

      return (
        <Show when={doc()}>
          <DocumentTsx
            class={classNames(styles.Padding, styles.Audio)}
            message={message()}
            withTime={false}
            clickable
            autoDownloadSize={10 * 1024 * 1024} // 10MB auto-download limit
          />
          <CaptionC caption={block.caption} />
        </Show>
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
            <div class={classNames(styles.TableName, 'text-bold')}>
              <RichTextRenderer text={block.title} />
            </div>
          </Show>
          <div class={classNames(styles.Table, block.pFlags.compact && styles.TableCompact)}>
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
              !isFullWidth() && styles.EmbedAutoWidth,
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
      const [sizes, setSizes] = createSignal<Record<string, {height: number, width: number}>>({});
      const aspectRatio = () => {
        const size = getMaximumHeightMediaSize(items().map((item) => sizes()[item.key]).filter(Boolean));
        return size ? size.width / size.height : 16 / 9;
      };

      return (
        <>
          <Slideshow
            aspectRatio={aspectRatio()}
            class={styles.Slideshow}
            items={items()}
            getItemKey={(item) => item.key}
          >
            {(item, idx) => (
              <Block
                block={item.block}
                paddings={0}
                noCaption
                onSize={(size) => {
                  setSizes((current) => {
                    if(
                      current[item.key]?.width === size.width &&
                      current[item.key]?.height === size.height
                    ) return current;
                    const next = {...current};
                    next[item.key] = size;
                    return next;
                  });
                }}
              />
            )}
          </Slideshow>
          <CaptionC caption={block.caption} />
        </>
      );
    }
    case 'pageBlockMap':
    case 'inputPageBlockMap': {
      const context = useContext(InstantViewContext);
      const geo = block.geo._ === 'inputGeoPoint' ? {
        ...block.geo,
        _: 'geoPoint' as const,
        access_hash: 0
      } : block.geo as GeoPoint.geoPoint;
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
        <p class={classNames(styles.Padding, styles.Paragraph, styles.Thinking)}>
          <RichTextRenderer text={block.text} />
        </p>
      );
    case 'pageBlockPullquote':
      return (
        <div class={classNames(styles.Pullquote, 'quote-like')}>
          <div class={classNames(styles.PullquoteText, 'text-italic')}>
            <RichTextRenderer text={block.text} />
          </div>
          <Show when={!isRichTextEmpty(block.caption)}>
            <div class={classNames(styles.BlockquoteCaption, styles.PullquoteAuthor, 'text-bold')}>
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
      const summaryId = createUniqueId();
      const contentId = createUniqueId();
      let content: HTMLDivElement;
      createEffect(() => {
        content.inert = !open();
      });
      return (
        <div
          ref={(ref) => {detailsMap.set(ref, setOpen)}}
          class={classNames(styles.Details)}
        >
          <button
            type="button"
            id={summaryId}
            class={classNames(styles.DetailsSummary, 'hover-effect')}
            aria-expanded={open()}
            aria-controls={contentId}
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
          </button>
          <div
            ref={content}
            id={contentId}
            role="region"
            aria-labelledby={summaryId}
            aria-hidden={!open()}
            class={classNames(
              styles.DetailsContent,
              open() && styles.DetailsContentOpen
            )}
          >
            <div class={styles.DetailsContentInner}>
              <StablePageBlocks path={props.path} blocks={block.blocks} paddings={props.paddings} />
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
          spacing: 2,
          maxHeight: INSTANT_VIEW_MEDIA_MAX_HEIGHT
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

/**
 * layer 229 lets a page blockquote ask to start collapsed. It reuses the app-wide collapsable
 * quote (same classes, same resize observer), so the click that expands it is the one the host
 * already handles — the chat's for a rich message, this one's for a standalone page.
 */
function CollapsableBlockquote(props: {collapsed?: boolean, children: JSX.Element}) {
  let ref: HTMLQuoteElement;
  // read once: a block never switches between collapsed and open, and the class below has to
  // carry `quote-like-collapsable` itself — Solid applies the class binding after the ref, so a
  // class the ref added would be wiped
  const collapsed = !!props.collapsed;

  const onClick = (e: MouseEvent) => {
    if(!collapsed) return;
    onQuoteClick(e, ref);
  };

  return (
    <blockquote
      ref={(_ref) => {
        ref = _ref;
        if(collapsed) {
          onCleanup(makeQuoteCollapsable(_ref));
        }
      }}
      class={classNames(
        'quote-like',
        'quote-like-border',
        'quote-like-icon',
        collapsed && 'quote-like-collapsable',
        styles.Blockquote
      )}
      onClick={onClick}
    >
      {props.children}
    </blockquote>
  );
}

/**
 * Layer 229's buttons in a page: rows of them and single ones inside the text. A button does
 * what the bot keyboard's button of the same type does, acting on the message the page is shown
 * in; where the host hides links (a translation, a suspected spammer), buttons go inert with them.
 */
function isPageButtonDisabled(context: InstantViewContextValue, button: RichPageButton) {
  return (!context.chat && !CHATLESS_BUTTON_TYPES.has(button.type._)) ||
    button.type._ === 'inlineButtonTypeDisabled' ||
    !!getInstantViewDisabledEntities(context.richTextOptions)?.has('messageEntityRichButton');
}

/** The actions pull in half the popups, so they come with the first click, not with the page. */
async function activatePageButton(
  context: InstantViewContextValue,
  button: RichPageButton,
  element: HTMLElement,
  event: MouseEvent
) {
  const {getRichPageButtonHandler} = await import('@components/wrappers/keyboardButton');
  if(!context.isAlive() || !element.isConnected) return;
  const handler = getRichPageButtonHandler({
    button,
    label: richTextToString(button.text),
    chat: context.chat,
    message: context.message
  });
  if(!handler || handler.unavailable) return;
  handler.refCallbacks.forEach((callback) => callback(element));
  handler.onClick?.(event);
}

function getRichPageButtonClasses(button: RichPageButton) {
  return getPageButtonClasses(getButtonBackground(button.style), button.style?.pFlags.link);
}

function PageButtonRow(props: {block: PageBlock.pageBlockButtonRow}) {
  return (
    <div class={classNames(styles.Padding, ...getPageButtonRowClasses(getPageButtonRowAlign(props.block)))}>
      <For each={props.block.buttons}>
        {(button) => <PageButtonView button={button} />}
      </For>
    </div>
  );
}

function PageButtonView(props: {button: PageButton}) {
  const context = useContext(InstantViewContext);
  const {button} = props;
  const disabled = isPageButtonDisabled(context, button);
  // a link button is a link: opening it takes the same path as a link in the text
  const anchor = !disabled && button.type._ === 'inlineButtonTypeUrl' ?
    createUrlButtonAnchor(button.type.url) :
    undefined;
  const icon = getButtonTypeIcon(button.type);
  return (
    <Dynamic
      component={anchor ? 'a' : 'button'}
      ref={(element: HTMLElement) => anchor && copyUrlButtonAnchor(anchor, element)}
      class={classNames(
        ...getRichPageButtonClasses(button),
        disabled && styles.PageButtonDisabled,
        // IV opens a link by this class (onClick above)
        anchor?.className
      )}
      disabled={!anchor ? disabled : undefined}
      aria-disabled={disabled || undefined}
      onClick={(e: MouseEvent) => {
        if(anchor) return;
        cancelEvent(e);
        if(!disabled) void activatePageButton(context, button, e.currentTarget as HTMLElement, e);
      }}
    >
      <span class={styles.PageButtonLabel}>
        <RichTextRenderer text={button.text} />
      </span>
      <Show when={icon}>
        <IconTsx
          icon={icon}
          class={classNames(styles.PageButtonIcon, button.type._ === 'inlineButtonTypeUrl' && styles.PageButtonIconLink)}
        />
      </Show>
    </Dynamic>
  );
}

/** The text drew its inline buttons (wrapRichText); give each its look and its action. */
function wireInlinePageButtons(context: InstantViewContextValue, fragment: DocumentFragment) {
  fragment.querySelectorAll<HTMLElement>(RICH_TEXT_BUTTON_SELECTOR).forEach((element) => {
    const button = getRichTextButton(element);
    if(!button) return;
    const disabled = isPageButtonDisabled(context, button);
    element.classList.add(
      ...getRichPageButtonClasses(button).filter(Boolean),
      styles.PageButtonInline,
      ...(disabled ? [styles.PageButtonDisabled] : [])
    );
    element.querySelector('.anchor-url')?.classList.add(RICH_BUTTON_LINK_CLASS);
    if(disabled) {
      element.setAttribute('aria-disabled', 'true');
      return;
    }

    // a link button carries its link inside: the link takes the focus and opens itself
    if(Modes.a11y && button.type._ !== 'inlineButtonTypeUrl') {
      element.tabIndex = 0;
    }

    // Enter and Space come through here too (role="button")
    attachClickEvent(element, (e) => {
      const anchor = findUpTag(e.target, 'A');
      if(anchor && element.contains(anchor)) return;
      cancelEvent(e);
      void activatePageButton(context, button, element, e);
    });
  });
}

function RichTextRenderer(props: {text: RichText}) {
  const context = useContext(InstantViewContext);
  const value = createMemo(() => {
    return wrapTelegramRichText(
      props.text,
      {webPageId: context.webPageId, url: context.page.url, randomId: context.randomId, displayTextDiff: context.displayTextDiff}
    );
  });
  const hasInlineMath = createMemo(() => value().text.includes('\x02'));
  const needsPostprocessing = createMemo(() => {
    const wrapped = value();
    return hasInlineMath() || wrapped.entities?.some((entity) => (
      entity._ === 'messageEntityAnchor' ||
      entity._ === 'messageEntityUrl' ||
      entity._ === 'messageEntityTextUrl' ||
      entity._ === 'messageEntityRichButton'
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
    wireInlinePageButtons(context, fragment);
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
