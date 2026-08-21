import type {MyDocument} from '@appManagers/appDocsManager';
import ProgressivePreloader from '@components/preloader';
import appMediaPlaybackController, {MediaItem, MediaListLoaderFactory, MediaSearchContext} from '@components/appMediaPlaybackController';
import {DocumentAttribute, Message} from '@layer';
import mediaSizes from '@helpers/mediaSizes';
import {IS_SAFARI} from '@environment/userAgent';
import rootScope from '@lib/rootScope';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import LazyLoadQueue from '@components/lazyLoadQueue';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import ListenerSetter, {Listener} from '@helpers/listenerSetter';
import noop from '@helpers/noop';
import findUpClassName from '@helpers/dom/findUpClassName';
import {joinElementsWith} from '@lib/langPack';
import {MiddleEllipsisElement} from '@components/middleEllipsis';
import {formatFullSentTime} from '@helpers/date';
import throttleWithRaf from '@helpers/schedulers/throttleWithRaf';
import {NULL_PEER_ID} from '@appManagers/constants';
import formatBytes from '@helpers/formatBytes';
import {animateSingle} from '@helpers/animation';
import clamp from '@helpers/number/clamp';
import toHHMMSS from '@helpers/string/toHHMMSS';
import MediaProgressLine from '@components/mediaProgressLine';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapSenderToPeer from '@components/wrappers/senderToPeer';
import wrapSentTime from '@components/wrappers/sentTime';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import appDownloadManager from '@lib/appDownloadManager';
import wrapPhoto from '@components/wrappers/photo';
import safePlay from '@helpers/dom/safePlay';
import Row from '@components/rowTsx';
import createAudioTranscription from '@components/audioTranscription';
import {createPlayPauseIcon} from '@components/audioAnimatedIcon';
import {children, createRoot, JSX, Show} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import makeError from '@helpers/makeError';
import {Middleware} from '@helpers/middleware';


const UNMOUNT_PRELOADER = true;
const SUBTITLE_SEPARATOR = ' • ';

rootScope.addEventListener('messages_media_read', ({mids, peerId}) => {
  mids.forEach((mid) => {
    const attr = `[data-mid="${mid}"][data-peer-id="${peerId}"]`;
    (Array.from(document.querySelectorAll(`.audio.is-unread${attr}, .media-round.is-unread${attr}`)) as HTMLElement[]).forEach((elem) => {
      // an audio row keeps `is-unread` in its store — stripping the class here would only last until
      // the next reactive update put it back.
      if(isAudioElement(elem)) elem.setUnread(false);
      else elem.classList.remove('is-unread');
    });
  });
});

// https://github.com/LonamiWebs/Telethon/blob/4393ec0b83d511b6a20d8a20334138730f084375/telethon/utils.py#L1285
export function decodeWaveform(waveform: Uint8Array | number[]) {
  if(!(waveform instanceof Uint8Array)) {
    waveform = new Uint8Array(waveform);
  }

  const bitCount = waveform.length * 8;
  const valueCount = bitCount / 5 | 0;
  if(!valueCount) {
    return new Uint8Array([]);
  }

  const result = new Uint8Array(valueCount);
  for(let i = 0; i < valueCount; i++) {
    const byteIndex = i * 5 / 8 | 0;
    const bitShift = i * 5 % 8;
    // read two bytes manually instead of DataView.getUint16, which over-reads by
    // a byte and throws when the last 5-bit value lands in the final byte (e.g.
    // 62-byte / 99-sample waveforms) — that threw away the whole waveform
    const low = waveform[byteIndex];
    const high = byteIndex + 1 < waveform.length ? waveform[byteIndex + 1] : 0;
    result[i] = ((low | (high << 8)) >> bitShift) & 0b00011111;
  }

  return result;
}

