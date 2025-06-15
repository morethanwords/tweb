/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {PeerAvailableReactions} from '../../lib/appManagers/appReactionsManager';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {IS_MOBILE, IS_SAFARI} from '../../environment/userAgent';
import filterUnique from '../../helpers/array/filterUnique';
import assumeType from '../../helpers/assumeType';
import callbackifyAll from '../../helpers/callbackifyAll';
import deferredPromise from '../../helpers/cancellablePromise';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import ListenerSetter from '../../helpers/listenerSetter';
import liteMode from '../../helpers/liteMode';
import {Middleware, getMiddleware} from '../../helpers/middleware';
import noop from '../../helpers/noop';
import {fastRaf} from '../../helpers/schedulers';
import {Message, AvailableReaction, Reaction, AvailableEffect, EmojiGroup} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import ButtonIcon from '../buttonIcon';
import {EmoticonsDropdown} from '../emoticonsDropdown';
import EmojiTab from '../emoticonsDropdown/tabs/emoji';
import wrapSticker from '../wrappers/sticker';
import {i18n} from '../../lib/langPack';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupPremium from '../popups/premium';
import contextMenuController from '../../helpers/contextMenuController';
import callbackify from '../../helpers/callbackify';
import partition from '../../helpers/array/partition';
import {PAID_REACTION_EMOJI_DOCID} from '../../lib/customEmoji/constants';
import {StarsStar} from '../popups/stars';

const REACTIONS_CLASS_NAME = 'btn-menu-reactions';
const REACTION_CLASS_NAME = REACTIONS_CLASS_NAME + '-reaction';

const REACTIONS_MAX_LENGTH = 7;
const REACTION_SIZE = 28; // 36
const PADDING = 6;
export const REACTION_CONTAINER_SIZE = REACTION_SIZE + PADDING * 2;

const CAN_USE_TRANSFORM = !IS_SAFARI;
const SCALE_ON_HOVER = CAN_USE_TRANSFORM && false;

type ChatReactionsMenuPlayers = {
  select?: RLottiePlayer,
  appear?: RLottiePlayer,
  selectWrapper: HTMLElement,
  appearWrapper: HTMLElement,
  reaction: Reaction
};
export class ChatReactionsMenu {
  public widthContainer: HTMLElement;
  public container: HTMLElement;
  private reactionsMap: Map<HTMLElement, ChatReactionsMenuPlayers>;
  // private scrollable: ScrollableBase;
  private animationGroup: AnimationItemGroup;
  private middlewareHelper: ReturnType<typeof getMiddleware>;
  private managers: AppManagers;
  private onFinish: (reaction?: Reaction | Promise<Reaction>) => void;
  private listenerSetter: ListenerSetter;
  private size: number;
  private openSide: 'top' | 'bottom';
  private getOpenPosition: (hasMenu: boolean) => DOMRectEditable;
  private noMoreButton: boolean;
  private isTags: boolean;
  private isEffects: boolean;
  private reactions: Reaction[];
  private availableReactions: AvailableReaction[];
  private noPacks: boolean;
  private noSearch: boolean;
  public freeCustomEmoji: Set<DocId>;
  public inited: boolean;

