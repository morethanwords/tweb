import callbackify from '@helpers/callbackify';
import formatNumber from '@helpers/number/formatNumber';
import getImageFromStrippedThumb from '@helpers/getImageFromStrippedThumb';
import {AvailableReaction, Document, MessagePeerReaction, PhotoSize, Reaction, ReactionCount} from '@layer';
import {AppManagers} from '@lib/managers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import rootScope from '@lib/rootScope';
import SetTransition from '@components/singleTransition';
import StackedAvatars from '@components/stackedAvatars';
import wrapSticker from '@components/wrappers/sticker';
import wrapStickerAnimation from '@components/wrappers/stickerAnimation';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import {fastRaf} from '@helpers/schedulers';
import {getMiddleware, Middleware} from '@helpers/middleware';
import liteMode from '@helpers/liteMode';
import appImManager from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import CustomEmojiElement from '@lib/customEmoji/element';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import appDownloadManager from '@lib/appDownloadManager';
import BezierEasing from '@vendor/bezierEasing';
import lottieLoader, {LottieAssetName} from '@lib/lottie/lottieLoader';
import Scrollable from '@components/scrollable';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {savedReactionTags} from '@components/chat/reactions';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import {StarsStar} from '@components/popups/stars';
import {Sparkles} from '@components/sparkles';
import {AnimatedCounter} from '@components/animatedCounter';
import getUnsafeRandomInt from '@helpers/number/getUnsafeRandomInt';
import {IS_MOBILE} from '@environment/userAgent';

const CLASS_NAME = 'reaction';
const TAG_NAME = CLASS_NAME + '-element';

export enum ReactionLayoutType {
  Inline = 'inline',
  Block = 'block',
  Tag = 'tag'
};

export const REACTIONS_SIZE: {[key in ReactionLayoutType]: number} = {
  [ReactionLayoutType.Inline]: 14,
  [ReactionLayoutType.Block]: 22,
  [ReactionLayoutType.Tag]: 22
};

export const REACTIONS_DISPLAY_COUNTER_AT: {[key in ReactionLayoutType]?: number} = {
  [ReactionLayoutType.Inline]: 2,
  [ReactionLayoutType.Block]: 4
};

const defaultBezier = (val: number) => val;
type Position = [number, number, number];
type EasingFunction = typeof defaultBezier;
type Layer = {
  ddd: 0 | 1,
  ind: number,
  ty: number,
  nm: string,
  parent: number,
  refId: string,
  sr: number,
  ks: {
    o: Transformation, // opacity
    p: Transformation, // position
    a: Transformation, // anchor
    s: Transformation, // scale
  },
  ao: number,
  w: number,
  h: number,
  ip: number,
  op: number,
  st: number,
  bm: number
};
type Transformation = {
  a: 1,
  k: Keyframe[]
} | {
  a: 0,
  k: Position
};
type Keyframe = {
  i?: KeyframeBezier,
  o?: Keyframe['i'],
  t: number,
  s: Position
};
type KeyframeBezier = {
  x: number | Position,
  y: KeyframeBezier['x']
};

class TransformationComputator {
  transformation: Transformation;
  keyframes: Keyframe[];

  keyframeIndex: number;
  keyframe: Keyframe;
  nextKeyframe: Keyframe;
  beziers: EasingFunction | EasingFunction[];

  constructor(transformation: Transformation) {
    this.transformation = transformation;
    this.keyframes = this.transformation.k as Keyframe[];

    this.keyframeIndex = 0;
    this.nextKeyframe = this.keyframes[this.keyframeIndex];
  }

  private withProgress(point: number) {
    const pointsPlayed = point - this.keyframe.t;
    let pointsProgress = pointsPlayed / (this.nextKeyframe.t - this.keyframe.t);

    const isArrayBeziers = Array.isArray(this.beziers);
    if(!isArrayBeziers) {
      pointsProgress = (this.beziers as EasingFunction)(pointsProgress);
    }

    return this.keyframe.s.map((value: number, index: number) => {
      return value + (this.nextKeyframe.s[index] - value) * (
        isArrayBeziers ? (this.beziers as EasingFunction[])[index](pointsProgress) : pointsProgress
      );
    }) as Position;
  }

  computeAtPoint(point: number) {
    if(!this.nextKeyframe) {
      return;
    }

    if(point >= this.nextKeyframe.t) {
      this.keyframe = this.nextKeyframe;
      this.nextKeyframe = this.keyframes[++this.keyframeIndex];

      if(this.keyframe.o && this.keyframe.i) {
        if(!Array.isArray(this.keyframe.o.x)) {
          // @ts-ignore
          this.beziers = BezierEasing(this.keyframe.o.x, this.keyframe.o.y, this.keyframe.i.x, this.keyframe.i.y);
        } else if(new Set(this.keyframe.o.x).size === 1) {
          // @ts-ignore
          this.beziers = BezierEasing(this.keyframe.o.x[0], this.keyframe.o.y[0], this.keyframe.i.x[0], this.keyframe.i.y[0]);
        } else {
          this.beziers = this.keyframe.o.x.map((_, index) => {
            // @ts-ignore
            return BezierEasing(this.keyframe.o.x[index], this.keyframe.o.y[index], this.keyframe.i.x[index], this.keyframe.i.y[index]);
          });
        }
      } else {
        this.beziers = defaultBezier;
      }

      if(!this.nextKeyframe || point === this.nextKeyframe.t) {
        return this.keyframe.s;
      } else {
        return this.withProgress(point);
      }
    } else if(this.keyframe) {
      return this.withProgress(point);
    } else { // ! test
      return this.nextKeyframe.s;
    }
  }
}

function computeLayerTransformations(layer: Layer) {
  const ks = layer.ks;
  const anchor = ks.a;
  const op = layer.op;
  const layerTransformations: ComputedFrameTransformations[] = new Array(op - 1);
  const opacityComputator = ks.o && new TransformationComputator(ks.o);
  const translationComputator = ks.p && new TransformationComputator(ks.p);
  const scaleComputator = ks.s && new TransformationComputator(ks.s);
  for(let point = 0; point < op; ++point) {
    if(point < layer.ip) {
      continue;
    }

    const prevTransformations = layerTransformations[point - 1] || {};
    const transformations: ComputedFrameTransformations = {};

    const translation = translationComputator.computeAtPoint(point);
    if(translation) {
      transformations.translation = translation;

      if(anchor) {
        transformations.anchor = anchor.k as Position;
        // transformations.anchor = translation.map((value, index) => {
        //   return anchor.k[index] as number + value;
        // }) as Position;
      }
    } else {
      transformations.translation = prevTransformations.translation;
      transformations.anchor = prevTransformations.anchor;
    }

    const scale = scaleComputator.computeAtPoint(point);
    if(scale) {
      transformations.scale = scale;
    } else {
      transformations.scale = prevTransformations.scale;
    }

    const opacity = opacityComputator.computeAtPoint(point);
    if(opacity) {
      transformations.opacity = opacity;
    } else {
      transformations.opacity = prevTransformations.opacity;
    }

    if(translation || scale || opacity) {
      layerTransformations[point] = transformations;
    }
  }

  return layerTransformations;
}