function createWaveformBars(waveform: Uint8Array, duration: number) {
  const barWidth = 2;
  const barMargin = 2;
  const barHeightMin = 4;
  const barHeightMax = mediaSizes.isMobile && false ? 16 : 23;

  const minW = mediaSizes.isMobile ? 152 : 190;
  const maxW = mediaSizes.isMobile ? 190 : 256;
  const availW = clamp(duration / 60 * maxW, minW, maxW);

  const normValue = Math.max(...waveform);
  const wfSize = waveform.length;
  const barCount = Math.min((availW / (barWidth + barMargin)) | 0, wfSize);

  let maxValue = 0;
  const maxDelta = barHeightMax - barHeightMin;

  let html = '';
  for(let i = 0, barX = 0, sumI = 0; i < wfSize; ++i) {
    const value = waveform[i] || 0;
    if((sumI + barCount) >= wfSize) { // draw bar
      sumI = sumI + barCount - wfSize;
      if(sumI < (barCount + 1) / 2) {
        if(maxValue < value) maxValue = value;
      }

      const bar_value = Math.max(((maxValue * maxDelta) + ((normValue + 1) / 2)) / (normValue + 1), barHeightMin);

      const h = `<rect class="audio-waveform-bar" x="${barX}" y="${barHeightMax - bar_value}" width="${barWidth}" height="${bar_value}" rx="1" ry="1"></rect>`;
      html += h;

      barX += barWidth + barMargin;

      if(sumI < (barCount + 1) / 2) {
        maxValue = 0;
      } else {
        maxValue = value;
      }
    } else {
      if(maxValue < value) maxValue = value;

      sumI += barCount;
    }
  }

  let container: HTMLElement, svg: SVGSVGElement;

  if(!html) {

  } else {
    container = document.createElement('div');
    container.classList.add('audio-waveform');

    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('audio-waveform-bars');
    svg.setAttributeNS(null, 'width', '' + availW);
    svg.setAttributeNS(null, 'height', '' + barHeightMax);
    svg.setAttributeNS(null, 'viewBox', `0 0 ${availW} ${barHeightMax}`);
    svg.insertAdjacentHTML('beforeend', html);

    container.append(svg);
  }

  return {svg, container, availW};
}

/**
 * Every class the row puts on itself. Solid owns `class` on the root once the row is rendered, so a
 * `classList.add` there would be undone by the next reactive update — these flags are the way in.
 */
type AudioRowState = {
  isVoice: boolean,
  isOut: boolean,
  canTranscribe: boolean,
  isUnread: boolean,
  isOutgoing: boolean,
  withThumb: boolean,
  cornerDownload: boolean,
  downloading: boolean,
  /** Music only: the row swaps its description for the progress line while it plays. */
  showProgress: boolean,
  progressLine: HTMLElement
};

/**
 * What the two type-specific wrappers get to work with. `element` is filled in the moment the row is
 * rendered — the wrappers only ever reach for it from callbacks, which all run later.
 */
type AudioRowContext = {
  options: AudioElementOptions,
  doc: MyDocument,
  timeEl: HTMLElement,
  state: AudioRowState,
  setState: SetStoreFunction<AudioRowState>,
  element: AudioElement,
  listenerSetter: ListenerSetter,
  readyPromise: CancellablePromise<void>,
  addAudioListener: HTMLMediaElement['addEventListener'],
  togglePlay: (e?: Event, paused?: boolean) => void
};

/** What a wrapper hands back: markup Row evaluates itself, plus the playback wiring. */
type WrappedAudio = {
  content: () => JSX.Element,
  onLoad: () => () => void
};

function AudioRow(props: {
  state: AudioRowState,
  content: () => JSX.Element,
  clickable: boolean,
  ref: (toggle: HTMLElement) => void,
  playIconRef: (container: HTMLElement) => void
}) {
  return (
    <Row
      noRipple
      clickable={props.clickable}
      classList={{
        'audio': true,
        'audio-details': true,
        'is-voice': props.state.isVoice,
        'is-out': props.state.isOut,
        'can-transcribe': props.state.canTranscribe,
        'is-unread': props.state.isUnread,
        'is-outgoing': props.state.isOutgoing,
        'audio-with-thumb': props.state.withThumb,
        'corner-download': props.state.cornerDownload,
        'downloading': props.state.downloading,
        'audio-show-progress': props.state.showProgress
      }}
    >
      {/* The play button IS the row's media: same 48x48 slot every other Row puts an avatar in. */}
      <Row.Media size="big" class="audio-toggle" ref={props.ref}>
        <div class="audio-play-icon" ref={props.playIconRef} />
      </Row.Media>
      {/* Row.Title / Row.Subtitle read RowContext, so their JSX has to be evaluated inside Row —
        hence a factory rather than ready-made nodes. */}
      {props.content()}
    </Row>
  );
}

