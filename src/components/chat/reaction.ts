/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import callbackify from '../../helpers/callbackify';
import formatNumber from '../../helpers/number/formatNumber';
import {Document, MessagePeerReaction, ReactionCount} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import rootScope from '../../lib/rootScope';
import SetTransition from '../singleTransition';
import StackedAvatars from '../stackedAvatars';
import {Awaited} from '../../types';
import wrapSticker from '../wrappers/sticker';
import wrapCustomEmoji from '../wrappers/customEmoji';
import wrapStickerAnimation from '../wrappers/stickerAnimation';
import {makeMediaSize} from '../../helpers/mediaSize';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import {fastRaf} from '../../helpers/schedulers';
import noop from '../../helpers/noop';
import {Middleware} from '../../helpers/middleware';
import liteMode from '../../helpers/liteMode';

const CLASS_NAME = 'reaction';
const TAG_NAME = CLASS_NAME + '-element';
const REACTION_INLINE_SIZE = 14;
const REACTION_BLOCK_SIZE = 22;

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
    }

    const reactionCount = this.reactionCount;
    if(!doNotRenderSticker && !hadStickerContainer) {
      const reaction = reactionCount.reaction;
      if(reaction._ === 'reactionEmoji') {
        const availableReaction = this.managers.appReactionsManager.getReaction(reaction.emoticon);
        callbackify(availableReaction, (availableReaction) => {
          if(!availableReaction.center_icon) {
            this.stickerContainer.classList.add('is-static');
          }

          if(availableReaction.pFlags.inactive) {
            this.classList.add('is-inactive');
          }

          this.renderDoc(availableReaction.center_icon ?? availableReaction.static_icon);
        });
      } else if(reaction._ === 'reactionCustomEmoji') {
        this.stickerContainer.classList.add('is-custom');
        const wrapped = wrapCustomEmoji({
          docIds: [reaction.document_id],
          customEmojiSize: makeMediaSize(REACTION_BLOCK_SIZE, REACTION_BLOCK_SIZE)
        });

        this.stickerContainer.append(wrapped);
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
      middleware: this.middleware
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
        avatarSize: 24
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

  public fireAroundAnimation() {
    if(!liteMode.isAvailable('effects_reactions')) {
      return;
    }

    const reaction = this.reactionCount.reaction;
    if(reaction._ !== 'reactionEmoji') return;
    callbackify(this.managers.appReactionsManager.getReaction(reaction.emoticon), (availableReaction) => {
      const size = this.type === 'inline' ? REACTION_INLINE_SIZE + 14 : REACTION_BLOCK_SIZE + 18;
      const div = document.createElement('div');
      div.classList.add(CLASS_NAME + '-sticker-activate');

      Promise.all([
        wrapSticker({
          div: div,
          doc: availableReaction.center_icon,
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
        }).then(({render}) => render as Promise<RLottiePlayer>),

        wrapStickerAnimation({
          doc: availableReaction.around_animation,
          size: 80,
          target: this.stickerContainer,
          side: 'center',
          skipRatio: 1,
          play: false,
          managers: this.managers,
          middleware: this.middleware
        }).stickerPromise.catch(noop)
      ]).then(([iconPlayer, aroundPlayer]) => {
        const remove = () => {
          // if(!isInDOM(div)) return;
          iconPlayer.remove();
          div.remove();
          this.stickerContainer.classList.remove('has-animation');
        };

        if(!aroundPlayer) {
          remove();
          return;
        }

        const removeOnFrame = () => {
          // if(!isInDOM(div)) return;
          fastRaf(remove);
        };

        iconPlayer.addEventListener('enterFrame', (frameNo) => {
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
          this.stickerContainer.append(div);
          this.stickerContainer.classList.add('has-animation');
          iconPlayer.play();
          aroundPlayer.play();
        }, {once: true});
      });
    });
  }
}

customElements.define(TAG_NAME, ReactionElement);