type ComputedFrameTransformations = {
  opacity?: Position,
  translation?: Position,
  anchor?: Position,
  scale?: Position
};

let reactionGenericPromise: ReturnType<typeof loadReactionGeneric>;
function loadReactionGeneric(): Promise<{layersPositions: ComputedFrameTransformations[][], op: number}> {
  if(reactionGenericPromise) {
    return reactionGenericPromise;
  }

  const url = lottieLoader.makeAssetUrl('ReactionGeneric');
  const promise = reactionGenericPromise = lottieLoader.loadAnimationDataFromURL(url, 'json').then((animationData) => {
    const placeholderLayers: Layer[] = animationData.layers.filter((layer: any) => layer.nm.startsWith('placeholder_'))/* .slice(0, 1) */;
    const layersPositions: ComputedFrameTransformations[][] = [];
    for(const layer of placeholderLayers) {
      layersPositions.push(computeLayerTransformations(layer));
    }

    return {layersPositions, op: animationData.op};
  });
  promise.catch(() => {
    if(reactionGenericPromise === promise) {
      reactionGenericPromise = undefined;
    }
  });

  return promise;
}

// * background warm-up downloads are sequential so the big effect files never
// * starve the interactive fetches (the reaction icon thumb, the flight media)
let warmUpChain: Promise<any> = Promise.resolve();
function warmUpDownload(doc: Document.document) {
  const cacheContext = apiManagerProxy.getCacheContext(doc);
  if(cacheContext.downloaded || cacheContext.url) {
    return;
  }

  warmUpChain = warmUpChain.then(() => appDownloadManager.downloadMediaURL({media: doc})).catch(noop);
}

// * warm up the activation effect while the user is aiming at the reaction,
// * so the click fires the native effect instead of the generic fallback
export function warmUpReactionEffect(availableReaction: AvailableReaction) {
  if(!liteMode.isAvailable('effects_reactions')) {
    return;
  }

  const docs = [
    availableReaction.around_animation,
    availableReaction.center_icon
  ].filter(Boolean) as Document.document[];
  docs.forEach(warmUpDownload);
}

const GENERIC_EFFECT_SIZE = 100;
const GENERIC_EFFECT_STICKER_SIZE = 26;
const FLIGHT_SOURCE_SIZE = 100;

// * resolve a document to render the reaction's first frame from. The user
// * clicked an already-rendered emoji, so SOMETHING is cached - but for a native
// * reaction the menu/picker rendered the appear/select animation, not the
// * canonical center_icon, so naively picking center_icon can hit an uncached doc
// * and the flight gets no source in time. Prefer center_icon (cleanest still),
// * but fall back to whichever of the reaction's docs is already cached so the
// * render is instant; a custom emoji's own doc is always the rendered (cached) one
function getReactionStickerDoc(reaction: Reaction, managers: AppManagers) {
  if(reaction._ === 'reactionEmoji') {
    return callbackify(apiManagerProxy.getReaction(reaction.emoticon), (availableReaction) => {
      if(!availableReaction) {
        return;
      }

      const candidates = [
        availableReaction.center_icon,
        availableReaction.static_icon,
        availableReaction.select_animation,
        availableReaction.appear_animation
      ].filter(Boolean) as Document.document[];
      const cached = candidates.find((doc) => {
        const cacheContext = apiManagerProxy.getCacheContext(doc);
        return cacheContext.downloaded || cacheContext.url;
      });
      return cached || candidates[0];
    });
  } else if(reaction._ === 'reactionCustomEmoji') {
    return managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
  }
}