  constructor(options: {
    managers: AppManagers,
    type: 'horizontal' | 'vertical',
    middleware: Middleware,
    onFinish: ChatReactionsMenu['onFinish'],
    size?: ChatReactionsMenu['size'],
    openSide?: ChatReactionsMenu['openSide'],
    getOpenPosition: ChatReactionsMenu['getOpenPosition'],
    noMoreButton?: boolean,
    isTags?: boolean,
    isEffects?: boolean
  }) {
    this.managers = options.managers;
    this.middlewareHelper = options.middleware ? options.middleware.create() : getMiddleware();
    this.onFinish = options.onFinish;
    this.listenerSetter = new ListenerSetter();
    this.size = options.size ?? REACTION_SIZE;
    this.openSide = options.openSide ?? 'bottom';
    this.getOpenPosition = options.getOpenPosition;
    this.noMoreButton = options.noMoreButton;
    this.isTags = options.isTags;
    this.isEffects = options.isEffects;

    this.middlewareHelper.get().onDestroy(() => {
      this.listenerSetter.removeAll();
    });

    const widthContainer = this.widthContainer = document.createElement('div');
    widthContainer.classList.add(
      REACTIONS_CLASS_NAME + '-container',
      REACTIONS_CLASS_NAME + '-container-' + options.type,
      'btn-menu-transition'
    );

    if(this.isTags || this.isEffects) {
      widthContainer.classList.add(REACTIONS_CLASS_NAME + '-container-' + 'tags');
      const description = this.isEffects ? i18n('AddEffectMessageHint') : i18n(
        rootScope.premium ? 'Reactions.Tag.Description' : 'Reactions.Tag.PremiumHint',
        [
          anchorCallback(() => {
            contextMenuController.close();
            PopupPremium.show({feature: 'saved_tags'});
          })
        ]
      );
      description.classList.add(REACTIONS_CLASS_NAME + '-description');
      widthContainer.append(description);
    }

    const reactionsContainer = this.container = document.createElement('div');
    reactionsContainer.classList.add(REACTIONS_CLASS_NAME/* , 'btn-menu-transition' */);

    // const shadow = document.createElement('div');
    // shadow.classList.add('inner-shadow');

    // const reactionsScrollable = this.scrollable = type === 'vertical' ? new Scrollable(undefined) : new ScrollableX(undefined);
    // reactionsContainer.append(reactionsScrollable.container/* , shadow */);
    // reactionsScrollable.onAdditionalScroll = this.onScroll;
    // reactionsScrollable.setListeners();
    // reactionsScrollable.container.classList.add('no-scrollbar');

    ['big'].forEach((type) => {
      const bubble = document.createElement('div');
      bubble.classList.add(
        REACTIONS_CLASS_NAME + '-bubble',
        REACTIONS_CLASS_NAME + '-bubble-' + type
        // 'btn-menu-transition'
      );
      widthContainer.append(bubble);
    });

    this.reactionsMap = new Map();
    this.animationGroup = `CHAT-MENU-REACTIONS-${Date.now()}`;
    animationIntersector.setOverrideIdleGroup(this.animationGroup, true);

    if(!IS_TOUCH_SUPPORTED) {
      reactionsContainer.addEventListener('mousemove', this.onMouseMove);
    }

    attachClickEvent(reactionsContainer, (e) => {
      const reactionDiv = findUpClassName(e.target, REACTION_CLASS_NAME);
      if(!reactionDiv) return;

      const players = this.reactionsMap.get(reactionDiv);
      if(!players) return;

      this.onFinish(players.reaction);
    }, {listenerSetter: this.listenerSetter});

    widthContainer.append(reactionsContainer);
  }

  private render = async(renderPromises: Promise<any>[], hasMore: boolean) => {
    const middleware = this.middlewareHelper.get();
    await Promise.all(renderPromises);
    if(!middleware()) {
      return;
    }

    if(hasMore && !this.noMoreButton) {
      const moreButton = ButtonIcon(`${this.openSide === 'bottom' ? 'down' : 'up'} ${REACTIONS_CLASS_NAME}-more`, {noRipple: true});
      this.container.append(moreButton);
      attachClickEvent(
        moreButton,
        this.onMoreClick,
        {listenerSetter: this.listenerSetter}
      );
    }

    const setVisible = () => {
      this.widthContainer.classList.add('is-visible');
    };

    return setVisible;
  };

  private renderReactions(
    {type, reactions}: PeerAvailableReactions,
    availableReactions: AvailableReaction[]
  ) {
    if(availableReactions) {
      this.availableReactions = availableReactions;
      this.freeCustomEmoji = new Set(this.availableReactions.map((availableReaction) => availableReaction.select_animation.id));
    }

    const renderPromises = reactions.slice(0, REACTIONS_MAX_LENGTH).map((reaction) => {
      const availableReaction = reaction._ === 'reactionEmoji' ? availableReactions.find((_reaction) => _reaction.reaction === reaction.emoticon) : undefined;
      return this.renderReaction(reaction, availableReaction);
    });

    return this.render(renderPromises, reactions.length > REACTIONS_MAX_LENGTH);
  }

