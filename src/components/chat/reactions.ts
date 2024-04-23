/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ReactionsContext} from '../../lib/appManagers/appReactionsManager';
import forEachReverse from '../../helpers/array/forEachReverse';
import callbackifyAll from '../../helpers/callbackifyAll';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import {makeMediaSize} from '../../helpers/mediaSize';
import {Middleware, MiddlewareHelper} from '../../helpers/middleware';
import {ReactionCount, SavedReactionTag} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import {CustomEmojiRendererElement} from '../../lib/customEmoji/renderer';
import rootScope from '../../lib/rootScope';
import {AnimationItemGroup} from '../animationIntersector';
import LazyLoadQueue from '../lazyLoadQueue';
import ReactionElement, {ReactionLayoutType, REACTIONS_DISPLAY_COUNTER_AT, REACTIONS_SIZE} from './reaction';
import {getHeavyAnimationPromise} from '../../hooks/useHeavyAnimationCheck';
import pause from '../../helpers/schedulers/pause';

const CLASS_NAME = 'reactions';
const TAG_NAME = CLASS_NAME + '-element';

const REACTIONS_ELEMENTS: Map<string, Set<ReactionsElement>> = new Map();
export {REACTIONS_ELEMENTS};

export const savedReactionTags: SavedReactionTag[] = [];
rootScope.addEventListener('saved_tags', ({savedPeerId, tags}) => {
  if(savedPeerId) {
    return;
  }

  savedReactionTags.splice(0, savedReactionTags.length, ...tags);

  REACTIONS_ELEMENTS.forEach((set) => {
    set.forEach((reactionsElement) => {
      const context = reactionsElement.getContext();
      if(context.peerId === rootScope.myId && reactionsElement.getType() === ReactionLayoutType.Tag) {
        reactionsElement.render();
      }
    });
  });
});

export default class ReactionsElement extends HTMLElement {
  private context: ReactionsContext;
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
  private forceCounter: boolean;

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

  public getType() {
    return this.type;
  }

  public getReactionCount(reactionElement: ReactionElement) {
    return this.sorted[this.sorted.indexOf(reactionElement)].reactionCount;
  }

  public getContext() {
    return this.context;
  }

  public getSorted() {
    return this.sorted;
  }

  public shouldUseTagsForContext(context: ReactionsElement['context']) {
    if(context.peerId !== rootScope.myId) {
      return false;
    }

    const reactions = context.reactions;
    if(!reactions || reactions.pFlags.reactions_as_tags) {
      return true;
    }

    return !reactions.results.length;
  }

  public init({
    context,
    type,
    middleware,
    isPlaceholder = this.isPlaceholder,
    animationGroup,
    lazyLoadQueue,
    forceCounter
  }: {
    context: ReactionsContext,
    type: ReactionLayoutType,
    middleware: Middleware,
    isPlaceholder?: boolean,
    animationGroup?: AnimationItemGroup,
    lazyLoadQueue?: LazyLoadQueue,
    forceCounter?: boolean
  }) {
    if(this.key !== undefined) {
      this.disconnectedCallback();
    }

    if(this.middleware !== middleware) {
      middleware.onDestroy(() => {
        this.middlewareHelpers.clear();
      });
    }

    this.context = context;
    this.key = this.context.peerId + '_' + this.context.mid;
    this.middleware = middleware;
    this.isPlaceholder = isPlaceholder;
    this.animationGroup = animationGroup;
    this.lazyLoadQueue = lazyLoadQueue;
    this.forceCounter = forceCounter;

    this.setType(type);

    this.connectedCallback();
  }

  public setType(type: ReactionLayoutType) {
    if(type === ReactionLayoutType.Block && this.shouldUseTagsForContext(this.context)) {
      type = ReactionLayoutType.Tag;
    }

    if(this.type === type) {
      return;
    }

    this.type = type;

    for(const type in ReactionLayoutType) {
      this.classList.remove(CLASS_NAME + '-' + type);
    }

    this.classList.add(CLASS_NAME + '-' + type);
    this.classList.toggle(CLASS_NAME + '-like-block', type === ReactionLayoutType.Block || type === ReactionLayoutType.Tag);
  }

  public changeContext(context: ReactionsContext) {
    return this.init({
      context,
      type: this.type,
      middleware: this.middleware
    });
  }

  public update(context: ReactionsContext, changedResults?: ReactionCount[], waitPromise?: Promise<any>) {
    this.context = context;
    this.render(changedResults, waitPromise);
  }

  public render(changedResults?: ReactionCount[], waitPromise?: Promise<any>) {
    const reactions = this.context.reactions;
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

    // if(this.context.peerId.isUser()) {
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

    let animationShouldHaveDelay = false;
    const totalReactions = counts.reduce((acc, c) => acc + c.count, 0);
    const canRenderAvatars = reactions &&
      (!!reactions.pFlags.can_see_list || this.context.peerId.isUser()) &&
      totalReactions < REACTIONS_DISPLAY_COUNTER_AT[this.type];
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
      const wasUnread = reactionElement.isUnread;
      const isUnread = recentReactions.some((reaction) => reaction.pFlags.unread);
      reactionElement.reactionCount = {...reactionCount};
      reactionElement.setCanRenderAvatars(canRenderAvatars);
      const customEmojiElement = reactionElement.render(this.isPlaceholder);
      reactionElement.renderCounter(this.forceCounter);
      reactionElement.renderAvatars(recentReactions);
      reactionElement.isUnread = isUnread;
      reactionElement.setIsChosen();

      if(wasUnread && !isUnread && !changedResults?.includes(reactionCount)) {
        (changedResults ??= []).push(reactionCount);
        animationShouldHaveDelay = true;
      }

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
        const size = REACTIONS_SIZE[this.type];
        this.customEmojiRendererMiddlewareHelper = this.middleware.create();
        this.customEmojiRenderer = CustomEmojiRendererElement.create({
          animationGroup: this.animationGroup,
          customEmojiSize: makeMediaSize(size, size),
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
        this.handleChangedResults(changedResults, waitPromise, animationShouldHaveDelay);
      } else {
        this.onConnectCallback = () => {
          this.handleChangedResults(changedResults, waitPromise, animationShouldHaveDelay);
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

  private async handleChangedResults(changedResults: ReactionCount[], waitPromise?: Promise<any>, withDelay?: boolean) {
    await getHeavyAnimationPromise();
    // ! temp
    if(this.context.peerId !== appImManager.chat.peerId) return;
    if(withDelay) {
      waitPromise = (waitPromise || Promise.resolve()).then(() => pause(150));
    }

    changedResults.forEach((reactionCount) => {
      const reactionElement = this.sorted.find((reactionElement) => {
        return reactionsEqual(reactionElement.reactionCount.reaction, reactionCount.reaction);
      });

      reactionElement?.fireAroundAnimation(waitPromise);
    });
  }
}

customElements.define(TAG_NAME, ReactionsElement);
