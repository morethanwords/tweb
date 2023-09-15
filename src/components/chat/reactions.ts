/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import forEachReverse from '../../helpers/array/forEachReverse';
import callbackifyAll from '../../helpers/callbackifyAll';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import {makeMediaSize} from '../../helpers/mediaSize';
import {Middleware, MiddlewareHelper} from '../../helpers/middleware';
import {Message, ReactionCount} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import {CustomEmojiRendererElement} from '../../lib/customEmoji/renderer';
import rootScope from '../../lib/rootScope';
import {AnimationItemGroup} from '../animationIntersector';
import LazyLoadQueue from '../lazyLoadQueue';
import ReactionElement, {ReactionLayoutType, REACTION_DISPLAY_BLOCK_COUNTER_AT, REACTION_BLOCK_SIZE} from './reaction';

const CLASS_NAME = 'reactions';
const TAG_NAME = CLASS_NAME + '-element';

const REACTIONS_ELEMENTS: Map<string, Set<ReactionsElement>> = new Map();
export {REACTIONS_ELEMENTS};

export default class ReactionsElement extends HTMLElement {
  private message: Message.message;
  private key: string;
  private isPlaceholder: boolean;
  private type: ReactionLayoutType;
  private sorted: ReactionElement[];
  private onConnectCallback: () => void;
  private managers: AppManagers;
  private middleware: Middleware;
  private middlewareHelpers: Map<ReactionElement, MiddlewareHelper>;
  public customEmojiRenderer: CustomEmojiRendererElement;
  private customEmojiRendererMiddlewareHelper: MiddlewareHelper;
  private animationGroup: AnimationItemGroup;
  private lazyLoadQueue: LazyLoadQueue;

  constructor() {
    super();
    this.classList.add(CLASS_NAME);
    this.sorted = [];
    this.middlewareHelpers = new Map();
    this.managers = rootScope.managers;
  }

  connectedCallback() {
    let set = REACTIONS_ELEMENTS.get(this.key);
    if(!set) {
      REACTIONS_ELEMENTS.set(this.key, set = new Set());
    }

    set.add(this);

    if(this.onConnectCallback && this.isConnected) {
      this.onConnectCallback();
      this.onConnectCallback = undefined;
    }
  }

  disconnectedCallback() {
    const set = REACTIONS_ELEMENTS.get(this.key);
    set.delete(this);
    if(!set.size) {
      REACTIONS_ELEMENTS.delete(this.key);
    }
  }

  public getReactionCount(reactionElement: ReactionElement) {
    return this.sorted[this.sorted.indexOf(reactionElement)].reactionCount;
  }

  public getMessage() {
    return this.message;
  }

  public init({
    message,
    type,
    middleware,
    isPlaceholder = this.isPlaceholder,
    animationGroup,
    lazyLoadQueue
  }: {
    message: Message.message,
    type: ReactionLayoutType,
    middleware: Middleware,
    isPlaceholder?: boolean,
    animationGroup?: AnimationItemGroup,
    lazyLoadQueue?: LazyLoadQueue
  }) {
    if(this.key !== undefined) {
      this.disconnectedCallback();
    }

    if(this.middleware !== middleware) {
      middleware.onDestroy(() => {
        this.middlewareHelpers.clear();
      });
    }

    this.message = message;
    this.key = this.message.peerId + '_' + this.message.mid;
    this.middleware = middleware;
    this.isPlaceholder = isPlaceholder;
    this.animationGroup = animationGroup;
    this.lazyLoadQueue = lazyLoadQueue;

    if(this.type !== type) {
      this.type = type;
      this.classList.add(CLASS_NAME + '-' + type);
    }

    this.connectedCallback();
  }

  public changeMessage(message: Message.message) {
    return this.init({
      message,
      type: this.type,
      middleware: this.middleware
    });
  }

  public update(message: Message.message, changedResults?: ReactionCount[], waitPromise?: Promise<any>) {
    this.message = message;
    this.render(changedResults, waitPromise);
  }