  private renderEffects(availableEffects: AvailableEffect[]) {
    const renderPromises = availableEffects.slice(0, REACTIONS_MAX_LENGTH).map((availableEffect) => {
      return this.renderReaction({_: 'reactionCustomEmoji', document_id: availableEffect.effect_sticker_id});
    });

    return this.render(renderPromises, availableEffects.length > REACTIONS_MAX_LENGTH);
  }

  private async prepareReactions(message?: Message.message | Message.messageService) {
    const middleware = this.middlewareHelper.get();
    const availableReactionsResult = apiManagerProxy.getAvailableReactions();
    const peerAvailableReactionsResult = await this.managers.acknowledged.appReactionsManager.getAvailableReactionsByMessage(message);
    const cached = !(availableReactionsResult instanceof Promise) && peerAvailableReactionsResult.cached;
    const renderPromise = callbackifyAll([
      peerAvailableReactionsResult.result,
      availableReactionsResult
    ], async([peerAvailableReactions, availableReactions]) => {
      if(!middleware()) {
        return;
      }

      if(peerAvailableReactions.type === 'chatReactionsNone') {
        return;
      }

      this.reactions = peerAvailableReactions.reactions;
      this.noPacks = this.noSearch = peerAvailableReactions.type !== 'chatReactionsAll';
      return this.renderReactions(peerAvailableReactions, availableReactions);
    });

    return [cached, renderPromise] as const;
  }

  private async prepareEffects() {
    const middleware = this.middlewareHelper.get();
    const availableEffects = await this.managers.acknowledged.appReactionsManager.getAvailableEffects();
    const {cached} = availableEffects;
    const renderPromise = callbackify(
      availableEffects.result,
      async(availableEffects) => {
        if(!middleware()) {
          return;
        }

        this.freeCustomEmoji = new Set(
          availableEffects
          .filter((availableEffect) => !availableEffect.pFlags.premium_required)
          .map((availableEffect) => availableEffect.effect_sticker_id)
        );

        this.noPacks = true;

        return this.renderEffects(availableEffects);
      }
    );

    return [cached, renderPromise] as const;
  }

  public async init(message?: Message.message | Message.messageService) {
    let cached: boolean, renderPromise: Promise<() => void>;
    if(this.isEffects) {
      [cached, renderPromise] = await this.prepareEffects();
    } else {
      [cached, renderPromise] = await this.prepareReactions(message);
    }

    if(cached) {
      await renderPromise;
    }

    renderPromise.then((callback) => {
      if(!callback) {
        return;
      }

      if(cached) {
        callback();
      } else {
        fastRaf(callback);
      }
    });

    this.inited = true;
  }

  public cleanup() {
    this.middlewareHelper.clean();
    // this.scrollable.removeListeners();
    this.reactionsMap.clear();
    animationIntersector.setOverrideIdleGroup(this.animationGroup, false);
    animationIntersector.checkAnimations(true, this.animationGroup, true);
  }

  // private onScroll = () => {
  //   this.reactionsMap.forEach((players, div) => {
  //     this.onScrollProcessItem(div, players);
  //   });
  // };

  private reactionToDocId = (reaction: Reaction) => {
    if(reaction._ === 'reactionPaid') return PAID_REACTION_EMOJI_DOCID;
    let docId = (reaction as Reaction.reactionCustomEmoji).document_id;
    if(!docId) {
      const availableReaction = this.availableReactions.find((_reaction) => _reaction.reaction === (reaction as Reaction.reactionEmoji).emoticon);
      docId = availableReaction.select_animation.id;
    }

    return docId;
  };

  private reactionsToDocIds = (reactions: Reaction[]) => {
    return reactions.map(this.reactionToDocId);
  };

  private loadTags = () => {
    const reactionsPromise = this.managers.appReactionsManager.getTagReactions()
    .then(this.reactionsToDocIds);
    return [reactionsPromise];
  };

