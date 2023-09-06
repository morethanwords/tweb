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
import getUnsafeRandomInt from '../../helpers/number/getUnsafeRandomInt';
import BezierEasing from '../../vendor/bezierEasing';
import {easeOutQuadApply} from '../../helpers/easing/easeOutQuad';

const CLASS_NAME = 'reaction';
const TAG_NAME = CLASS_NAME + '-element';
const REACTION_INLINE_SIZE = 14;
export const REACTION_BLOCK_SIZE = 22;

export const REACTION_DISPLAY_INLINE_COUNTER_AT = 2;
export const REACTION_DISPLAY_BLOCK_COUNTER_AT = 4;

export type ReactionLayoutType = 'block' | 'inline';

export default class ReactionElement extends HTMLElement {
  private type: ReactionLayoutType;
  private counter: HTMLElement;
  private stickerContainer: HTMLElement;
  private stackedAvatars: StackedAvatars;
  private canRenderAvatars: boolean;
  private _reactionCount: ReactionCount;
  private wrapStickerPromise: Awaited<ReturnType<typeof wrapSticker>>['render'];
  private managers: AppManagers;
  private middleware: Middleware;
  private customEmojiElement: CustomEmojiElement;

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

  public fireAroundAnimation(waitPromise: Promise<any>) {
    if(!liteMode.isAvailable('effects_reactions')) {
      return;
    }

    const reaction = this.reactionCount.reaction;
    if(reaction._ === 'reactionEmpty') return;

    const onAvailableReaction = ({
      availableReaction,
      genericEffect,
      sticker
    }: {
      availableReaction?: AvailableReaction,
      genericEffect?: Document.document,
      sticker?: Document.document
    }) => {
      const size = genericEffect ? 20 : (this.type === 'inline' ? REACTION_INLINE_SIZE + 14 : REACTION_BLOCK_SIZE + 18);
      const div = genericEffect ? undefined : document.createElement('div');
      div && div.classList.add(CLASS_NAME + '-sticker-activate');

      const aroundParams: Parameters<typeof wrapStickerAnimation>[0] = {
        doc: genericEffect || availableReaction.around_animation,
        size: 80,
        target: this.stickerContainer,
        side: 'center',
        skipRatio: 1,
        play: false,
        managers: this.managers,
        middleware: this.middleware,
        scrollable: appImManager.chat.bubbles.scrollable
      };

      const aroundResult = wrapStickerAnimation(aroundParams);
      const genericResult = genericEffect && wrapStickerAnimation({
        ...aroundParams,
        doc: sticker,
        stickerSize: size
      });
      const stickerResult = !genericEffect && wrapSticker({
        div: div,
        doc: sticker || availableReaction.center_icon,
        width: size,
        height: size,
        withThumb: false,
        needUpscale: true,
        play: false,
        skipRatio: 1,
        group: 'none',
        needFadeIn: false,
        managers: this.managers,
        middleware: this.middleware
      }).then(({render}) => render as Promise<RLottiePlayer>);

      Promise.all([
        genericEffect ?
          genericResult.stickerPromise :
          stickerResult,

        aroundResult.stickerPromise,

        waitPromise
      ]).then(([iconPlayer, aroundPlayer, _]) => {
        const remove = () => {
          // return;
          // if(!isInDOM(div)) return;
          iconPlayer.remove();
          div.remove();
          this.stickerContainer.classList.remove('has-animation');
        };

        function randomPointOnCircle(cx: number, cy: number, radius: number) {
          const angle = Math.random() * 2 * Math.PI;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return {x, y};
        }

        const firstStop = 0.5;
        function interpolate(start: number, end1: number, end2: number, progress: number) {
          if(progress <= firstStop) {
            return start + (end1 - start) * (progress * (1 / firstStop));
          } else {
            return end1 + (end2 - end1) * ((progress - firstStop) * (1 / (1 - firstStop)));
          }
        }

        if(genericEffect) {
          const canvas = iconPlayer.canvas[0];
          const context = iconPlayer.contexts[0];
          const dpr = canvas.dpr;
          const newCanvasSize = aroundParams.size * dpr;
          const size = canvas.width;
          canvas.width = newCanvasSize;
          canvas.height = newCanvasSize;
          genericResult.animationDiv.append(canvas);

          const generateItem = (): {
            x: number,
            y: number,
            moveX: number,
            moveY: number,
            scale: number,
            reflect: boolean
          } => {
            const point = randomPointOnCircle(CS, CS, CS / 2);
            const scale = getUnsafeRandomInt(6, 10) / 10;
            const maxSize = size * scale;
            const topY = maxSize / 2;
            let moveY = -getUnsafeRandomInt(10, 30) * dpr;
            const minY = point.y + moveY;
            if(minY < topY) { // prevent from going above the top
              moveY += topY - minY;
            }

            return {
              ...point,
              // x: CS / 2,
              // y: CS,
              moveX: getUnsafeRandomInt(-5, 5) * dpr,
              moveY,
              scale,
              reflect: Math.random() > 0.5 && false
            };
          };

          const S = newCanvasSize, CS = S / 2;
          const items = new Array(7).fill(0).map(generateItem);

          const easing = BezierEasing(/* .14, .46, .91, .13 */0.42, 0.0, 0.58, 1.0);
          const duration = 1500, startTime = Date.now();
          iconPlayer.overrideRender = (frame) => {
            let progress = Math.min(1, (Date.now() - startTime) / duration);
            console.log('progress', progress, easing(progress), easeOutQuadApply(progress, 1));
            progress = easeOutQuadApply(progress, 1);
            const isBitmap = frame instanceof ImageBitmap;
            context.clearRect(0, 0, newCanvasSize, newCanvasSize);
            context.globalAlpha = interpolate(1, 1, 0, progress);

            for(const item of items) {
              const maxSize = size * item.scale;
              const x = item.x + item.moveX * progress;
              const y = interpolate(item.y, item.y + item.moveY, item.y + 30 * dpr, progress);
              const scaledSize = interpolate(size, maxSize, maxSize, progress);
              // context.save();
              // context.translate(item.reflect ? newCanvasSize : 0, 0);
              // context.scale(item.reflect ? -1 : 1, 1);
              if(isBitmap) {
                context.drawImage(frame, x, y, scaledSize, scaledSize);
              }
              // context.restore();
            }
          };
        }

        if(!iconPlayer || !aroundPlayer) {
          remove();
          return;
        }

        const removeOnFrame = () => {
          // if(!isInDOM(div)) return;
          fastRaf(remove);
        };

        !genericEffect && iconPlayer.addEventListener('enterFrame', (frameNo) => {
          if(frameNo === iconPlayer.maxFrame) {
            if(this.wrapStickerPromise) { // wait for fade in animation
              this.wrapStickerPromise.then(() => {
                setTimeout(removeOnFrame, 1e3);
              });
            } else {
              removeOnFrame();
            }
          }
        });

        iconPlayer.addEventListener('firstFrame', () => {
          div && this.stickerContainer.append(div);
          this.stickerContainer.classList.add('has-animation');
          iconPlayer.play();
          aroundPlayer.play();
        }, {once: true});
      });
    };

    const onEmoticon = (sticker: Document.document, emoticon: string = sticker.stickerEmojiRaw) => {
      callbackifyAll([
        apiManagerProxy.getReaction(emoticon),
        sticker ? this.managers.appReactionsManager.getRandomGenericAnimation() : undefined
      ], ([
        availableReaction,
        genericEffect
      ]) => {
        if(!availableReaction) {
          return;
        }

        onAvailableReaction(availableReaction ? {
          availableReaction
        } : {
          genericEffect,
          sticker
        });
      });
    };

    if(reaction._ === 'reactionEmoji') {
      onEmoticon(undefined, reaction.emoticon);
    } else {
      callbackify(this.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id), (doc) => {
        onEmoticon(doc);
      });
    }
  }
}

customElements.define(TAG_NAME, ReactionElement);