  public render(changedResults?: ReactionCount[], waitPromise?: Promise<any>) {
    const reactions = this.message.reactions;
    const hasReactions = !!(reactions && reactions.results.length);
    this.classList.toggle('has-no-reactions', !hasReactions);
    if(!hasReactions && !this.sorted.length) return;

    // const availableReactionsResult = this.managers.appReactionsManager.getAvailableReactions();
    // callbackify(availableReactionsResult, () => {
    const counts = hasReactions ? (
      reactions.results
        // availableReactionsResult instanceof Promise ?
        //   reactions.results :
        //   reactions.results.filter((reactionCount) => {
        //     return this.managers.appReactionsManager.isReactionActive(reactionCount.reaction);
        //   })
      ) : [];

    // if(this.message.peerId.isUser()) {
    //   counts.sort((a, b) => (b.count - a.count) || ((b.chosen_order ?? 0) - (a.chosen_order ?? 0)));
    // } else {
    counts.sort((a, b) => (b.count - a.count) || ((a.chosen_order ?? 0) - (b.chosen_order ?? 0)));
    // }

    forEachReverse(this.sorted, (reactionElement, idx, arr) => {
      const reaction = reactionElement.reactionCount.reaction;
      const found = counts.some((reactionCount) => reactionsEqual(reactionCount.reaction, reaction));
      if(!found) {
        const middlewareHelper = this.middlewareHelpers.get(reactionElement);
        middlewareHelper.destroy();
        this.middlewareHelpers.delete(reactionElement);
        arr.splice(idx, 1);
        reactionElement.remove();
      }
    });

    const totalReactions = counts.reduce((acc, c) => acc + c.count, 0);
    const canRenderAvatars = reactions &&
      (!!reactions.pFlags.can_see_list || this.message.peerId.isUser()) &&
      totalReactions < REACTION_DISPLAY_BLOCK_COUNTER_AT;
    const customEmojiElements: ReturnType<ReactionElement['render']>[] = new Array(counts.length);
    this.sorted = counts.map((reactionCount, idx, arr) => {
      let reactionElement: ReactionElement = this.sorted.find((reactionElement) => reactionsEqual(reactionElement.reactionCount.reaction, reactionCount.reaction));
      if(!reactionElement) {
        const middlewareHelper = this.middleware.create();
        reactionElement = new ReactionElement();
        reactionElement.init(this.type, middlewareHelper.get());
        this.middlewareHelpers.set(reactionElement, middlewareHelper);
      }

      reactionElement.classList.toggle('is-last', idx === (arr.length - 1));
      positionElementByIndex(reactionElement, this, idx);

      const recentReactions = reactions.recent_reactions ?
        reactions.recent_reactions.filter((reaction) => reactionsEqual(reaction.reaction, reactionCount.reaction)) :
        [];
      reactionElement.reactionCount = {...reactionCount};
      reactionElement.setCanRenderAvatars(canRenderAvatars);
      const customEmojiElement = reactionElement.render(this.isPlaceholder);
      reactionElement.renderCounter();
      reactionElement.renderAvatars(recentReactions);
      reactionElement.setIsChosen();

      customEmojiElements[idx] = customEmojiElement;

      return reactionElement;
    });

    callbackifyAll(customEmojiElements, (customEmojiElements) => {
      const map: Parameters<CustomEmojiRendererElement['add']>[0]['addCustomEmojis'] = new Map();
      customEmojiElements.forEach((customEmojiElement) => {
        if(!customEmojiElement) {
          return;
        }

        map.set(customEmojiElement.docId, new Set([customEmojiElement]));
      });

      if(!map.size) {
        if(this.customEmojiRenderer) {
          this.customEmojiRendererMiddlewareHelper.destroy();
          this.customEmojiRenderer.remove();
          this.customEmojiRenderer =
            this.customEmojiRendererMiddlewareHelper =
            undefined;
        }

        return;
      }

      if(!this.customEmojiRenderer) {
        this.customEmojiRendererMiddlewareHelper = this.middleware.create();
        this.customEmojiRenderer = CustomEmojiRendererElement.create({
          animationGroup: this.animationGroup,
          customEmojiSize: makeMediaSize(REACTION_BLOCK_SIZE, REACTION_BLOCK_SIZE),
          middleware: this.customEmojiRendererMiddlewareHelper.get(),
          lazyLoadQueue: this.lazyLoadQueue,
          observeResizeElement: this
        });

        this.customEmojiRenderer.classList.add(CLASS_NAME + '-renderer');
        this.customEmojiRenderer.canvas.classList.add(CLASS_NAME + '-renderer-canvas');
        this.prepend(this.customEmojiRenderer);
      }

      this.customEmojiRenderer.add({
        addCustomEmojis: map,
        lazyLoadQueue: this.lazyLoadQueue
      });
    });

    // this.sorted.forEach((reactionElement, idx) => {
    //   /* if(this.type === 'block' && this.childElementCount !== this.sorted.length) { // because of appended time
    //     idx += 1;
    //   } */

    //   positionElementByIndex(reactionElement, this, idx);
    // });

    if(!this.isPlaceholder && changedResults?.length) {
      if(this.isConnected) {
        this.handleChangedResults(changedResults, waitPromise);
      } else {
        this.onConnectCallback = () => {
          this.handleChangedResults(changedResults, waitPromise);
        };
      }
    }
    // });

    // ! тут вообще не должно быть этого кода, но пока он побудет тут
    if(!this.sorted.length && this.type === 'block') {
      const parentElement = this.parentElement;
      this.remove();

      if(parentElement.classList.contains('document-message') && !parentElement.childNodes.length) {
        parentElement.remove();
        return;
      }

      const timeSpan = this.querySelector('.time');
      if(timeSpan) {
        parentElement.append(timeSpan);
      }
    }
  }

  private handleChangedResults(changedResults: ReactionCount[], waitPromise?: Promise<any>) {
    // ! temp
    if(this.message.peerId !== appImManager.chat.peerId) return;

    changedResults.forEach((reactionCount) => {
      const reactionElement = this.sorted.find((reactionElement) => {
        return reactionsEqual(reactionElement.reactionCount.reaction, reactionCount.reaction);
      });

      reactionElement?.fireAroundAnimation(waitPromise);
    });
  }
}

customElements.define(TAG_NAME, ReactionsElement);