  private loadEffects = () => {
    const reactionsPromise = this.managers.appReactionsManager.getAvailableEffects()
    .then((availableEffects) => {
      return availableEffects.filter((availableEffect) => {
        return !!availableEffect.effect_animation_id;
      }).map((availableEffect) => availableEffect.effect_sticker_id);
    }) as Promise<DocId[]>;
    return [reactionsPromise];
  };

  private loadReactions = () => {
    const topReactionsPromise = Promise.resolve(this.reactions)
    // const topReactionsPromise = this.managers.appReactionsManager.getTopReactions()
    .then(this.reactionsToDocIds);

    const allRecentReactionsPromise = this.managers.appReactionsManager.getRecentReactions()
    .then(this.reactionsToDocIds);

    const topReactionsSlicedPromise = topReactionsPromise.then((docIds) => this.noPacks ? docIds : docIds.slice(0, 16));

    const recentReactionsPromise = this.noPacks ? undefined : Promise.all([
      topReactionsPromise,
      allRecentReactionsPromise,
      topReactionsSlicedPromise
    ]).then(([topDocIds, recentDocIds, topSlicedDocIds]) => {
      // filter recent reactions and add left top reactions
      recentDocIds = recentDocIds.filter((docId) => !topSlicedDocIds.includes(docId));
      recentDocIds.push(...topDocIds.slice(16));
      return filterUnique(recentDocIds);
    });

    return [topReactionsSlicedPromise, recentReactionsPromise].filter(Boolean);
  };

  private onMoreClick = (e: MouseEvent) => {
    cancelEvent(e);

    const canShrink = this.noPacks && this.noSearch;

    const emojiTab = new EmojiTab({
      noRegularEmoji: true,
      noPacks: this.noPacks,
      noSearch: this.noSearch,
      managers: this.managers,
      mainSets: this.isTags ? this.loadTags : (this.isEffects ? this.loadEffects : this.loadReactions),
      additionalLocalStickerSet: this.isEffects ? async() => {
        const availableEffects = await this.managers.appReactionsManager.getAvailableEffects();
        return (await this.splitAvailableEffects(availableEffects)).localStickerSet;
      } : undefined,
      onClick: async(emoji) => {
        if(emoji.docId && emoji.emoji) {
          const availableReactions = await apiManagerProxy.getAvailableReactions();
          const hasNativeReaction = availableReactions.find((_reaction) => _reaction.select_animation?.id === emoji.docId);
          if(hasNativeReaction) {
            emoji.emoji = hasNativeReaction.reaction;
            delete emoji.docId;
          }
        }

        let reaction: Reaction;
        if(emoji.docId === PAID_REACTION_EMOJI_DOCID) {
          reaction = {_: 'reactionPaid'};
        } else if(emoji.docId) {
          reaction = {
            _: 'reactionCustomEmoji',
            document_id: emoji.docId
          };
        } else {
          reaction = {
            _: 'reactionEmoji',
            emoticon: emoji.emoji
          };
        }

        deferred.resolve(reaction);
        emoticonsDropdown.hideAndDestroy();
      },
      freeCustomEmoji: this.freeCustomEmoji,
      onReady: () => {
        const element = emoticonsDropdown.getElement();
        // element.style.setProperty('--width', element.offsetWidth + 'px');
        if(canShrink) {
          const container = element.querySelector<HTMLElement>('.emoticons-categories-container');
          element.style.setProperty('--height', container.offsetHeight + 'px');
        }
      },
      searchFetcher: this.isEffects ? async(q) => {
        const availableEffects = await this.managers.appReactionsManager.searchAvailableEffects({q});
        return this.splitAvailableEffects(availableEffects);
      } : undefined,
      groupFetcher: this.isEffects ? async(emojiGroup) => {
        const availableEffects = await this.managers.appReactionsManager.searchAvailableEffects({emoticon: (emojiGroup as EmojiGroup.emojiGroup).emoticons});
        return this.splitAvailableEffects(availableEffects);
      } : undefined,
      showLocks: this.isEffects
    });

    const emoticonsDropdown = new EmoticonsDropdown({
      tabsToRender: [emojiTab],
      customParentElement: document.body,
      getOpenPosition: () => this.getOpenPosition(!this.noPacks)
    });

    if(canShrink) {
      emoticonsDropdown.getElement().classList.add('shrink');
    }

    if(this.isEffects) {
      emoticonsDropdown.getElement().classList.add('smaller');
    }

    const deferred = deferredPromise<Reaction>();
    this.onFinish(deferred);
    emoticonsDropdown.addEventListener('closed', () => {
      deferred.resolve(undefined);
      emoticonsDropdown.hideAndDestroy();
    });

    emoticonsDropdown.onButtonClick();
  };