async function wrapVoiceMessage(ctx: AudioRowContext): Promise<WrappedAudio> {
  const {options, doc, setState} = ctx;
  const message = options.message;

  setState('isVoice', true);
  if(message.pFlags.out) {
    setState('isOut', true);
  }

  let waveform = (doc.attributes.find((attribute) => attribute._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio)?.waveform || new Uint8Array([]);
  waveform = decodeWaveform(waveform.slice(0, 63));

  const {svg, container: svgContainer, availW} = createWaveformBars(waveform, doc.duration);

  let fakeSvgContainer: HTMLElement;
  if(svgContainer) {
    fakeSvgContainer = svgContainer.cloneNode(true) as HTMLElement;
    fakeSvgContainer.classList.add('audio-waveform-fake');
    svgContainer.classList.add('audio-waveform-background');
  }

  const waveformContainer = (
    <div class="audio-waveform-container">
      {svgContainer && [svgContainer, fakeSvgContainer]}
    </div>
  ) as HTMLElement;

  let transcribeButton: () => JSX.Element;
  if(options.customAudioToTextButton) {
    // a round video expanded into voice form brings its own button — it transcribes itself
    setState('canTranscribe', true);
    const customButton = options.customAudioToTextButton;
    transcribeButton = () => customButton;
  } else if(options.canTranscribe) {
    setState('canTranscribe', true);
    transcribeButton = createAudioTranscription({
      listenerSetter: ctx.listenerSetter,
      getRow: () => ctx.element
    }).button;
  }

  // Same two lines as the music variant: the waveform reads as the row's title and the clock as its
  // subtitle. The transcribe button hangs off the row itself — it sits outside both.
  const content = () => (
    <>
      <Row.Title class="audio-title">{waveformContainer}</Row.Title>
      <Row.Subtitle class="audio-subtitle">{ctx.timeEl}</Row.Subtitle>
      {transcribeButton?.()}
    </>
  );

  let progress = svg as any as HTMLElement, progressLine: MediaProgressLine;
  if(!progress) {
    progressLine = new MediaProgressLine();

    waveformContainer.append(progressLine.container);
  }

  const onLoad = () => {
    let audio = ctx.element.audio;

    const setAnimation = () => {
      animateSingle(() => {
        if(!audio) return false;
        onTimeUpdate();
        return !audio.paused;
      }, ctx.element);
    };

    const onTimeUpdate = () => {
      if(fakeSvgContainer) {
        fakeSvgContainer.style.width = (audio.currentTime / audio.duration * 100) + '%';
      }
    };

    if(!audio.paused || (audio.currentTime > 0 && audio.currentTime !== audio.duration)) {
      onTimeUpdate();
    }

    const throttledTimeUpdate = throttleWithRaf(onTimeUpdate);
    ctx.addAudioListener('timeupdate', throttledTimeUpdate);
    ctx.addAudioListener('ended', throttledTimeUpdate);
    ctx.addAudioListener('play', setAnimation);

    progress && ctx.readyPromise.then(() => {
      let mousedown = false, mousemove = false;
      progress.addEventListener('mouseleave', (e) => {
        if(mousedown) {
          ctx.togglePlay(undefined, true);
          mousedown = false;
        }
        mousemove = false;
      });
      progress.addEventListener('mousemove', (e) => {
        mousemove = true;
        if(mousedown) scrub(e);
      });
      progress.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if(e.button !== 0) return;
        if(!audio.paused) {
          ctx.togglePlay(undefined, false);
        }

        scrub(e);
        mousedown = true;
      });
      progress.addEventListener('mouseup', (e) => {
        if(mousemove && mousedown) {
          ctx.togglePlay(undefined, true);
          mousedown = false;
        }
      });
      attachClickEvent(progress, (e) => {
        cancelEvent(e);
        if(!audio.paused) scrub(e);
      });

      function scrub(e: MouseEvent | TouchEvent) {
        let offsetX: number;
        if(!('touches' in e)) { // cross-realm-safe mouse check (works in the Document PiP window)
          offsetX = e.offsetX;
        } else { // touch
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          offsetX = e.targetTouches[0].pageX - rect.left;
        }

        let scrubTime = offsetX / availW /* width */ * audio.duration;
        if(audio.duration && scrubTime >= audio.duration) {
          scrubTime = audio.duration - 0.01;
        }
        setCurrentTime(audio, scrubTime);
      }
    }, noop);

    !progress && progressLine.setMedia({
      media: audio,
      streamable: doc.supportsStreaming,
      duration: doc.duration
    });

    return () => {
      progress?.remove();
      progress = null;
      audio = null;
    };
  };

  return {content, onLoad};
}

