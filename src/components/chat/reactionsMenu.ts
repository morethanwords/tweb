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
import {Message, AvailableReaction, Reaction} from '../../layer';
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

const REACTIONS_CLASS_NAME = 'btn-menu-reactions';
const REACTION_CLASS_NAME = REACTIONS_CLASS_NAME + '-reaction';

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
  private tags: boolean;
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
    tags?: boolean
  }) {
    this.managers = options.managers;
    this.middlewareHelper = options.middleware ? options.middleware.create() : getMiddleware();
    this.onFinish = options.onFinish;
    this.listenerSetter = new ListenerSetter();
    this.size = options.size ?? REACTION_SIZE;
    this.openSide = options.openSide ?? 'bottom';
    this.getOpenPosition = options.getOpenPosition;
    this.noMoreButton = options.noMoreButton;
    this.tags = options.tags;

    this.middlewareHelper.get().onDestroy(() => {
      this.listenerSetter.removeAll();
    });

    const widthContainer = this.widthContainer = document.createElement('div');
    widthContainer.classList.add(
      REACTIONS_CLASS_NAME + '-container',
      REACTIONS_CLASS_NAME + '-container-' + options.type,
      'btn-menu-transition'
    );

    if(this.tags) {
      widthContainer.classList.add(REACTIONS_CLASS_NAME + '-container-' + 'tags');
      const description = i18n(
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

  public async init(message?: Message.message) {
    const middleware = this.middlewareHelper.get();

    const r = async(
      {type, reactions}: PeerAvailableReactions,
      availableReactions: AvailableReaction[]
    ) => {
      // this.widthContainer.classList.add('is-visible');
      // return;
      const maxLength = 7;
      // const filtered = reactions.filter((reaction) => !reaction.pFlags.premium || rootScope.premium);
      const filtered = reactions;
      const sliced = filtered.slice(0, maxLength);
      const renderPromises = sliced.map((reaction) => {
        const availableReaction = reaction._ === 'reactionEmoji' ? availableReactions.find((_reaction) => _reaction.reaction === reaction.emoticon) : undefined;
        return this.renderReaction(reaction, availableReaction);
      });

      await Promise.all(renderPromises);
      if(!middleware()) {
        return;
      }

      if(filtered.length > maxLength && !this.noMoreButton) {
        const moreButton = ButtonIcon(`${this.openSide === 'bottom' ? 'down' : 'up'} ${REACTIONS_CLASS_NAME}-more`, {noRipple: true});
        this.container.append(moreButton);
        attachClickEvent(moreButton, (e) => {
          cancelEvent(e);

          const reactionToDocId = (reaction: Reaction) => {
            let docId = (reaction as Reaction.reactionCustomEmoji).document_id;
            if(!docId) {
              const availableReaction = availableReactions.find((_reaction) => _reaction.reaction === (reaction as Reaction.reactionEmoji).emoticon);
              docId = availableReaction.select_animation.id;
            }

            return docId;
          };

          const reactionsToDocIds = (reactions: Reaction[]) => {
            return reactions.map(reactionToDocId);
          };

          const noPacks = type !== 'chatReactionsAll';
          const emojiTab = new EmojiTab({
            noRegularEmoji: true,
            noPacks,
            managers: rootScope.managers,
            mainSets: this.tags ? () => {
              const reactionsPromise = this.managers.appReactionsManager.getTagReactions()
              .then(reactionsToDocIds);
              return [reactionsPromise];
            } : () => {
              const topReactionsPromise = Promise.resolve(reactions)
              // const topReactionsPromise = this.managers.appReactionsManager.getTopReactions()
              .then(reactionsToDocIds);

              const allRecentReactionsPromise = this.managers.appReactionsManager.getRecentReactions()
              .then(reactionsToDocIds);

              const topReactionsSlicedPromise = topReactionsPromise.then((docIds) => noPacks ? docIds : docIds.slice(0, 16));

              const recentReactionsPromise = noPacks ? undefined : Promise.all([
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
            },
            onClick: async(emoji) => {
              if(emoji.docId && emoji.emoji) {
                const availableReactions = await apiManagerProxy.getAvailableReactions();
                const hasNativeReaction = availableReactions.find((_reaction) => _reaction.select_animation?.id === emoji.docId);
                if(hasNativeReaction) {
                  emoji.emoji = hasNativeReaction.reaction;
                  delete emoji.docId;
                }
              }

              const reaction: Reaction = emoji.docId ? {
                _: 'reactionCustomEmoji',
                document_id: emoji.docId
              } : {
                _: 'reactionEmoji',
                emoticon: emoji.emoji
              };
              deferred.resolve(reaction);
              emoticonsDropdown.hideAndDestroy();
            },
            freeCustomEmoji: new Set(availableReactions.map((availableReaction) => availableReaction.select_animation.id))
          });

          const emoticonsDropdown = new EmoticonsDropdown({
            tabsToRender: [emojiTab],
            customParentElement: document.body,
            getOpenPosition: () => this.getOpenPosition(!noPacks)
          });

          if(noPacks) {
            emoticonsDropdown.getElement().classList.add('shrink');
          }

          const deferred = deferredPromise<Reaction>();
          this.onFinish(deferred);
          emoticonsDropdown.addEventListener('closed', () => {
            deferred.resolve(undefined);
            emoticonsDropdown.hideAndDestroy();
          });

          emoticonsDropdown.onButtonClick();
        }, {listenerSetter: this.listenerSetter});
      }

      const setVisible = () => {
        this.widthContainer.classList.add('is-visible');
      };

      if(cached) {
        setVisible();
      } else {
        fastRaf(setVisible);
      }
    };

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

      return r(peerAvailableReactions, availableReactions);
    });

    if(cached) {
      await renderPromise;
    }

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

    this.container.append(reactionDiv);
    if(!this.canUseAnimations() || !availableReaction) {
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