  private async splitAvailableEffects(availableEffects: AvailableEffect[]): ReturnType<EmojiTab['searchFetcher']> {
    const [stickers, customEmojis] = partition(availableEffects, (availableEffect) => !availableEffect.effect_animation_id);
    const docIds = stickers.map((availableEffect) => availableEffect.effect_sticker_id);
    const docs = await Promise.all(docIds.map((docId) => this.managers.appDocsManager.getDoc(docId)));
    return {
      emojis: customEmojis.map((availableEffect) => {
        return {
          emoji: '',
          docId: availableEffect.effect_sticker_id
        }
      }),
      localStickerSet: {
        title: 'StickerEffects',
        stickers: docs
      }
    };
  }

  private canUseAnimations() {
    return liteMode.isAvailable('animations') && liteMode.isAvailable('stickers_chat') && !IS_MOBILE;
  }

  private async renderReaction(reaction: Reaction, availableReaction?: AvailableReaction) {
    const reactionDiv = document.createElement('div');
    reactionDiv.classList.add(REACTION_CLASS_NAME);

    const scaleContainer = document.createElement('div');
    scaleContainer.classList.add(REACTION_CLASS_NAME + '-scale');

    const appearWrapper = document.createElement('div');
    let selectWrapper: HTMLElement;;
    appearWrapper.classList.add(REACTION_CLASS_NAME + '-appear');

    if(this.canUseAnimations()) {
      selectWrapper = document.createElement('div');
      selectWrapper.classList.add(REACTION_CLASS_NAME + '-select', 'hide');
    }

    const players: ChatReactionsMenuPlayers = {
      selectWrapper,
      appearWrapper,
      reaction
    };
    this.reactionsMap.set(reactionDiv, players);

    const middleware = this.middlewareHelper.get();

    const hoverScale = IS_TOUCH_SUPPORTED || !SCALE_ON_HOVER ? 1 : 1.25;
    const size = REACTION_SIZE * hoverScale;

    const loadPromises: Promise<any>[] = [];
    const options = {
      width: size,
      height: size,
      skipRatio: 1,
      needFadeIn: false,
      withThumb: false,
      group: this.animationGroup,
      middleware,
      loadPromises
    };

    const canUseAnimations = this.canUseAnimations();
    const isPaidReaction = reaction._ === 'reactionPaid';

    this.container.append(reactionDiv);
    if(isPaidReaction && !canUseAnimations) {
      appearWrapper.append(StarsStar() as HTMLElement);
    } else if(isPaidReaction && canUseAnimations) {
      const promise = lottieLoader.loadAnimationAsAsset({
        container: appearWrapper,
        loop: false,
        autoplay: true,
        width: size,
        height: size,
        skipRatio: 1,
        middleware,
        group: this.animationGroup
      }, 'StarReactionAppear').then((player) => {
        players.appear = player;

        const selectLoadPromise = lottieLoader.loadAnimationAsAsset({
          container: selectWrapper,
          loop: false,
          autoplay: false,
          ...options
        }, 'StarReactionSelect');

        player.addEventListener('enterFrame', (frameNo) => {
          if(player.maxFrame === frameNo) {
            selectLoadPromise.then((selectPlayer) => {
              assumeType<RLottiePlayer>(selectPlayer);
              appearWrapper.classList.add('hide');
              selectWrapper.classList.remove('hide');

              players.select = selectPlayer;
            }, noop);
          }
        });
      });

      loadPromises.push(promise);
    } else if(!canUseAnimations || !availableReaction) {
      delete options.needFadeIn;
      delete options.withThumb;

      const wrap = () => {
        wrapSticker({
          doc,
          div: appearWrapper,
          liteModeKey: false,
          play: availableReaction === undefined ? true : undefined,
          ...options
        });
      };

      let doc = availableReaction?.static_icon, delay = false;
      if(!doc) {
        const result = await this.managers.acknowledged.appEmojiManager.getCustomEmojiDocument((reaction as Reaction.reactionCustomEmoji).document_id);
        if(result.cached) {
          doc = await result.result;
        } else {
          delete options.loadPromises;
          delay = true;
          result.result.then((_doc) => (doc = _doc, wrap()));
        }
      }

      if(!delay) {
        wrap();
      }
    } else {
      let isFirst = true;
      wrapSticker({
        doc: availableReaction.appear_animation,
        div: appearWrapper,
        play: true,
        liteModeKey: false,
        ...options
      }).then(({render}) => render).then((player) => {
        assumeType<RLottiePlayer>(player);

        players.appear = player;

        player.addEventListener('enterFrame', (frameNo) => {
          if(player.maxFrame === frameNo) {
            selectLoadPromise.then((selectPlayer) => {
              assumeType<RLottiePlayer>(selectPlayer);
              appearWrapper.classList.add('hide');
              selectWrapper.classList.remove('hide');

              if(isFirst) {
                players.select = selectPlayer;
                isFirst = false;
              }
            }, noop);
          }
        });
      }, noop);

      const selectLoadPromise = wrapSticker({
        doc: availableReaction.select_animation,
        div: selectWrapper,
        liteModeKey: false,
        ...options
      }).then(({render}) => render).then((player) => {
        assumeType<RLottiePlayer>(player);

        return lottieLoader.waitForFirstFrame(player);
      }).catch(noop);
    }

    scaleContainer.append(appearWrapper);
    selectWrapper && scaleContainer.append(selectWrapper);
    reactionDiv.append(scaleContainer);
    // this.scrollable.append(reactionDiv);

    return Promise.all(loadPromises);
  }