async function wrapAudio(ctx: AudioRowContext): Promise<WrappedAudio> {
  const {options, doc, setState} = ctx;
  const message = options.message;

  const isVoice = doc.type === 'voice' || doc.type === 'round';
  const descriptionEl = document.createElement('div');
  descriptionEl.classList.add('audio-description');

  const audioAttribute = doc.attributes?.find((attr) => attr._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;

  // the performer rides in the title next to the track name, so the description is what is left
  const performer = !isVoice && audioAttribute?.performer;

  // the duration sits in front of the description, so the description opens with a separator
  if(!isVoice) {
    const parts: (Node | string)[] = [
      options.withTime ? formatFullSentTime(message.date) : formatBytes(doc.size)
    ];

    if(options.showSender) {
      parts.push(await wrapSenderToPeer(message));
    }

    descriptionEl.append(SUBTITLE_SEPARATOR, ...joinElementsWith(parts, SUBTITLE_SEPARATOR));
  }

  const middleEllipsisEl = new MiddleEllipsisElement();
  middleEllipsisEl.dataset.fontWeight = '' + options.fontWeight;
  middleEllipsisEl.dataset.fontSize = '' + options.fontSize;
  middleEllipsisEl.dataset.sizeType = options.sizeType;
  (middleEllipsisEl as any).getSize = options.getSize;
  if(isVoice) {
    middleEllipsisEl.append(await wrapSenderToPeer(message));
  } else {
    setInnerHTML(middleEllipsisEl, wrapEmojiText(audioAttribute?.title ?? doc.file_name));
  }

  const sentTime = options.showSender && wrapSentTime(message);

  const content = () => (
    <>
      <Row.Title class="audio-title" titleRight={sentTime} titleRightSecondary>
        {/* one box for the name and the performer, so the title ellipsises as a whole */}
        <span class="audio-title-text">
          {performer && [<span class="audio-performer text-bold">{wrapEmojiText(performer)}</span>, ' — ']}
          {middleEllipsisEl}
        </span>
      </Row.Title>
      <Row.Subtitle class="audio-subtitle">
        {ctx.timeEl}
        {ctx.state.showProgress ? ctx.state.progressLine : descriptionEl}
      </Row.Subtitle>
    </>
  );

  const onLoad = () => {
    const progressLine = new MediaProgressLine();
    progressLine.setMedia({
      media: ctx.element.audio,
      streamable: doc.supportsStreaming,
      duration: doc.duration
    });

    setState('progressLine', progressLine.container);

    ctx.addAudioListener('ended', () => setState('showProgress', false));
    ctx.addAudioListener('play', () => setState('showProgress', true));

    const audio = ctx.element.audio;
    if(!audio.paused || audio.currentTime > 0) {
      setState('showProgress', true);
    }

    return () => {
      progressLine.removeListeners();
      setState({showProgress: false, progressLine: undefined});
    };
  };

  return {content, onLoad};
}

function constructDownloadPreloader(tryAgainOnFail = true) {
  const preloader = new ProgressivePreloader({cancelable: true, tryAgainOnFail});
  preloader.construct();

  if(!tryAgainOnFail) {
    preloader.circle.setAttributeNS(null, 'r', '23');
    preloader.totalLength = 143.58203125;
  }

  return preloader;
}

export const findMediaTargets = (anchor: HTMLElement, anchorMid: number/* , useSearch: boolean */) => {
  let prev: MediaItem[], next: MediaItem[];
  // if(anchor.classList.contains('search-super-item') || !useSearch) {
  const isBubbles = !anchor.classList.contains('search-super-item');
  const container = findUpClassName(anchor, !isBubbles ? 'tabs-tab' : 'bubbles-inner');
  if(container) {
    const attr = `:not([data-is-outgoing="1"])`;
    const justAudioSelector = `.audio:not(.is-voice)${attr}`;
    let selectors: string[];
    if(!anchor.matches(justAudioSelector)) {
      selectors = [`.audio.is-voice${attr}`, `.media-round${attr}`];
    } else {
      selectors = [justAudioSelector];
    }

    if(isBubbles) {
      const prefix = '.bubble:not(.webpage) ';
      selectors = selectors.map((s) => prefix + s);
    }

    const selector = selectors.join(', ');

    let elements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    elements = elements.filter((element) => element === anchor || element.matches(':not([data-to-be-skipped="1"])'));
    const idx = elements.indexOf(anchor);

    const mediaItems: MediaItem[] = elements.map((element) => ({peerId: element.dataset.peerId.toPeerId(), mid: +element.dataset.mid}));

    prev = mediaItems.slice(0, idx);
    next = mediaItems.slice(idx + 1);
  }
  // }

  if((next.length && next[0].mid < anchorMid) || (prev.length && prev[prev.length - 1].mid > anchorMid)) {
    [prev, next] = [next.reverse(), prev.reverse()];
  }

  // prev = next = undefined;

  return [prev, next];
};

export type AudioElementOptions = {
  message: Message.message,
  middleware: Middleware,
  /**
   * Optional pre-extracted document. When set, it overrides extraction from `message.media`.
   * Useful when the audio document lives in a sibling field of the message (e.g. poll
   * `solution_media`).
   */
  doc?: MyDocument,
  /**
   * Optional storage-key disambiguator. See `AddMediaArgs.slot`. Required when two rows share the
   * same `(peerId, mid)` but render different documents (e.g. poll description + explanation).
   */
  mediaSlot?: number,
  withTime?: boolean,
  voiceAsMusic?: boolean,
  searchContext?: MediaSearchContext,
  showSender?: boolean,
  noAutoDownload?: boolean,
  /**
   * Keeps the duration out of the subtitle until the row plays. The profile playlist reads as
   * `Artist — Title` over the file size alone, with the clock only while it runs.
   */
  /**
   * Gives the row the hover a Row normally gets from being clickable. Off inside a bubble, where the
   * row is a piece of the message rather than something to point at.
   */
  clickable?: boolean,
  lazyLoadQueue?: LazyLoadQueue,
  loadPromises?: Promise<any>[],
  /** Whether the row offers to transcribe itself. Voice messages only. */
  canTranscribe?: boolean,
  uploadingFileName?: string,
  shouldWrapAsVoice?: boolean,
  customAudioToTextButton?: HTMLElement,
  listLoaderFactory?: MediaListLoaderFactory,
  /** An already-playing media element to bind to instead of adding a new one. */
  globalMedia?: HTMLMediaElement,
  isOut?: boolean,
  fontWeight?: number,
  fontSize?: number,
  sizeType?: string,
  getSize?: () => number
};

/**
 * An audio/voice row. It is a plain `div.audio` carrying its own API rather than a custom element:
 * the DOM node IS the handle, which is what every caller (bubbles, selection, round videos) already
 * relies on.
 */
export interface AudioElement extends HTMLDivElement {
  message: Message.message;
  audio: HTMLMediaElement;
  listLoaderFactory: MediaListLoaderFactory;

  /** Swaps the temporary outgoing message for the sent one and starts the playback wiring. */
  replaceMessage(message: Message.message): void;
  setUnread(unread: boolean): void;
  togglePlay(e?: Event, paused?: boolean): void;
  playWithTimestamp(timestamp: number): void;
}

/**
 * A row that holds back its playback wiring until its outgoing message is actually sent — the audio
 * row and the round-video bubble (`wrappers/video.ts`) both play by this contract.
 */
export interface DeferredMediaElement extends HTMLElement {
  onLoad: (autoload?: boolean) => void;
}

export function isAudioElement(element: unknown): element is AudioElement {
  return element instanceof HTMLElement && element.classList.contains('audio');
}

export default async function createAudioElement(options: AudioElementOptions): Promise<AudioElement> {
  const {middleware} = options;
  const doc = options.doc ?? (getMediaFromMessage(options.message) as MyDocument);
  const isRealVoice = doc.type === 'voice';
  const isVoice = !options.voiceAsMusic && isRealVoice;
  const isOutgoing = options.message.pFlags.is_outgoing;
  const uploadingFileName = options.uploadingFileName ?? options.message?.uploadingFileName?.[0];

  let listenerSetter = new ListenerSetter();
  let onTypeDisconnect: () => void;
  let dispose: () => void;
  let load: (shouldPlay: boolean, controlledAutoplay?: boolean) => void;
  let onLoad: (autoload?: boolean) => void;

  const [state, setState] = createStore<AudioRowState>({
    isVoice: false,
    isOut: !!options.isOut,
    canTranscribe: false,
    isUnread: !!(doc.type !== 'audio' && options.message && options.message.pFlags.media_unread),
    isOutgoing: !!uploadingFileName,
    withThumb: false,
    cornerDownload: false,
    downloading: false,
    showProgress: false,
    progressLine: undefined
  });

  const getDurationStr = () => {
    const audio = ctx.element?.audio;
    const duration = audio && audio.readyState >= audio.HAVE_CURRENT_DATA ? audio.duration : doc.duration;
    return toHHMMSS(duration | 0);
  };

  let toggle: HTMLElement;
  let playIconContainer: HTMLElement;

  const downloadDiv = (<div class="audio-download" />) as HTMLElement;
  // The clock writes into a text node of its own so the unread dot beside it survives every update.
  const timeText = document.createTextNode('');
  const timeEl = (
    <div class="audio-time">
      {timeText}
      <Show when={state.isVoice && state.isUnread}>
        <span class="audio-unread-dot" />
      </Show>
    </div>
  ) as HTMLElement;

  const ctx: AudioRowContext = {
    options,
    doc,
    timeEl,
    state,
    setState,
    element: undefined,
    listenerSetter,
    readyPromise: undefined,
    addAudioListener: ((...args: any[]) => (listenerSetter.add(ctx.element.audio) as any)(...args)) as any,
    togglePlay: (e, paused) => ctx.element.togglePlay(e, paused)
  };

  const {content, onLoad: onTypeLoad} = await (isVoice || options.shouldWrapAsVoice ? wrapVoiceMessage(ctx) : wrapAudio(ctx));

  const el = createRoot((d) => {
    dispose = d;
    return children(() => (
      <AudioRow
        state={state}
        content={content}
        clickable={!!options.clickable}
        ref={(el) => toggle = el}
        playIconRef={(el) => playIconContainer = el}
      />
    ))() as any as AudioElement;
  });

  ctx.element = el;
  const setPlayIcon = createPlayPauseIcon(() => playIconContainer);

  /**
   * The glyph is a function of the media, not of the click: it morphs on every transition of
   * `paused`, whoever caused it — this button, the topbar plate, another row playing the same
   * track, the playlist advancing, the OS media keys. Reading the media rather than trusting which
   * event fired also survives a `play`/`pause` pair that arrives late or out of order when the
   * button is hit twice quickly. `animate: false` is for the two moments that are a mount rather
   * than a transition — building the row, and resolving its media — where there is no one to
   * perform the morph for.
   */
  const syncPlayState = (animate?: boolean) => {
    const playing = !!el.audio && !el.audio.paused;
    toggle.classList.toggle('playing', playing);
    setPlayIcon(playing, animate);
  };

  el.message = options.message;
  el.audio = options.globalMedia;
  el.listLoaderFactory = options.listLoaderFactory;
  el.dataset.mid = '' + options.message.mid;
  el.dataset.peerId = '' + options.message.peerId;
  if(options.globalMedia) el.dataset.toBeSkipped = '1';

  timeText.textContent = getDurationStr();
  syncPlayState(false);

  const destroy = () => {
    if(onTypeDisconnect) {
      onTypeDisconnect();
      onTypeDisconnect = null;
    }

    if(ctx.readyPromise) {
      ctx.readyPromise.reject();
    }

    if(listenerSetter) {
      listenerSetter.removeAll();
      listenerSetter = null;
    }

    if(dispose) {
      dispose();
      dispose = null;
    }
  };

  middleware.onDestroy(destroy);

  const onDownloadInit = (shouldPlay: boolean) => {
    if(shouldPlay) {
      appMediaPlaybackController.willBePlayed(el.audio); // prepare for loading audio

      if(IS_SAFARI && !el.audio.autoplay) {
        el.audio.autoplay = true;
      }
    }
  };

  onLoad = (autoload: boolean) => {
    onLoad = undefined;

    const audio = el.audio ??= appMediaPlaybackController.addMedia({
      message: el.message,
      autoload,
      doc: options.doc,
      slot: options.mediaSlot,
      middleware
    }) as HTMLMediaElement;

    const readyPromise = ctx.readyPromise = deferredPromise<void>();
    if(audio.readyState >= audio.HAVE_CURRENT_DATA) readyPromise.resolve();
    else {
      ctx.addAudioListener('canplay', () => readyPromise.resolve(), {once: true});
    }

    onTypeDisconnect = onTypeLoad();

    const getTimeStr = () => toHHMMSS(audio.currentTime | 0) + (isVoice ? (' / ' + getDurationStr()) : '');

    // the row can be built while its track is already playing — scrolled back into view, or a list
    // opened mid-playback — so take that state instead of morphing into it
    syncPlayState(false);

    if(!audio.paused || (audio.currentTime > 0 && audio.currentTime !== audio.duration)) {
      timeText.textContent = getTimeStr();
    }

    toggle.addEventListener('click', (e: MouseEvent) => {
      el.togglePlay(e);
    });

    ctx.addAudioListener('ended', () => {
      syncPlayState();
      timeText.textContent = getDurationStr();
    });

    ctx.addAudioListener('timeupdate', () => {
      if((!audio.currentTime && audio.paused) || appMediaPlaybackController.isSafariBuffering(audio)) return;
      timeText.textContent = getTimeStr();
    });

    ctx.addAudioListener('pause', () => syncPlayState());

    // `emptied` is the controller dropping the media out from under the row (track swapped, list
    // cleaned): the row stopped playing without ever being paused
    ctx.addAudioListener('emptied', () => syncPlayState());

    ctx.addAudioListener('play', () => {
      timeText.textContent = getTimeStr();
      syncPlayState();
    });
  };

  el.setUnread = (unread) => setState('isUnread', unread);

  el.replaceMessage = (message) => {
    el.message = message;
    el.dataset.mid = '' + message.mid;
    delete el.dataset.isOutgoing;
    onLoad?.(true);
  };

  el.togglePlay = (e?: Event, paused = el.audio.paused) => {
    e && cancelEvent(e);

    if(paused) {
      setTargetsIfNeeded();
      safePlay(el.audio);
    } else {
      el.audio.pause();
    }
  };

  el.playWithTimestamp = (timestamp: number) => {
    load?.(true);
    setCurrentTime(el.audio, timestamp);
    el.togglePlay(undefined, true);
  };

  const setTargetsIfNeeded = () => {
    const hadSearchContext = !!options.searchContext;
    const searchContextChanged = appMediaPlaybackController.setSearchContext(options.searchContext || {
      peerId: NULL_PEER_ID,
      inputFilter: {_: 'inputMessagesFilterEmpty'},
      useSearch: false
    });
    const loaderFactoryChanged = el.listLoaderFactory && appMediaPlaybackController.getListLoaderFactory() !== el.listLoaderFactory;
    if(searchContextChanged || loaderFactoryChanged) {
      const thisTarget = el.dataset.toBeSkipped ? el.audio.parentElement : el;
      const [prev, next] = !hadSearchContext ? [] : findMediaTargets(thisTarget, el.message.mid/* , options.searchContext.useSearch */);
      appMediaPlaybackController.setTargets({peerId: el.message.peerId, mid: el.message.mid}, prev, next, el.listLoaderFactory);
    }
  };

  if(uploadingFileName) {
    el.append(downloadDiv);
  }

  if(doc.thumbs?.length) {
    const imgs: HTMLElement[] = [];
    const wrapped = await wrapPhoto({
      photo: doc,
      message: null,
      container: toggle,
      boxWidth: 48,
      boxHeight: 48,
      loadPromises: options.loadPromises,
      withoutPreloader: true,
      lazyLoadQueue: options.lazyLoadQueue,
      middleware
    });
    toggle.style.width = toggle.style.height = '';
    if(wrapped.images.thumb) imgs.push(wrapped.images.thumb);
    if(wrapped.images.full) imgs.push(wrapped.images.full);

    setState('withThumb', true);
    imgs.forEach((img) => img.classList.add('audio-thumb'));
  }

  if(!isOutgoing) {
    let preloader: ProgressivePreloader;

    const autoDownload = doc.type !== 'audio'/*  || !options.noAutoDownload */;
    onLoad(autoDownload);

    const r = load = (shouldPlay: boolean, controlledAutoplay?: boolean) => {
      load = undefined;

      if(el.audio.src) {
        return;
      }

      appMediaPlaybackController.resolveWaitingForLoadMedia(el.message.peerId, el.message.mid, el.message.pFlags.is_scheduled, options.mediaSlot);

      onDownloadInit(shouldPlay);

      if(!preloader) {
        if(doc.supportsStreaming) {
          setState('cornerDownload', true);

          let pauseListener: Listener;
          const onPlay = () => {
            const preloader = constructDownloadPreloader(false);
            const deferred = deferredPromise<void>();
            deferred.notifyAll({done: 75, total: 100});
            deferred.catch(() => {
              el.audio.pause();
              appMediaPlaybackController.willBePlayed(undefined);
            });
            deferred.cancel = () => {
              deferred.cancel = noop;
              deferred.reject(makeError('CANCELED'));
            };
            preloader.attach(downloadDiv, false, deferred);

            pauseListener = ctx.addAudioListener('pause', () => {
              deferred.cancel();
            }, {once: true}) as any;

            onDownloadInit(shouldPlay);
          };

          const playListener: any = ctx.addAudioListener('play', onPlay);
          ctx.readyPromise.then(() => {
            listenerSetter.remove(playListener);
            pauseListener && listenerSetter.remove(pauseListener);
          });
        } else {
          preloader = constructDownloadPreloader();

          if(!shouldPlay) {
            ctx.readyPromise = deferredPromise();
          }

          const startDownload = () => {
            onDownloadInit(shouldPlay);

            const download = appDownloadManager.downloadMediaURL({media: doc});

            if(!shouldPlay) {
              download.then(() => {
                ctx.readyPromise.resolve();
              });
            }

            preloader.attach(downloadDiv, false, download);
            return {download};
          };

          preloader.setDownloadFunction(startDownload);
          startDownload();
        }
      }

      // the streaming preloader rides on the toggle, the plain one sits at the end of the row
      if(state.cornerDownload) {
        toggle.append(downloadDiv);
      } else {
        el.append(downloadDiv);
      }

      setState('downloading', true);

      ctx.readyPromise.then(() => {
        if(UNMOUNT_PRELOADER) {
          setState('downloading', false);
          downloadDiv.classList.add('downloaded');
          setTimeout(() => {
            downloadDiv.remove();
          }, 200);
        }

        // release loaded audio
        if(!controlledAutoplay && appMediaPlaybackController.willBePlayedMedia === el.audio) {
          safePlay(el.audio);
          appMediaPlaybackController.willBePlayed(undefined);
        }
      });
    };

    if(!el.audio?.src) {
      if(autoDownload) {
        r(false);
      } else {
        attachClickEvent(toggle, () => {
          r(true);
        }, {once: true, listenerSetter});
      }
    }
  } else if(uploadingFileName) {
    setState('downloading', true);
    const preloader = constructDownloadPreloader(false);
    const promise = appDownloadManager.getUpload(uploadingFileName);
    preloader.attachPromise(promise);
    el.dataset.isOutgoing = '1';
    preloader.attach(downloadDiv, false);
    promise.then(() => {
      setState('downloading', false);
      downloadDiv.classList.add('downloaded');
      setTimeout(() => {
        downloadDiv.remove();
      }, 200);
    });
  }

  return el;
}
