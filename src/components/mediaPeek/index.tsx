/**
 * A peek: hold the mouse button on a sticker, custom emoji, GIF, photo or video to see it big,
 * drag over its neighbours to switch to them, release to put it away. Releasing does not click
 * what the press started on.
 */

import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import {Accessor, createRoot, createSignal, For, JSX, onCleanup, onMount, Setter, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import toArray from '@helpers/array/toArray';
import deferredPromise, {bindPromiseToDeferred, CancellablePromise} from '@helpers/cancellablePromise';
import cancelEvent from '@helpers/dom/cancelEvent';
import cancelSelection from '@helpers/dom/cancelSelection';
import swallowNextClick from '@helpers/dom/swallowNextClick';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';
import {MediaSize, makeMediaSize} from '@helpers/mediaSize';
import {getMiddleware, Middleware, MiddlewareHelper} from '@helpers/middleware';
import classNames from '@helpers/string/classNames';
import windowSize from '@helpers/windowSize';
import {Message, MessageMedia, PhotoSize} from '@layer';
import canSeeMessageMedia from '@appManagers/utils/messages/canSeeMessageMedia';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import renderMediaPeek, {MediaPeekPlayback} from '@components/mediaPeek/renderMedia';
import {getMediaSourceClip} from '@components/mediaViewer/clipPath';
import getEffectiveCornerRadii from '@components/mediaViewer/cornerRadii';
import shouldSnapshotImage from '@components/mediaViewer/shouldSnapshotImage';
import snapshotRenderedMedia, {copyRenderedImage} from '@components/mediaViewer/snapshotRenderedMedia';
import {STICKER_EFFECT_MULTIPLIER} from '@components/wrappers/sticker';
import styles from '@components/mediaPeek/mediaPeek.module.scss';

export type MediaPeekKind = 'sticker' | 'gif' | 'photo' | 'video';

export type MediaPeekSource = {
  media: MyDocument | MyPhoto,
  // * the emoji a sticker stands for, shown above it
  emoji?: string
};

type MediaPeekOptions = {
  listenTo: HTMLElement,
  listenerSetter: ListenerSetter,
  // * the element under the pointer that can be peeked at; stickers and GIFs by default
  findTarget?: (target: HTMLElement) => HTMLElement,
  // * what to show for it; by default the document named by its `data-doc-id`
  getSource?: (element: HTMLElement) => MaybePromise<MediaPeekSource>,
  getTextColor?: () => string,
  class?: string
};

type EntryState = 'shown' | 'entering' | 'switching' | 'leaving';

type Entry = {
  kind: MediaPeekKind,
  source: MediaPeekSource,
  element: HTMLElement,
  // * the picture itself: a fitted photo's aspecter, not its box with the blurred sides
  originElement: HTMLElement,
  // * what it shows there now: the peek starts from it rather than from a blurred thumbnail
  snapshot?: HTMLImageElement | HTMLCanvasElement,
  isOut: boolean,
  // * what the item takes and what the media inside it takes
  box: MediaSize,
  size: MediaSize,
  // * a premium sticker moves aside for its effect
  shift: number,
  clip: boolean,
  // * none when there is nothing to fly back to: it is put away where it is
  origin: Accessor<EntryOrigin>,
  setOrigin: Setter<EntryOrigin>,
  state: Accessor<EntryState>,
  setState: Setter<EntryState>,
  middlewareHelper: MiddlewareHelper,
  // * resolves with what starts the media moving once there is something to show
  rendered: CancellablePromise<MediaPeekPlayback>,
  playback?: MediaPeekPlayback
};

// * where the item starts from and flies back to, in numbers the stylesheet moves it by, all on one
// * clock (`--media-peek-progress`)
type EntryOrigin = {
  // * from the middle of the window to the middle of what it is opened on, and how much smaller
  x: number,
  y: number,
  scale: number,
  // * the crop of what it is opened on, and its corners (tl, tr, br, bl), in the media's own px
  crop?: {x: number, y: number, radii: number[]},
  // * how far in the area it is opened from cuts each side of the window, in viewport px
  edges?: ReturnType<typeof getMediaSourceClip>['insets']
};

const GROUP: AnimationItemGroup = 'MEDIA-PEEK';
// * the same for everything: a press held this long turns into a peek. Let go before the peek has
// * shown, and it is a click after all
const HOLD_DELAY = 125;
// * the opening, the closing and a switch: the transitions in the stylesheet
const TRANSITION_DURATION = 200;
// * the room a photo or video leaves around itself
const MEDIA_MARGIN = 48;
const DEFAULT_SELECTOR = '.media-sticker-wrapper, .media-gif-wrapper';

// * one press at a time, and none until the last peek has finished closing
let isBusy = false;

function getMediaPeekKind(media: MediaPeekSource['media']): MediaPeekKind {
  if(media?._ === 'photo') {
    return 'photo';
  }

  switch(media?.type) {
    case 'sticker':
    case 'gif':
    case 'video':
      return media.type;
  }
}

export async function getMediaPeekDocSource(element: HTMLElement): Promise<MediaPeekSource> {
  const docId = element.dataset.docId;
  if(!docId) {
    return;
  }

  const doc = await rootScope.managers.appDocsManager.getDoc(docId);
  return doc && {media: doc, emoji: element.dataset.stickerEmoji};
}

/**
 * What a message shows in its media slot, if a peek can show it: not a self-destructing one, not one
 * still being sent, not a paid one not yet bought. `index` picks an item of a paid album
 */
export function getMessageMediaPeekSource(message: Message, index?: number): MediaPeekSource {
  if(message?._ !== 'message' || message.pFlags.is_outgoing || !canSeeMessageMedia(message)) {
    return;
  }

  // * only bought items have a media of their own: the rest are previews, made up from a stripped
  // * thumbnail by getMediaFromMessage
  const extendedMedia = (message.media as MessageMedia.messageMediaPaidMedia).extended_media;
  if(extendedMedia && toArray(extendedMedia)[index ?? 0]?._ !== 'messageExtendedMedia') {
    return;
  }

  const media = getMediaFromMessage(message, true, index);
  return getMediaPeekKind(media) ? {media} : undefined;
}

function getEntryLayout(kind: MediaPeekKind, media: MediaPeekSource['media'], rect: DOMRect, isOut: boolean) {
  const {width: windowWidth, height: windowHeight} = windowSize;
  if(kind === 'photo' || kind === 'video') {
    const dimensions = getMediaDimensions(media) || makeMediaSize(rect.width, rect.height);
    // * never smaller than what it is opened on, never bigger than the window
    const scale = Math.max(1, rect.width / dimensions.width, rect.height / dimensions.height);
    const size = makeMediaSize(dimensions.width * scale, dimensions.height * scale)
    .aspectFitted(makeMediaSize(windowWidth - MEDIA_MARGIN * 2, windowHeight - MEDIA_MARGIN * 2));
    return {box: size, size, shift: 0};
  }

  const hasEffect = kind === 'sticker' && !!getStickerEffectThumb(media as MyDocument);
  const side = hasEffect ? 280 : (kind === 'gif' ? Math.min(480, windowHeight - 200) : 360);
  const box = makeMediaSize(side, side);
  const dimensions = rect.width !== rect.height && getMediaDimensions(media);
  return {
    box,
    size: dimensions ? dimensions.aspectFitted(box) : box,
    // * the effect spreads behind the sticker, towards the middle of the chat
    shift: hasEffect ? (side * STICKER_EFFECT_MULTIPLIER - side) / 3 * (isOut ? 1 : -1) : 0
  };
}

function getMediaDimensions(media: MediaPeekSource['media']) {
  const {w: width, h: height} = media._ === 'photo' ?
    choosePhotoSize(media, Infinity, Infinity) as PhotoSize.photoSize :
    media;
  return width && height ? makeMediaSize(width, height) : undefined;
}

// * where the item has to be, and how much of it shows, to sit exactly over what it is opened on, as
// * the media viewer's mover does: cut where its scrolling area cuts it, with the corners it is drawn
// * with. Closing onto one scrolled out of view, or cut on both sides, it has nowhere to go
function getEntryOrigin(
  entry: Pick<Entry, 'originElement' | 'size' | 'clip'>,
  {rect = entry.originElement.getBoundingClientRect(), closing}: {rect?: DOMRect, closing?: boolean} = {}
): EntryOrigin {
  const {originElement, size} = entry;
  const {overflowElement, insets: edges, canCloseInto} = getMediaSourceClip(originElement, rect);
  if(closing && overflowElement && !canCloseInto) {
    return;
  }

  const x = rect.left + rect.width / 2 - windowSize.width / 2;
  const y = rect.top + rect.height / 2 - windowSize.height / 2;
  if(!entry.clip) {
    return {x, y, scale: Math.min(rect.width / size.width, rect.height / size.height), edges};
  }

  // * a cropped thumbnail grows into the whole picture
  const scale = Math.max(rect.width / size.width, rect.height / size.height);
  return {
    x,
    y,
    scale,
    crop: {
      x: Math.max(0, (size.width - rect.width / scale) / 2),
      y: Math.max(0, (size.height - rect.height / scale) / 2),
      radii: getEffectiveCornerRadii(originElement, rect, overflowElement).map((radius) => radius / scale)
    },
    edges
  };
}

// * the origin, for the stylesheet: what is left out stays where it is when shown
function getOriginStyle(origin: EntryOrigin): JSX.CSSProperties {
  if(!origin) {
    return {};
  }

  const {crop, edges} = origin;
  const [tl, tr, br, bl] = crop?.radii || [];
  return {
    '--origin-x': origin.x + 'px',
    '--origin-y': origin.y + 'px',
    '--origin-scale': '' + origin.scale,
    ...(crop && {
      '--crop-x': crop.x + 'px',
      '--crop-y': crop.y + 'px',
      '--radius-tl': tl + 'px',
      '--radius-tr': tr + 'px',
      '--radius-br': br + 'px',
      '--radius-bl': bl + 'px'
    }),
    ...(edges && {
      '--edge-top': edges.top + 'px',
      '--edge-right': edges.right + 'px',
      '--edge-bottom': edges.bottom + 'px',
      '--edge-left': edges.left + 'px'
    })
  };
}

// * the picture the element is drawing, as the media viewer takes it - if there is one drawn yet
function snapshotOrigin(originElement: HTMLElement, rect: DOMRect) {
  const snapshot = snapshotRenderedMedia(originElement, {width: rect.width, height: rect.height});
  // * a copy: one that could not be made hands back the canvas the element itself draws on
  if(snapshot instanceof HTMLCanvasElement && !snapshot.isConnected) {
    return snapshot;
  }

  // * an image the snapshot could not copy because its URL is gone has nothing to copy from either
  if(snapshot instanceof HTMLImageElement && snapshot.complete && snapshot.naturalWidth && !shouldSnapshotImage(snapshot)) {
    const image = copyRenderedImage(snapshot);
    image.classList.add('media-photo');
    return image;
  }
}

function createEntry(element: HTMLElement, source: MediaPeekSource, kind: MediaPeekKind, state: EntryState): Entry {
  const originElement = element.querySelector<HTMLElement>('.media-container-aspecter') || element;
  const rect = originElement.getBoundingClientRect();
  const isOut = findUpClassName(element, 'bubble')?.classList.contains('is-out') ?? true;
  const layout = getEntryLayout(kind, source.media, rect, isOut);
  const clip = kind !== 'sticker';
  const [origin, setOrigin] = createSignal(getEntryOrigin({originElement, size: layout.size, clip}, {rect}));
  const [entryState, setState] = createSignal(state);
  return {
    kind,
    source,
    element,
    originElement,
    snapshot: kind !== 'sticker' ? snapshotOrigin(originElement, rect) : undefined,
    isOut,
    ...layout,
    clip,
    origin,
    setOrigin,
    state: entryState,
    setState,
    middlewareHelper: getMiddleware(),
    rendered: deferredPromise()
  };
}

function MediaPeekItem(props: {
  entry: Entry,
  getTextColor?: () => string
}) {
  const {entry} = props;
  const emoji = entry.kind === 'sticker' && (entry.source.emoji || (entry.source.media as MyDocument).stickerEmojiRaw);
  let media: HTMLDivElement;

  onMount(() => {
    bindPromiseToDeferred(renderMediaPeek({
      kind: entry.kind,
      media: entry.source.media,
      emoji,
      container: media,
      element: entry.element,
      snapshot: entry.snapshot,
      size: entry.size,
      isOut: entry.isOut,
      group: GROUP,
      middleware: entry.middlewareHelper.get(),
      getTextColor: props.getTextColor
    }), entry.rendered);
  });

  onCleanup(() => {
    entry.middlewareHelper.destroy();
  });

  return (
    <div
      class={styles.MediaPeekFrame}
      classList={{[styles.inPlace]: !entry.origin()}}
      style={{...getOriginStyle(entry.origin()), '--shift': entry.shift + 'px'}}
    >
      <div class={styles.MediaPeekMover}>
        <div
          class={styles.MediaPeekItem}
          classList={{
            [styles.entering]: entry.state() === 'entering',
            [styles.leaving]: entry.state() === 'leaving',
            [styles.switching]: entry.state() === 'switching'
          }}
          style={{
            'width': entry.box.width + 'px',
            'height': entry.box.height + 'px'
          }}
        >
          {/* the wrappers add classes of their own to this one: `class` stays a constant */}
          <div
            ref={media}
            class={styles.MediaPeekMedia}
            classList={{
              [styles.clip]: entry.clip,
              [styles.gif]: entry.kind === 'gif'
            }}
            style={{
              'width': entry.size.width + 'px',
              'height': entry.size.height + 'px'
            }}
          />
          <Show when={emoji}>
            <div class={classNames(styles.MediaPeekEmoji, entry.shift && styles.withEffect)}>
              {wrapEmojiText(emoji)}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

function MediaPeek(props: {
  class?: string,
  visible: boolean,
  // * put away after it was shown
  closing: boolean,
  entries: Entry[],
  getTextColor?: () => string
}) {
  return (
    <div
      class={classNames(styles.MediaPeek, props.class)}
      classList={{[styles.visible]: props.visible, [styles.closing]: props.closing}}
      aria-hidden="true"
    >
      <For each={props.entries}>
        {(entry) => <MediaPeekItem entry={entry} getTextColor={props.getTextColor} />}
      </For>
    </div>
  );
}

function createMediaPeek(options: Pick<MediaPeekOptions, 'class' | 'getTextColor'>) {
  return createRoot((dispose) => {
    const [entries, setEntries] = createSignal<Entry[]>([]);
    const [visible, setVisible] = createSignal(false);
    const [closing, setClosing] = createSignal(false);

    <Portal mount={getOverlayRoot()}>
      <MediaPeek
        class={options.class}
        visible={visible()}
        closing={closing()}
        entries={entries()}
        getTextColor={options.getTextColor}
      />
    </Portal>;

    return {
      add: (entry: Entry) => setEntries((entries) => [...entries, entry]),
      remove: (entry: Entry) => setEntries((entries) => entries.filter((_entry) => _entry !== entry)),
      show: () => setVisible(true),
      close: () => {
        setClosing(true);
        setVisible(false);
      },
      dispose
    };
  });
}

function startMediaPeek(element: HTMLElement, options: MediaPeekOptions & Required<Pick<MediaPeekOptions, 'findTarget' | 'getSource'>>) {
  // The whole hold-drag-release gesture is tracked on document-level mousemove/mouseup + a post-
  // release click-swallow, and timed by setTimeout/setInterval — all of which must use whichever
  // window the app currently lives in (the tab, or the Document PiP window). Bound to the MAIN
  // window, the peek opens on hold but its mouseup/mousemove fire on the PiP document and never
  // arrive, so it sticks open and can't switch.
  const activeWindow = getAppWindow();
  const activeDocument = activeWindow.document;
  // * alive while the button is held
  const gestureHelper = getMiddleware();
  const gesture = gestureHelper.get();
  const listenerSetter = new ListenerSetter();
  // * the pre-open guard comes off on its own once the peek has shown
  const preListenerSetter = new ListenerSetter();
  let switchHelper: MiddlewareHelper;
  let target = element;
  let peek: ReturnType<typeof createMediaPeek>;
  let shown: Entry;
  let lockedGroups = false;
  const previousGroup = animationIntersector.getOnlyOnePlayableGroup();
  // * gives back the music a video with sound has paused
  let releaseSingleMedia: ReturnType<typeof appMediaPlaybackController['setSingleMedia']>;
  isBusy = true;

  const resolve = async(element: HTMLElement, middleware: Middleware) => {
    let source: MediaPeekSource;
    try {
      source = await options.getSource(element);
    } catch(err) {}

    const kind = source && getMediaPeekKind(source.media);
    return middleware() && kind ? {source, kind} : undefined;
  };

  // * whether there is something to show; an entry that failed to draw shows nothing
  const waitRendered = (entry: Entry) => entry.rendered.then((playback) => {
    entry.playback = playback;
    return true;
  }, (err) => {
    console.error('media peek error', err);
    return false;
  });

  const startPlaying = (entry: Entry) => {
    if(!gesture() || shown !== entry) {
      return;
    }

    // * a video plays with sound, as loud as the app plays everything, and the music waits for it
    const withSound = !!entry.playback.mute && !appMediaPlaybackController.muted;
    if(withSound) {
      releaseSingleMedia ??= appMediaPlaybackController.setSingleMedia();
    }

    entry.playback.play(withSound);
  };

  const open = async() => {
    const resolved = await resolve(target, gesture);
    if(!resolved) {
      return;
    }

    activeDocument.body.classList.add('no-select');
    cancelSelection();

    peek = createMediaPeek(options);
    const entry = createEntry(target, resolved.source, resolved.kind, 'shown');
    peek.add(entry);

    if(!await waitRendered(entry) || !gesture()) return;

    // * a move that left the element while the peek was getting ready made the press a drag: that is
    // * up to here, as the browser hands a move over only with the next frame and the hold timer can
    // * beat it to the main thread
    preListenerSetter.removeAll();
    shown = entry;
    lockedGroups = true;
    animationIntersector.setOnlyOnePlayableGroup(GROUP);
    animationIntersector.checkAnimations2(true);
    // * measured again: what it is opened on may have moved while the media got ready - the chat
    // * scrolled, a preview above it loaded
    if(entry.originElement.isConnected) {
      entry.setOrigin(getEntryOrigin(entry));
    }

    peek.show();
    activeWindow.setTimeout(() => startPlaying(entry), TRANSITION_DURATION);
    listenerSetter.add(activeDocument)('mousemove', onMouseMove);
  };

  const switchTo = async(element: HTMLElement) => {
    switchHelper?.destroy();
    // * back on the one that is shown: whatever was on its way in is not needed
    if(element === shown.element) {
      return;
    }

    switchHelper = gesture.create();
    const middleware = switchHelper.get();
    const resolved = await resolve(element, middleware);
    if(!resolved) {
      return;
    }

    const entry = createEntry(element, resolved.source, resolved.kind, 'entering');
    peek.add(entry);
    // * dragged on before it got to show: it never will
    middleware.onClean(() => entry.state() === 'entering' && peek.remove(entry));

    if(!await waitRendered(entry) || !middleware()) return;

    const previous = shown;
    shown = entry;
    previous.setState('leaving');
    previous.playback.mute?.();
    entry.setState('switching');
    activeWindow.setTimeout(() => {
      peek.remove(previous);
      if(entry.state() === 'switching') {
        entry.setState('shown');
      }

      startPlaying(entry);
    }, TRANSITION_DURATION);
  };

  const onMouseMove = (e: MouseEvent) => {
    const element = options.findTarget(e.target as HTMLElement);
    if(!element || element === target || !options.listenTo.contains(element)) {
      return;
    }

    target = element;
    switchTo(element);
  };

  // * leaving the element before the peek shows means the press is something else: a drag, a selection
  const onPreMove = (e: MouseEvent) => {
    if(!target.contains(e.target as Node)) {
      onRelease();
    }
  };

  // * an image the browser lets drag (Firefox) would take the pointer away from the peek for good
  const onDragStart = (e: DragEvent) => {
    if(peek) {
      cancelEvent(e);
    } else {
      onRelease();
    }
  };

  const onRelease = () => {
    if(!gesture()) {
      return;
    }

    gestureHelper.destroy();
    activeWindow.clearTimeout(timeout);
    activeWindow.clearInterval(detachedInterval);
    preListenerSetter.removeAll();
    listenerSetter.removeAll();
    activeDocument.body.classList.remove('no-select');

    // * let go before the peek showed anything: the press was a click after all
    if(!shown) {
      peek?.dispose();
      isBusy = false;
      return;
    }

    // * the release ends the peek; whatever the press started on is not clicked
    swallowNextClick(activeWindow);

    // * fly back to where it is now, not to where it was when it opened
    shown.setOrigin(shown.originElement.isConnected ? getEntryOrigin(shown, {closing: true}) : undefined);

    // * the sound stops with the release, not after the peek has flown back
    shown.playback.mute?.();
    releaseSingleMedia?.();

    peek.close();
    activeWindow.setTimeout(() => {
      peek.dispose();
      if(lockedGroups) {
        animationIntersector.setOnlyOnePlayableGroup(previousGroup);
        animationIntersector.checkAnimations2(false);
      }

      isBusy = false;
    }, TRANSITION_DURATION);
  };

  const timeout = activeWindow.setTimeout(open, HOLD_DELAY);
  // * the message got deleted, the chat got closed
  const detachedInterval = activeWindow.setInterval(() => {
    if(!target.isConnected) {
      onRelease();
    }
  }, 100);

  preListenerSetter.add(activeDocument)('mousemove', onPreMove);
  listenerSetter.add(activeDocument)('mouseup', onRelease, {capture: true});
  listenerSetter.add(activeDocument)('dragstart', onDragStart, {capture: true});
  listenerSetter.add(activeWindow)('blur', onRelease);
}

export default function attachMediaPeekListeners(options: MediaPeekOptions) {
  if(IS_TOUCH_SUPPORTED) {
    return;
  }

  const findTarget = options.findTarget ?? ((target: HTMLElement) => target.closest<HTMLElement>(DEFAULT_SELECTOR));
  const getSource = options.getSource ?? getMediaPeekDocSource;
  options.listenerSetter.add(options.listenTo)('mousedown', (e) => {
    if(isBusy || e.buttons > 1 || e.button !== 0) return;
    const element = findTarget(e.target as HTMLElement);
    if(element) {
      startMediaPeek(element, {...options, findTarget, getSource});
    }
  });
}