function mediaToCanvas(media: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) {
  let width: number, height: number;
  if(media instanceof HTMLVideoElement) {
    width = media.videoWidth;
    height = media.videoHeight;
  } else if(media instanceof HTMLImageElement) {
    width = media.naturalWidth;
    height = media.naturalHeight;
  } else {
    width = media.width;
    height = media.height;
  }

  if(!width || !height) {
    throw new Error('rendered media has no size');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(media, 0, 0);
  return normalizeReactionSource(canvas);
}

const REACTION_SOURCE_FILL = .9;
const REACTION_SOURCE_ALPHA_THRESHOLD = 8;

function normalizeReactionSource(canvas: HTMLCanvasElement) {
  const {width, height} = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for(let y = 0; y < height; ++y) {
    for(let x = 0; x < width; ++x) {
      if(data[(y * width + x) * 4 + 3] < REACTION_SOURCE_ALPHA_THRESHOLD) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if(right < left || bottom < top) {
    throw new Error('rendered media has no visible pixels');
  }

  const inkWidth = right - left + 1;
  const inkHeight = bottom - top + 1;
  // Keep a small breathing room, but never make an already full-size source
  // smaller. A square output also prevents non-square emoji from stretching
  // when the placeholder fills .reaction-sticker.
  const size = Math.min(
    Math.max(width, height),
    Math.ceil(Math.max(inkWidth, inkHeight) / REACTION_SOURCE_FILL)
  );
  const normalized = document.createElement('canvas');
  normalized.width = normalized.height = size;
  normalized.getContext('2d').drawImage(
    canvas,
    left,
    top,
    inkWidth,
    inkHeight,
    Math.round((size - inkWidth) / 2),
    Math.round((size - inkHeight) / 2),
    inkWidth,
    inkHeight
  );
  return normalized;
}

// * snapshot the clicked element's CURRENT pixels synchronously - an INSTANT
// * flight source so the generic copies fly from frame 0 even before the clean
// * first-frame render is ready (a cold lottie parse can take ~1s, during which
// * the flight would otherwise run to its end empty = "no flying emoji"). The
// * first frame upgrades this as soon as it resolves
function captureClickedSnapshot(container: HTMLElement): HTMLCanvasElement {
  if(!container) {
    return;
  }

  try {
    let snapshot: HTMLCanvasElement;
    const media = container instanceof HTMLImageElement || container instanceof HTMLCanvasElement || container instanceof HTMLVideoElement ?
      container :
      Array.from(
        container.querySelectorAll<HTMLCanvasElement | HTMLImageElement | HTMLVideoElement>('canvas, img.media-sticker, video.media-sticker, img.emoji')
      ).find((media) => !media.closest('.hide'));

    if(media) {
      let width: number, height: number;
      if(media instanceof HTMLVideoElement) {
        width = media.videoWidth;
        height = media.videoHeight;
      } else if(media instanceof HTMLImageElement) {
        width = media.naturalWidth;
        height = media.naturalHeight;
      } else {
        width = media.width;
        height = media.height;
      }

      if(!width || !height) {
        return;
      }

      snapshot = document.createElement('canvas');
      snapshot.width = width;
      snapshot.height = height;
      snapshot.getContext('2d').drawImage(media, 0, 0);
    } else {
      // * a custom emoji is painted on the shared renderer canvas - copy its region
      const customEmoji = container instanceof CustomEmojiElement ?
        container :
        container.querySelector<CustomEmojiElement>('custom-emoji-element');
      const rendererCanvas = customEmoji?.renderer?.canvas;
      if(!rendererCanvas) {
        return;
      }

      const canvasRect = rendererCanvas.getBoundingClientRect();
      const rect = customEmoji.getBoundingClientRect();
      if(!rect.width || !rect.height || !canvasRect.width || !canvasRect.height) {
        return;
      }

      const scaleX = rendererCanvas.width / canvasRect.width;
      const scaleY = rendererCanvas.height / canvasRect.height;
      snapshot = document.createElement('canvas');
      snapshot.width = Math.max(1, Math.round(rect.width * scaleX));
      snapshot.height = Math.max(1, Math.round(rect.height * scaleY));
      snapshot.getContext('2d').drawImage(
        rendererCanvas,
        (rect.left - canvasRect.left) * scaleX,
        (rect.top - canvasRect.top) * scaleY,
        snapshot.width,
        snapshot.height,
        0,
        0,
        snapshot.width,
        snapshot.height
      );
    }

    // * crop the transparent document/menu padding. Both the optimistic
    // * .reaction-sticker placeholder and the generic flight draw the whole
    // * source canvas, so keeping those margins makes the emoji look too small
    return normalizeReactionSource(snapshot);
  } catch{
    return;
  }
}

// * render the reaction's emoji on its own and freeze it at the FIRST frame - a
// * clean, deterministic source for the generic flight copies and the
// * .reaction-sticker placeholder; unlike a live snapshot it never depends on
// * whatever animation frame the clicked element happened to be on. Rendered
// * from the cached FULL document (play:false → frame 0), NOT static:true - the
// * warm-up downloads the full doc (so it's the cached one), while static would
// * fetch a separate thumb PhotoSize nobody warmed; sampling the player canvas
// * is also decode-safe, unlike reading an <img> right after its load event
function renderReactionFirstFrame(reaction: Reaction, managers: AppManagers): Promise<HTMLCanvasElement> {
  const middlewareHelper = getMiddleware();
  return Promise.resolve(getReactionStickerDoc(reaction, managers)).then((doc) => {
    if(!doc) {
      throw new Error('no sticker document for the reaction');
    }

    const div = document.createElement('div');
    return wrapSticker({
      div,
      doc,
      width: FLIGHT_SOURCE_SIZE,
      height: FLIGHT_SOURCE_SIZE,
      play: false,
      loop: false,
      withThumb: false,
      needFadeIn: false,
      group: 'none',
      managers,
      middleware: middlewareHelper.get(),
      noOffscreen: true
    }).then(({render}) => render).then((result) => new Promise<HTMLCanvasElement>((resolve, reject) => {
      const snapshot = (source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => {
        try {
          const canvas = mediaToCanvas(source);
          resolve(canvas);
        } catch(err) {
          reject(err);
        }
      };

      // * a lottie/webm renders into a player canvas (frame 0); a static sticker
      // * resolves to its loaded [img]
      if(result instanceof LottiePlayer) {
        let settled = false;
        const cleanup = () => {
          result.removeEventListener('firstFrame', onFirstFrame);
          result.removeEventListener('error', onError);
          result.removeEventListener('destroy', onDestroy);
        };
        const onFirstFrame = () => {
          if(settled) {
            return;
          }

          settled = true;
          cleanup();
          snapshot(result.canvas[0]);
        };
        const onError = (error: unknown) => {
          if(settled) {
            return;
          }

          settled = true;
          cleanup();
          reject(error);
        };
        const onDestroy = () => onError(result.error || new Error('reaction first-frame player destroyed'));

        if(result.hasFailed) {
          onError(result.error);
        } else if(result.hasRenderedFirstFrame) {
          onFirstFrame();
        } else {
          result.addEventListener('firstFrame', onFirstFrame);
          result.addEventListener('error', onError);
          result.addEventListener('destroy', onDestroy);
          result.loadPromise.catch(onError);
        }
      } else {
        snapshot((Array.isArray(result) ? result[0] : result) as any || div.querySelector('img, canvas'));
      }
    }));
  }).finally(() => middlewareHelper.destroy());
}

// * the user clicks an already rendered emoji. We keep TWO sources: an INSTANT
// * synchronous snapshot of the clicked element (so the flight copies fly from
// * frame 0 right away) and a clean first-frame render that upgrades it once
// * ready (a cold lottie parse can be ~1s - too late for the flight on its own)
type StashedFlightSource = {snapshot: HTMLCanvasElement, firstFrame: Promise<HTMLCanvasElement>};
let stashedFlightSource: StashedFlightSource & {reaction: Reaction, time: number};
export function stashFlightSource(reaction: Reaction, container?: HTMLElement, managers: AppManagers = rootScope.managers) {
  if(
    !liteMode.isAvailable('effects_reactions') ||
    !reaction ||
    reaction._ === 'reactionEmpty' ||
    reaction._ === 'reactionPaid'
  ) {
    return;
  }

  const snapshot = captureClickedSnapshot(container);
  const firstFrame = renderReactionFirstFrame(reaction, managers);
  firstFrame.catch(noop);
  stashedFlightSource = {reaction, snapshot, firstFrame, time: Date.now()};
}

// * peeked, not consumed: both the activation flight and the reaction element
// * placeholder use it; the TTL is what retires it
function peekStashedFlightSource(reaction: Reaction): StashedFlightSource | undefined {
  const stashed = stashedFlightSource;
  if(!stashed) {
    return;
  }

  if((Date.now() - stashed.time) > 5e3) {
    stashedFlightSource = undefined;
    return;
  }

  // * compare only the identity fields - the menu and the message reaction
  // * objects come from different sources and can differ in auxiliary keys
  const [a, b] = [stashed.reaction, reaction];
  const same = a._ === b._ && (
    (a._ === 'reactionEmoji' && a.emoticon === (b as Reaction.reactionEmoji).emoticon) ||
    (a._ === 'reactionCustomEmoji' && '' + a.document_id === '' + (b as Reaction.reactionCustomEmoji).document_id)
  );
  if(!same) {
    return;
  }

  return {snapshot: stashed.snapshot, firstFrame: stashed.firstFrame};
}

// * tab-side cache of the next generic animation to play: keeps the worker
// * round-trip off the critical path of an effect activation
let cachedGenericEffect: Document.document;
function getGenericEffect(managers: AppManagers): MaybePromise<Document.document> {
  const cached = cachedGenericEffect;
  const promise = Promise.resolve(managers.appReactionsManager.getRandomGenericAnimation()).then((doc) => {
    return cachedGenericEffect = doc || cached;
  }, () => cached);

  return cached || promise;
}

type PreparedGenericEffect = {
  doc: Document.document,
  around: LottiePlayer,
  flight: LottiePlayer
};

// * a generic effect prepared in advance: by the time it has to be played its
// * players are already parsed and have their first frame rendered, so the
// * activation starts instantly; once taken, the next one gets prepared
let preparedGenericEffect: PreparedGenericEffect;
let preparingGenericEffect = false;
function prepareGenericEffect(managers: AppManagers = rootScope.managers) {
  if(preparingGenericEffect || preparedGenericEffect || !liteMode.isAvailable('effects_reactions')) {
    return;
  }

  preparingGenericEffect = true;
  Promise.resolve(getGenericEffect(managers)).then(async(doc) => {
    if(!doc) {
      return;
    }

    const [blob] = await Promise.all([
      appDownloadManager.downloadMedia({media: doc}),
      // * marks the cache context so the doc is considered loaded everywhere
      appDownloadManager.downloadMediaURL({media: doc}).then(noop, noop)
    ]);

    const players: LottiePlayer[] = [];
    let cancelled = false;
    const makePlayer = async(width: number, loop: boolean) => {
      const player = await lottieLoader.loadAnimationWorker({
        container: document.createElement('div'),
        animationData: blob,
        autoplay: false,
        loop,
        width,
        height: width,
        name: 'doc' + doc.id,
        skipRatio: 1,
        group: 'none',
        noOffscreen: true
      });
      if(cancelled) {
        player.remove();
        throw new Error('generic reaction effect preparation cancelled');
      }

      players.push(player);
      await lottieLoader.waitForFirstFrame(player);
      if(cancelled || !player.hasRenderedFirstFrame) {
        player.remove();
        throw new Error('generic reaction effect did not render its first frame');
      }

      return player;
    };

    try {
      const [around, flight] = await Promise.all([
        makePlayer(GENERIC_EFFECT_SIZE, false),
        makePlayer(GENERIC_EFFECT_STICKER_SIZE, true)
      ]);
      preparedGenericEffect = {doc, around, flight};
    } catch(err) {
      cancelled = true;
      players.forEach((player) => player.remove());
      throw err;
    }
  }).catch(noop).finally(() => {
    preparingGenericEffect = false;
  });
}

function takePreparedGenericEffect(sizes: {genericEffect: number, genericEffectSize: number}) {
  const prepared = preparedGenericEffect;
  if(!prepared) {
    prepareGenericEffect();
    return;
  }

  if(sizes.genericEffect !== GENERIC_EFFECT_STICKER_SIZE || sizes.genericEffectSize !== GENERIC_EFFECT_SIZE) {
    return;
  }

  preparedGenericEffect = undefined;
  prepareGenericEffect();
  return prepared;
}

export function warmUpGenericEffectAssets(managers: AppManagers = rootScope.managers) {
  if(!liteMode.isAvailable('effects_reactions')) {
    return;
  }

  loadReactionGeneric().catch(noop);
  prepareGenericEffect(managers);
}

rootScope.addEventListener('user_auth', () => {
  setTimeout(() => warmUpGenericEffectAssets(), 5e3);
});

export default class ReactionElement extends HTMLElement {
  private type: ReactionLayoutType;
  private counter: HTMLElement;
  public stickerContainer: HTMLElement;
  private stackedAvatars: StackedAvatars;
  private canRenderAvatars: boolean;
  private _reactionCount: ReactionCount;
  public wrapStickerPromise: Awaited<ReturnType<typeof wrapSticker>>['render'];
  public managers: AppManagers;
  public middleware: Middleware;
  private customEmojiElement: CustomEmojiElement;
  public hasAroundAnimation: Promise<void>;
  public isUnread: boolean;
  private hasTitle: boolean;
  private paidReactionCounter: AnimatedCounter;
  private stickerPlaceholderCleanup: () => void;
  private stickerPlaceholderPending: boolean;

  constructor() {
    super();
    this.classList.add(CLASS_NAME);
    this.managers = rootScope.managers;
  }

  public get reactionCount() {
    return this._reactionCount;
  }

  public set reactionCount(reactionCount: ReactionCount) {
    this._reactionCount = reactionCount;
  }

  public get count() {
    return this.reactionCount.count;
  }

  public init(type: ReactionLayoutType, middleware: Middleware) {
    this.type = type;
    this.classList.add(CLASS_NAME + '-' + type);
    this.classList.toggle(CLASS_NAME + '-like-block', type === ReactionLayoutType.Block || type === ReactionLayoutType.Tag);
    this.middleware = middleware;

    if(type === ReactionLayoutType.Tag) {
      // this.insertAdjacentHTML('beforeend', `
      //   <svg class="reaction-tag-svg" width="43" height="30" viewBox="0 0 43 30" xmlns="http://www.w3.org/2000/svg">
      //     <path class="reaction-tag-svg-path" d="M40.8317 12.0432L34.9967 4.08636C33.1129 1.51761 30.1181 0 26.9326 0H7C3.13401 0 0 3.13401 0 7V23C0 26.866 3.13401 30 7 30H26.9326C30.1181 30 33.1129 28.4824 34.9967 25.9136L40.8317 17.9568C42.1223 16.1969 42.1223 13.8031 40.8317 12.0432Z" />
      //     <circle class="reaction-tag-svg-circle" cx="34" cy="15" r="3" />
      //   </svg>
      // `);
      this.insertAdjacentHTML('beforeend', `
        <div class="reaction-tag-background"></div>
        <svg class="reaction-tag-svg" width="43" height="30" viewBox="0 0 43 30" xmlns="http://www.w3.org/2000/svg">
          <path class="reaction-tag-svg-path" d="M40.8317 12.0432L34.9967 4.08636C33.1129 1.51761 30.1181 0 26.9326 0H7C3.13401 0 0 3.13401 0 7V23C0 26.866 3.13401 30 7 30H26.9326C30.1181 30 33.1129 28.4824 34.9967 25.9136L40.8317 17.9568C42.1223 16.1969 42.1223 13.8031 40.8317 12.0432Z" />
        </svg>
        <div class="reaction-tag-dot"></div>
      `);
    }
  }

  public setCanRenderAvatars(canRenderAvatars: boolean) {
    this.canRenderAvatars = canRenderAvatars;
  }

  public render(doNotRenderSticker?: boolean) {
    const hadStickerContainer = !!this.stickerContainer;
    if(!hadStickerContainer) {
      this.stickerContainer = document.createElement('div');
      this.stickerContainer.classList.add(CLASS_NAME + '-sticker');
      this.append(this.stickerContainer);
    }

    if(!doNotRenderSticker) {
      this.renderStickerPlaceholder();
    }

    if(hadStickerContainer) {
      return this.customEmojiElement;
    }

    const reactionCount = this.reactionCount;
    if(doNotRenderSticker || hadStickerContainer) {
      return;
    }

    const reaction = reactionCount.reaction;
    if(reaction._ === 'reactionEmoji') {
      const availableReaction = apiManagerProxy.getReaction(reaction.emoticon);
      return callbackify(availableReaction, (availableReaction) => {
        if(!availableReaction.center_icon) {
          this.stickerContainer.classList.add('is-static');
        } else {
          this.stickerContainer.classList.add('is-regular');
        }

        if(availableReaction.pFlags.inactive) {
          this.classList.add('is-inactive');
        }

        const doc = availableReaction.center_icon ?? availableReaction.static_icon;
        this.renderDoc(doc);

        // customEmojiElement.static = true;
        // customEmojiElement.docId = doc.id;
        // return customEmojiElement;
      });
    } else if(reaction._ === 'reactionCustomEmoji') {
      this.stickerContainer.classList.add('is-custom');
      // const wrapped = wrapCustomEmoji({
      //   docIds: [reaction.document_id],
      //   customEmojiSize: makeMediaSize(REACTION_BLOCK_SIZE, REACTION_BLOCK_SIZE)
      // });

      // this.stickerContainer.append(wrapped);

      if(!this.customEmojiElement) {
        this.customEmojiElement = CustomEmojiElement.create();
        const wrapPromise = this.wrapStickerPromise = this.customEmojiElement.readyPromise = deferredPromise();
        this.wrapStickerPromise.finally(() => {
          if(this.wrapStickerPromise === wrapPromise) {
            this.wrapStickerPromise = undefined;
          }
        }).catch(noop);
        this.stickerContainer.append(this.customEmojiElement);
        // * the renderer paints outside of the container - the placeholder
        // * has to be retired by the ready signal, not by the observer
        wrapPromise.then(
          () => this.maybeRemoveStickerPlaceholder(),
          noop
        );
      }

      this.customEmojiElement.docId = reaction.document_id;
      return this.customEmojiElement;
    } else if(reaction._ === 'reactionPaid') {
      this.classList.add('is-paid');
      if(!IS_MOBILE) this.append(Sparkles({mode: 'button', isDiv: true}));
      this.stickerContainer.append(StarsStar() as HTMLElement);
    }
  }

  public setPaidReactionCounter(count: number) {
    if(!this.paidReactionCounter) {
      this.paidReactionCounter = new AnimatedCounter({
        reverse: false,
        prefix: '+',
        calculateWidth: true
        // calculateWidth: (text) => {
        //   return getTextWidth(text, `400 24 ${customProperties.getProperty('font-rounded')}`) * 1.5;
        // }
      });
      this.paidReactionCounter.container.classList.add('reaction-paid-counter');
      this.append(this.paidReactionCounter.container);
      this.paidReactionCounter.setCount(count, true);
    } else {
      this.paidReactionCounter.setCount(count);
    }
  }

  public destroyPaidReactionCounter() {
    if(this.paidReactionCounter) {
      const {container} = this.paidReactionCounter;
      this.paidReactionCounter = undefined;
      setTimeout(() => {
        container.remove();
      }, 300);
    }
  }

  private renderDoc(doc: Document.document) {
    const size = REACTIONS_SIZE[this.type];
    const wrapPromise = this.wrapStickerPromise = wrapSticker({
      div: this.stickerContainer,
      doc,
      width: size,
      height: size,
      static: true,
      managers: this.managers,
      middleware: this.middleware,
      needFadeIn: false
    }).then(({render}) => render).finally(() => {
      if(this.wrapStickerPromise === wrapPromise) {
        this.wrapStickerPromise = undefined;
      }
    });
  }

  // * the sticker may take a while to download - show the snapshot of what
  // * the user has clicked in the panel and remove it ONLY when the real
  // * media is actually in place (render promises can settle early, e.g.
  // * when the optimistic element gets replaced by the server echo)
  private renderStickerPlaceholder() {
    const reaction = this.reactionCount?.reaction;
    if(this.stickerPlaceholderCleanup || this.stickerPlaceholderPending || !this.stickerContainer || !reaction) {
      return;
    }

    if(this.hasRealStickerMedia()) {
      return;
    }

    const stash = peekStashedFlightSource(reaction);
    if(!stash) {
      return;
    }

    let placeholder: HTMLCanvasElement;
    const mount = (source: HTMLCanvasElement) => {
      if(!source || !this.middleware() || this.stickerPlaceholderCleanup || !this.stickerContainer || this.hasRealStickerMedia()) {
        return;
      }

      placeholder = document.createElement('canvas');
      placeholder.width = source.width;
      placeholder.height = source.height;
      placeholder.getContext('2d').drawImage(source, 0, 0);
      placeholder.classList.add(CLASS_NAME + '-sticker-placeholder');
      placeholder.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;';
      const prevPosition = this.stickerContainer.style.position;
      this.stickerContainer.style.position = 'relative';
      this.stickerContainer.append(placeholder);

      const observer = new MutationObserver(() => this.maybeRemoveStickerPlaceholder());
      observer.observe(this.stickerContainer, {childList: true, subtree: true});

      const cleanup = () => {
        observer.disconnect();
        placeholder.remove();
        // * restore the inline position we overrode (don't leave .reaction-sticker
        // * permanently position:relative after the placeholder is gone)
        this.stickerContainer.style.position = prevPosition;
        if(this.stickerPlaceholderCleanup === cleanup) {
          this.stickerPlaceholderCleanup = undefined;
        }
      };

      this.stickerPlaceholderCleanup = cleanup;
      this.middleware.onDestroy(cleanup);

      // * a custom emoji paints on the external shared renderer canvas, so the
      // * MutationObserver never fires for it - retire the placeholder when the
      // * icon's own render settles (also covers a late mount)
      this.wrapStickerPromise?.finally(() => this.maybeRemoveStickerPlaceholder()).catch(noop);
    };

    // * INSTANT: mount the clicked-element snapshot so .reaction-sticker fills now
    mount(stash.snapshot);

    // * UPGRADE: swap in the clean first frame (or mount it if there was no
    // * snapshot) once rendered, unless the real media has already arrived
    this.stickerPlaceholderPending = !placeholder;
    stash.firstFrame.then((firstFrame) => {
      this.stickerPlaceholderPending = false;
      if(placeholder?.isConnected && !this.hasRealStickerMedia()) {
        const context = placeholder.getContext('2d');
        context.clearRect(0, 0, placeholder.width, placeholder.height);
        context.drawImage(firstFrame, 0, 0, placeholder.width, placeholder.height);
      } else if(!placeholder) {
        mount(firstFrame);
      }
    }, () => {
      this.stickerPlaceholderPending = false;
    });
  }

  private hasRealStickerMedia() {
    // * the custom emoji is painted on the shared renderer canvas, its
    // * readiness is signalled by the resolved (and cleared) readyPromise
    if(this.customEmojiElement) {
      return !this.wrapStickerPromise;
    }

    return !!Array.from(
      this.stickerContainer.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img.media-sticker, video.media-sticker')
    ).find((media) => !(media instanceof HTMLImageElement) || (media.complete && media.naturalWidth > 0));
  }

  private maybeRemoveStickerPlaceholder() {
    if(!this.stickerPlaceholderCleanup || !this.hasRealStickerMedia()) {
      return;
    }

    this.stickerPlaceholderCleanup();
  }

  public findTitle() {
    let title: string;
    if(this.type === ReactionLayoutType.Tag) {
      const tag = savedReactionTags.find((tag) => reactionsEqual(tag.reaction, this.reactionCount.reaction));
      title = tag?.title;
    }

    return title;
  }

  public renderCounter(force?: boolean, title: string | HTMLElement = this.findTitle()) {
    const displayOn = REACTIONS_DISPLAY_COUNTER_AT[this.type];
    if(displayOn === undefined && !force && !title && !this.hasTitle) return;
    const reactionCount = this.reactionCount;

    // Empty paid (star) reaction button — show just the star, never a "0" count.
    if(reactionCount.reaction._ === 'reactionPaid' && !reactionCount.count) {
      if(this.counter?.parentElement) {
        this.counter.remove();
        this.counter = undefined;
      }
      this.hasTitle = false;
      return;
    }

    let setTitle = false;
    if(force || title || reactionCount.count >= displayOn || (this.type === ReactionLayoutType.Block && !this.canRenderAvatars)) {
      if(!this.counter) {
        this.counter = document.createElement(this.type === ReactionLayoutType.Inline ? 'i' : 'span');
        this.counter.classList.add(CLASS_NAME + '-counter');
      }

      const formatted = formatNumber(reactionCount.count);
      if(title) {
        const span = document.createElement('span');
        span.classList.add(CLASS_NAME + '-counter-title');
        span.append(typeof(title) === 'string' ? wrapEmojiText(title) : title);
        this.counter.replaceChildren(span);
        setTitle = true;
        if(force) {
          this.counter.append(' ', formatted);
        }
      } else if(this.counter.textContent !== formatted) {
        this.counter.textContent = formatted;
      }

      if(!this.counter.parentElement) {
        this.append(this.counter);
      }
    } else if(this.counter?.parentElement) {
      this.counter.remove();
      this.counter = undefined;
    }

    this.hasTitle = setTitle;
  }

  public renderAvatars(recentReactions: MessagePeerReaction[]) {
    if(this.type !== ReactionLayoutType.Block) {
      return;
    }

    if(this.reactionCount.count >= REACTIONS_DISPLAY_COUNTER_AT[this.type] || !this.canRenderAvatars) {
      if(this.stackedAvatars) {
        this.stackedAvatars.container.remove();
        this.stackedAvatars = undefined;
      }

      return;
    }

    if(!this.stackedAvatars) {
      this.stackedAvatars = new StackedAvatars({
        avatarSize: 24,
        middleware: this.middleware
      });

      this.append(this.stackedAvatars.container);
    }

    this.stackedAvatars.render(recentReactions.map((reaction) => getPeerId(reaction.peer_id)));
  }

  public setIsChosen(isChosen = this.reactionCount.chosen_order !== undefined) {
    if(this.type === ReactionLayoutType.Inline) return;
    const wasChosen = this.classList.contains('is-chosen') && !this.classList.contains('backwards');
    if(wasChosen !== isChosen) {
      SetTransition({
        element: this,
        className: 'is-chosen',
        forwards: isChosen,
        duration: this.isConnected ? 300 : 0
      });
    }
  }

  public fireAroundAnimation(waitPromise?: Promise<any>) {
    let add = 0;
    if(this.type === ReactionLayoutType.Inline) {
      add = 14;
    } else if(this.type === ReactionLayoutType.Block || this.type === ReactionLayoutType.Tag) {
      add = 18;
    }

    return ReactionElement?.fireAroundAnimation({
      waitPromise,
      cache: this,
      middleware: this.middleware,
      reaction: this.reactionCount?.reaction,
      stickerContainer: this.stickerContainer,
      managers: this.managers,
      sizes: {
        genericEffect: GENERIC_EFFECT_STICKER_SIZE,
        genericEffectSize: GENERIC_EFFECT_SIZE,
        size: REACTIONS_SIZE[this.type] + add,
        effectSize: 80
      },
      scrollable: appImManager.chat.bubbles.scrollable
    });
  }

  public static fireAroundAnimation(options: {
    waitPromise?: Promise<any>
    cache?: {
      hasAroundAnimation: ReactionElement['hasAroundAnimation'],
      wrapStickerPromise?: ReactionElement['wrapStickerPromise']
    },
    reaction: Reaction,
    managers?: AppManagers,
    middleware: Middleware,
    stickerContainer: HTMLElement,
    sizes: {
      genericEffect: number,
      genericEffectSize: number,
      size: number,
      effectSize: number
    },
    textColor?: string,
    scrollable?: Scrollable
  }) {
    if(options.cache.hasAroundAnimation || !liteMode.isAvailable('effects_reactions')) {
      return;
    }

    options.managers ??= rootScope.managers;

    const reaction = options.reaction;
    if(reaction._ === 'reactionEmpty') return;

    const onAvailableReaction = ({
      availableReaction,
      genericEffect,
      sticker,
      onlyAround,
      assetName,
      staticSticker,
      prepared
    }: {
      availableReaction?: AvailableReaction,
      genericEffect?: Document.document,
      sticker?: Document.document,
      onlyAround?: boolean
      assetName?: LottieAssetName,
      staticSticker?: boolean,
      prepared?: PreparedGenericEffect
    }) => {
      const size = genericEffect ? options.sizes.genericEffect : options.sizes.size;
      const div = genericEffect ? undefined : document.createElement('div');
      div && div.classList.add(CLASS_NAME + '-sticker-activate');

      const genericEffectSize = options.sizes.genericEffectSize;
      // * every generic flight is masked: the copies are drawn from whatever
      // * source is available right now (live media, a stripped thumb, and
      // * finally the real render once it's loaded) - like the official
      // * clients, the effect never waits for the sticker to download
      const isGenericMasked = !!genericEffect;

      const textColor = options.textColor || 'primary-text-color';

      const aroundParams: Parameters<typeof wrapStickerAnimation>[0] = {
        doc: genericEffect || availableReaction?.around_animation,
        size: genericEffect ? genericEffectSize : options.sizes.effectSize,
        target: options.stickerContainer,
        side: 'center',
        skipRatio: 1,
        play: false,
        managers: options.managers,
        middleware: options.middleware,
        scrollable: options.scrollable
      };

      const aroundWrap = assetName ? undefined : wrapStickerAnimation({
        ...aroundParams,
        animation: prepared?.around
      });
      const aroundResult = assetName ? lottieLoader.loadAnimationAsAsset({
        width: options.sizes.effectSize,
        height: options.sizes.effectSize,
        skipRatio: 1,
        autoplay: false,
        middleware: options.middleware,
        container: div,
        noCache: true
      }, assetName) : aroundWrap.stickerPromise;
      const genericResult = genericEffect && wrapStickerAnimation({
        ...aroundParams,
        animation: prepared?.flight,
        size: genericEffectSize,
        stickerSize: size,
        loopEffect: true,
        textColor,
        noOffscreen: true
      });
      // * the very same media is already rendered inside the reaction element -
      // * fly it instead of fetching it again
      const liveMediaCandidate = isGenericMasked ? Array.from(
        options.stickerContainer.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img.media-sticker, video.media-sticker')
      )[0] : undefined;
      const liveMaskedMedia = liveMediaCandidate instanceof HTMLVideoElement ||
        (liveMediaCandidate?.complete && liveMediaCandidate.naturalWidth > 0) ?
        liveMediaCandidate :
        undefined;

      // * the masked generic flight always flies the icon's first frame (a
      // * separate static render) - never a mid-animation frame; the native
      // * effect keeps its animated overlay (rendered here, played explicitly)
      const stickerResult = (!genericEffect || (isGenericMasked && !liveMaskedMedia)) && !onlyAround && wrapSticker({
        div: div || document.createElement('div'),
        doc: sticker || availableReaction.center_icon,
        width: size,
        height: size,
        withThumb: false,
        needUpscale: true,
        play: false,
        skipRatio: 1,
        group: 'none',
        needFadeIn: false,
        managers: options.managers,
        middleware: options.middleware,
        textColor,
        loop: false,
        static: (isGenericMasked || staticSticker) || undefined,
        // This player's consumer grabs contexts[0], re-parents canvas[0] and
        // installs overrideRender after load.
        noOffscreen: true
      }).then(({render}) => render as Promise<LottiePlayer>);

      return Promise.all([
        genericEffect ?
          genericResult.stickerPromise :
          stickerResult,

        aroundResult,

        genericEffect && loadReactionGeneric(),

        options.waitPromise
      ]).then(([iconPlayer, aroundPlayer, reactionGeneric, _]) => {
        if(onlyAround) {
          iconPlayer = aroundPlayer;
        }

        let flightSourcePlayer: LottiePlayer;
        const deferred = deferredPromise<void>();
        const remove = () => {
          deferred.resolve();
          // return;
          // if(!isInDOM(div)) return;
          iconPlayer?.remove();
          flightSourcePlayer?.remove();
          div?.remove();
          options.stickerContainer.classList.remove('has-animation');
        };

        if(!iconPlayer || !aroundPlayer) {
          remove();
          return deferred;
        }

        if(genericEffect) {
          const canvas = iconPlayer.canvas[0];
          canvas.classList.add('hide');
          const context = iconPlayer.contexts[0];
          const dpr = canvas.dpr;
          const newCanvasSize = genericEffectSize * dpr;
          const size = canvas.width;
          genericResult.animationDiv.append(canvas);
          genericResult.animationDiv.style.transform = 'scaleX(-1)';

          // * the effect is not gated on the masked media: it starts right
          // * away with the best source available and upgrades on the fly -
          // * live media > stripped thumb placeholder > nothing, then the
          // * real render replaces the placeholder once it's loaded
          let maskedMedia: HTMLCanvasElement;
          let maskedMediaRank = 0;
          const setMaskedMedia = (
            media: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
            rank: number
          ) => {
            if(!media || rank <= maskedMediaRank) {
              return;
            }

            try {
              maskedMedia = mediaToCanvas(media);
            } catch{
              return;
            }

            maskedMediaRank = rank;
          };

          setMaskedMedia(liveMaskedMedia, 3);
          // * the clicked emoji: an INSTANT snapshot (rank 2) so copies fly from
          // * frame 0, upgraded to the clean first-frame render (rank 3) once ready
          const stash = peekStashedFlightSource(reaction);
          if(stash) {
            stash.snapshot && setMaskedMedia(stash.snapshot, 2);
            stash.firstFrame.then((media) => setMaskedMedia(media, 3), noop);
          }

          if(!liveMaskedMedia && liveMediaCandidate instanceof HTMLImageElement) {
            // * the element's own media is still loading (its fetch started
            // * earlier than ours) - let it join the flight when it's ready
            liveMediaCandidate.addEventListener('load', () => {
              setMaskedMedia(liveMediaCandidate, 2);
            }, {once: true});
          }

          if(!maskedMedia) { // * instant placeholder, zero network
            const strippedThumb = (sticker.thumbs as PhotoSize[])?.find((thumb) => thumb._ === 'photoStrippedSize') as PhotoSize.photoStrippedSize;
            if(strippedThumb?.bytes?.length) {
              const {image, loadPromise} = getImageFromStrippedThumb(sticker, strippedThumb, true);
              loadPromise.then(() => setMaskedMedia(image, 1)).catch(noop);
            }
          }

          if(stickerResult) {
            (stickerResult as any as Promise<any>).then((result) => {
              if(result instanceof LottiePlayer) {
                flightSourcePlayer = result;
                result.onFirstFrame(() => setMaskedMedia(result.canvas[0], 3));
              } else {
                setMaskedMedia(Array.isArray(result) ? result[0] : undefined, 3);
              }
            }).catch(noop);
          }

          iconPlayer.onFirstFrame(() => {
            iconPlayer.setSize(newCanvasSize, newCanvasSize);
            canvas.classList.remove('hide');
          });

          let frameNo = 0;
          const scale = newCanvasSize / 512;

          const {layersPositions, op} = reactionGeneric;

          iconPlayer.overrideRender = (frame) => {
            if(isGenericMasked) {
              // * the flight is one composition with the effect around - its
              // * timeline keeps running even before there is a drawable
              // * source, the copies simply join in whenever it arrives
              if(!maskedMedia) {
                if(++frameNo >= op) {
                  removeOnFrame();
                }

                return;
              }

              frame = maskedMedia as any as HTMLCanvasElement;
            }

            const isImageData = frame instanceof ImageData;
            context.clearRect(0, 0, newCanvasSize, newCanvasSize);

            for(let i = 0; i < layersPositions.length; ++i) {
              const frames = layersPositions[i];
              const transformations = frames[frameNo];
              if(!transformations) {
                continue;
              }

              let savedContext = false, flippedX = false, flippedY = false;
              let scaledWidth = size, scaledHeight = size;
              if(transformations.scale) {
                const [x, y] = transformations.scale;
                scaledWidth *= /* Math.abs */(x) * 4 / 100;
                scaledHeight *= /* Math.abs */(y) * 4 / 100;

                flippedX = x < 0/*  && false */;
                flippedY = y < 0/*  && false */;
              }

              let [x, y] = transformations.translation;
              x = (x + transformations.anchor[0]) * scale - Math.abs(scaledWidth) / 2;
              y = (y + transformations.anchor[1]) * scale - Math.abs(scaledHeight) / 2;

              if(flippedX || flippedY) {
                savedContext = true;
                context.save();
                context.scale(flippedX ? -1 : 1, flippedY ? -1 : 1);

                if(flippedX) x = -x;
                if(flippedY) y = -y;
              }

              if(transformations.opacity) {
                if(!savedContext) {
                  savedContext = true;
                  context.save();
                }

                context.globalAlpha = transformations.opacity[0] / 100;
              }

              if(isImageData) {
                context.putImageData(frame as ImageData, x, y);
              } else {
                context.drawImage(frame as ImageBitmap, x, y, scaledWidth, scaledHeight);
              }

              if(savedContext) {
                context.restore();
              }
            }

            frameNo++;

            if(frameNo >= op) {
              removeOnFrame();
            }
          };
        }

        const removeOnFrame = () => {
          // if(!isInDOM(div)) return;
          fastRaf(remove);
        };

        options.middleware.onDestroy(removeOnFrame);

        !genericEffect && iconPlayer.addEventListener('enterFrame', (frameNo) => {
          if(frameNo === iconPlayer.maxFrame) {
            if(options.cache.wrapStickerPromise) { // wait for fade in animation
              options.cache.wrapStickerPromise.then(() => {
                setTimeout(removeOnFrame, 1e3);
              });
            } else {
              removeOnFrame();
            }
          }
        });

        iconPlayer.onFirstFrame(() => {
          // * has-animation hides the sticker (.media-sticker opacity: 0)
          // * while the activate overlay replaces it - the generic effect has
          // * no overlay, the sticker must stay visible under the flight
          if(div) {
            options.stickerContainer.append(div);
            options.stickerContainer.classList.add('has-animation');
          }

          iconPlayer.play();
          aroundPlayer.play();
        });

        return deferred;
      });
    };

    const onEmoticon = (sticker: Document.document, emoticon: string = sticker.stickerEmojiRaw) => {
      return callbackify(apiManagerProxy.getReaction(emoticon), (availableReaction) => {
        const onlyAround = !!sticker;
        let staticSticker: boolean;
        if(availableReaction) {
          const docs = [
            availableReaction.around_animation,
            !onlyAround && availableReaction.center_icon
          ].filter(Boolean) as Document.document[];
          const isEffectLoaded = docs.every((doc) => {
            const cacheContext = apiManagerProxy.getCacheContext(doc);
            return !!(cacheContext.downloaded || cacheContext.url);
          });

          if(isEffectLoaded || !docs.length) {
            return onAvailableReaction({availableReaction, onlyAround});
          }

          // * the reaction effect isn't loaded yet - play a generic animation
          // * instead, but still load the effect to fire it the next time
          docs.forEach(warmUpDownload);

          if(!sticker) {
            sticker = availableReaction.center_icon ?? availableReaction.static_icon;
            staticSticker = true;
          }
        }

        if(!sticker) {
          return;
        }

        const prepared = takePreparedGenericEffect(options.sizes);
        if(prepared) {
          return onAvailableReaction({genericEffect: prepared.doc, sticker, staticSticker, prepared});
        }

        return callbackify(getGenericEffect(options.managers), (genericEffect) => {
          if(!genericEffect) { // * fallback to the late effect
            return availableReaction && onAvailableReaction({availableReaction, onlyAround});
          }

          return onAvailableReaction({genericEffect, sticker, staticSticker});
        });
      });
    };

    let promise: Promise<void>;
    if(reaction._ === 'reactionEmoji') {
      promise = Promise.resolve(onEmoticon(undefined, reaction.emoticon));
    } else if(reaction._ === 'reactionPaid') {
      promise = Promise.resolve()
      onAvailableReaction({
        onlyAround: true,
        assetName: `StarReactionEffect${getUnsafeRandomInt(1, 3)}` as LottieAssetName
      })
    } else {
      promise = callbackify(options.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id), (doc) => {
        return onEmoticon(doc);
      });
    }

    options.middleware.onDestroy(() => {
      options.cache.hasAroundAnimation = undefined;
    });

    options.cache.hasAroundAnimation = promise;
    promise.finally(() => {
      if(options.cache.hasAroundAnimation === promise) {
        options.cache.hasAroundAnimation = undefined;
      }
    }).catch(noop);
  }
}

if(!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, ReactionElement);
}
