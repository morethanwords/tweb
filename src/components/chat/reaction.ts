/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import callbackify from '../../helpers/callbackify';
import formatNumber from '../../helpers/number/formatNumber';
import {AvailableReaction, Document, MessagePeerReaction, Reaction, ReactionCount} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import rootScope from '../../lib/rootScope';
import SetTransition from '../singleTransition';
import StackedAvatars from '../stackedAvatars';
import {Awaited} from '../../types';
import wrapSticker from '../wrappers/sticker';
import wrapStickerAnimation from '../wrappers/stickerAnimation';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import {fastRaf} from '../../helpers/schedulers';
import {Middleware} from '../../helpers/middleware';
import liteMode from '../../helpers/liteMode';
import appImManager from '../../lib/appManagers/appImManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import CustomEmojiElement from '../../lib/customEmoji/element';
import deferredPromise from '../../helpers/cancellablePromise';
import callbackifyAll from '../../helpers/callbackifyAll';
import BezierEasing from '../../vendor/bezierEasing';
import safePlay from '../../helpers/dom/safePlay';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import Scrollable from '../scrollable';

const CLASS_NAME = 'reaction';
const TAG_NAME = CLASS_NAME + '-element';
const REACTION_INLINE_SIZE = 14;
export const REACTION_BLOCK_SIZE = 22;

export const REACTION_DISPLAY_INLINE_COUNTER_AT = 2;
export const REACTION_DISPLAY_BLOCK_COUNTER_AT = 4;