  // private onScrollProcessItem(div: HTMLElement, players: ChatReactionsMenuPlayers) {
  //   // return;

  //   const scaleContainer = div.firstElementChild as HTMLElement;
  //   const visibleRect = getVisibleRect(div, this.scrollable.container);
  //   let transform: string;
  //   if(!visibleRect) {
  //     if(!players.appearWrapper.classList.contains('hide') || !players.appear) {
  //       return;
  //     }

  //     if(players.select) {
  //       players.select.stop();
  //     }

  //     players.appear.stop();
  //     players.appear.autoplay = true;
  //     players.appearWrapper.classList.remove('hide');
  //     players.selectWrapper.classList.add('hide');

  //     transform = '';
  //   } else if(visibleRect.overflow.left || visibleRect.overflow.right) {
  //     const diff = Math.abs(visibleRect.rect.left - visibleRect.rect.right);
  //     const scale = Math.min(diff ** 2 / REACTION_CONTAINER_SIZE ** 2, 1);

  //     transform = 'scale(' + scale + ')';
  //   } else {
  //     transform = '';
  //   }

  //   if(CAN_USE_TRANSFORM) {
  //     scaleContainer.style.transform = transform;
  //   }
  // }

  private onMouseMove = (e: MouseEvent) => {
    const reactionDiv = findUpClassName(e.target, REACTION_CLASS_NAME);
    if(!reactionDiv) {
      return;
    }

    const players = this.reactionsMap.get(reactionDiv);
    if(!players) {
      return;
    }

    // do not play select animation when appearing
    if(!players.appear?.paused) {
      return;
    }

    const player = players.select;
    if(!player) {
      return;
    }

    if(player.paused) {
      player.autoplay = true;
      player.restart();
    }
  };
}