export type ReactionLayoutType = 'block' | 'inline';

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

  return promise;
}

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
    this.middleware = middleware;
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
    } else {
      return this.customEmojiElement;
    }

    const reactionCount = this.reactionCount;
    if(!doNotRenderSticker && !hadStickerContainer) {
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
          });
          this.stickerContainer.append(this.customEmojiElement);
        }

        this.customEmojiElement.docId = reaction.document_id;
        return this.customEmojiElement;
      }
    }
  }

  private renderDoc(doc: Document.document) {
    const size = this.type === 'inline' ? REACTION_INLINE_SIZE : REACTION_BLOCK_SIZE;
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

  public renderCounter() {
    const reactionCount = this.reactionCount;
    const displayOn = this.type === 'inline' ? REACTION_DISPLAY_INLINE_COUNTER_AT : REACTION_DISPLAY_BLOCK_COUNTER_AT;
    if(reactionCount.count >= displayOn || (this.type === 'block' && !this.canRenderAvatars)) {
      if(!this.counter) {
        this.counter = document.createElement(this.type === 'inline' ? 'i' : 'span');
        this.counter.classList.add(CLASS_NAME + '-counter');
      }

      const formatted = formatNumber(reactionCount.count);
      if(this.counter.textContent !== formatted) {
        this.counter.textContent = formatted;
      }

      if(!this.counter.parentElement) {
        this.append(this.counter);
      }
    } else if(this.counter?.parentElement) {
      this.counter.remove();
      this.counter = undefined;
    }
  }

  public renderAvatars(recentReactions: MessagePeerReaction[]) {
    if(this.type === 'inline') {
      return;
    }

    if(this.reactionCount.count >= REACTION_DISPLAY_BLOCK_COUNTER_AT || !this.canRenderAvatars) {
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
    if(this.type === 'inline') return;
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
    return ReactionElement?.fireAroundAnimation({
      waitPromise,
      cache: this,
      middleware: this.middleware,
      reaction: this.reactionCount?.reaction,
      stickerContainer: this.stickerContainer,
      managers: this.managers,
      sizes: {
        genericEffect: 26,
        genericEffectSize: 100,
        size: this.type === 'inline' ? REACTION_INLINE_SIZE + 14 : REACTION_BLOCK_SIZE + 18,
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
      onlyAround
    }: {
      availableReaction?: AvailableReaction,
      genericEffect?: Document.document,
      sticker?: Document.document,
      onlyAround?: boolean
    }) => {
      const size = genericEffect ? options.sizes.genericEffect : options.sizes.size;
      const div = genericEffect ? undefined : document.createElement('div');
      div && div.classList.add(CLASS_NAME + '-sticker-activate');

      const genericEffectSize = options.sizes.genericEffectSize;
      const isGenericMasked = genericEffect && sticker.sticker !== 2;

      const textColor = options.textColor || 'primary-text-color';

      const aroundParams: Parameters<typeof wrapStickerAnimation>[0] = {
        doc: genericEffect || availableReaction.around_animation,
        size: genericEffect ? genericEffectSize : options.sizes.effectSize,
        target: options.stickerContainer,
        side: 'center',
        skipRatio: 1,
        play: false,
        managers: options.managers,
        middleware: options.middleware,
        scrollable: options.scrollable
      };

      const aroundResult = wrapStickerAnimation(aroundParams);
      const genericResult = genericEffect && wrapStickerAnimation({
        ...aroundParams,
        doc: isGenericMasked ? aroundParams.doc : sticker,
        size: genericEffectSize,
        stickerSize: size,
        loopEffect: true,
        textColor
      });
      const stickerResult = (!genericEffect || isGenericMasked) && !onlyAround && wrapSticker({
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
        loop: isGenericMasked
        // static: isGenericMasked || undefined
      }).then(({render}) => render as Promise<RLottiePlayer>);

      return Promise.all([
        genericEffect ?
          genericResult.stickerPromise :
          stickerResult,

        aroundResult.stickerPromise,

        stickerResult as any as Promise<(HTMLImageElement | HTMLVideoElement)[]>,

        genericEffect && loadReactionGeneric(),

        options.waitPromise
      ]).then(([iconPlayer, aroundPlayer, maskedSticker, reactionGeneric, _]) => {
        if(onlyAround) {
          iconPlayer = aroundPlayer;
        }

        const deferred = deferredPromise<void>();
        const remove = () => {
          deferred.resolve();
          // return;
          // if(!isInDOM(div)) return;
          iconPlayer?.remove();
          div?.remove();
          options.stickerContainer.classList.remove('has-animation');
        };

        if(genericEffect) {
          const canvas = iconPlayer.canvas[0];
          canvas.classList.add('hide');
          const context = iconPlayer.contexts[0];
          const dpr = canvas.dpr;
          const newCanvasSize = genericEffectSize * dpr;
          const size = canvas.width;
          genericResult.animationDiv.append(canvas);
          genericResult.animationDiv.style.transform = 'scaleX(-1)';

          const maskedMedia = maskedSticker?.[0];
          const isMaskedVideo = maskedMedia instanceof HTMLVideoElement;

          iconPlayer.addEventListener('firstFrame', () => {
            iconPlayer.setSize(newCanvasSize, newCanvasSize);
            canvas.classList.remove('hide');

            if(isMaskedVideo) {
              safePlay(maskedMedia);
            }
          }, {once: true});

          let frameNo = 0;
          const scale = newCanvasSize / 512;

          const {layersPositions, op} = reactionGeneric;

          iconPlayer.overrideRender = (frame) => {
            if(isGenericMasked) {
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

        if(!iconPlayer || !aroundPlayer) {
          remove();
          return deferred;
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

        iconPlayer.addEventListener('firstFrame', () => {
          div && options.stickerContainer.append(div);
          options.stickerContainer.classList.add('has-animation');
          iconPlayer.play();
          aroundPlayer.play();
        }, {once: true});

        return deferred;
      });
    };

    const onEmoticon = (sticker: Document.document, emoticon: string = sticker.stickerEmojiRaw) => {
      return callbackifyAll([
        apiManagerProxy.getReaction(emoticon),
        sticker ? options.managers.appReactionsManager.getRandomGenericAnimation() : undefined
      ], ([
        availableReaction,
        genericEffect
      ]) => {
        return onAvailableReaction(availableReaction ? {
          availableReaction,
          onlyAround: !!sticker
        } : {
          genericEffect,
          sticker
        });
      });
    };

    let promise: Promise<void>;
    if(reaction._ === 'reactionEmoji') {
      promise = onEmoticon(undefined, reaction.emoticon);
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
    });
  }
}

customElements.define(TAG_NAME, ReactionElement);
