/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {IS_MOBILE, IS_SAFARI} from '../../environment/userAgent';
import assumeType from '../../helpers/assumeType';
import callbackify from '../../helpers/callbackify';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import liteMode from '../../helpers/liteMode';
import {getMiddleware} from '../../helpers/middleware';
import noop from '../../helpers/noop';
import {fastRaf} from '../../helpers/schedulers';
import {Message, AvailableReaction, Reaction} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import Scrollable, {ScrollableBase, ScrollableX} from '../scrollable';
import wrapSticker from '../wrappers/sticker';

const REACTIONS_CLASS_NAME = 'btn-menu-reactions';
const REACTION_CLASS_NAME = REACTIONS_CLASS_NAME + '-reaction';

const REACTION_SIZE = 26;
const PADDING = 4;
export const REACTION_CONTAINER_SIZE = REACTION_SIZE + PADDING * 2;

const CAN_USE_TRANSFORM = !IS_SAFARI;

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
  public scrollable: ScrollableBase;
  private animationGroup: AnimationItemGroup;
  private middleware: ReturnType<typeof getMiddleware>;
  private message: Message.message;

  constructor(
    private managers: AppManagers,
    private type: 'horizontal' | 'vertical',
    middleware: ChatReactionsMenu['middleware']
  ) {
    const widthContainer = this.widthContainer = document.createElement('div');
    widthContainer.classList.add(REACTIONS_CLASS_NAME + '-container');
    widthContainer.classList.add(REACTIONS_CLASS_NAME + '-container-' + type);

    const reactionsContainer = this.container = document.createElement('div');
    reactionsContainer.classList.add(REACTIONS_CLASS_NAME);

    const shadow = document.createElement('div');
    shadow.classList.add('inner-shadow');

    const reactionsScrollable = this.scrollable = type === 'vertical' ? new Scrollable(undefined) : new ScrollableX(undefined);
    reactionsContainer.append(reactionsScrollable.container, shadow);
    reactionsScrollable.onAdditionalScroll = this.onScroll;
    reactionsScrollable.setListeners();

    reactionsScrollable.container.classList.add('no-scrollbar');

    // ['big'].forEach((type) => {
    //   const bubble = document.createElement('div');
    //   bubble.classList.add(REACTIONS_CLASS_NAME + '-bubble', REACTIONS_CLASS_NAME + '-bubble-' + type);
    //   reactionsContainer.append(bubble);
    // });

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

      this.managers.appReactionsManager.sendReaction(this.message, players.reaction);
    });

    widthContainer.append(reactionsContainer);

    this.middleware = middleware ?? getMiddleware();
  }

  public init(message: Message.message) {
    this.message = message;

    const middleware = this.middleware.get();
    // const result = Promise.resolve(this.appReactionsManager.getAvailableReactionsForPeer(message.peerId)).then((res) => pause(1000).then(() => res));
    const result = this.managers.appReactionsManager.getAvailableReactionsByMessage(message);
    callbackify(result, (reactions) => {
      if(!middleware() || !reactions.length) return;
      reactions.forEach((reaction) => {
        if(reaction.pFlags.premium && !rootScope.premium) return;
        this.renderReaction(reaction);
      });

      const setVisible = () => {
        this.container.classList.add('is-visible');
      };

      if(result instanceof Promise) {
        fastRaf(setVisible);
      } else {
        setVisible();
      }
    });
  }

  public cleanup() {
    this.middleware.clean();
    this.scrollable.removeListeners();
    this.reactionsMap.clear();
    animationIntersector.setOverrideIdleGroup(this.animationGroup, false);
    animationIntersector.checkAnimations(true, this.animationGroup, true);
  }

  private onScroll = () => {
    this.reactionsMap.forEach((players, div) => {
      this.onScrollProcessItem(div, players);
    });
  };

  private canUseAnimations() {
    return liteMode.isAvailable('animations') && liteMode.isAvailable('stickers_chat') && !IS_MOBILE;
  }

  private renderReaction(reaction: AvailableReaction) {
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
      reaction: {_: 'reactionEmoji', emoticon: reaction.reaction}
    };
    this.reactionsMap.set(reactionDiv, players);

    const middleware = this.middleware.get();

    const hoverScale = IS_TOUCH_SUPPORTED ? 1 : 1.25;
    const size = REACTION_SIZE * hoverScale;

    const options = {
      width: size,
      height: size,
      skipRatio: 1,
      needFadeIn: false,
      withThumb: false,
      group: this.animationGroup,
      middleware
    };

    if(!this.canUseAnimations()) {
      delete options.needFadeIn;
      delete options.withThumb;

      wrapSticker({
        doc: reaction.static_icon,
        div: appearWrapper,
        liteModeKey: false,
        ...options
      });
    } else {
      let isFirst = true;
      wrapSticker({
        doc: reaction.appear_animation,
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
        doc: reaction.select_animation,
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
    this.scrollable.append(reactionDiv);
  }

  private onScrollProcessItem(div: HTMLElement, players: ChatReactionsMenuPlayers) {
    // return;

    const scaleContainer = div.firstElementChild as HTMLElement;
    const visibleRect = getVisibleRect(div, this.scrollable.container);
    let transform: string;
    if(!visibleRect) {
      if(!players.appearWrapper.classList.contains('hide') || !players.appear) {
        return;
      }

      if(players.select) {
        players.select.stop();
      }

      players.appear.stop();
      players.appear.autoplay = true;
      players.appearWrapper.classList.remove('hide');
      players.selectWrapper.classList.add('hide');

      transform = '';
    } else if(visibleRect.overflow.left || visibleRect.overflow.right) {
      const diff = Math.abs(visibleRect.rect.left - visibleRect.rect.right);
      const scale = Math.min(diff ** 2 / REACTION_CONTAINER_SIZE ** 2, 1);

      transform = 'scale(' + scale + ')';
    } else {
      transform = '';
    }

    if(CAN_USE_TRANSFORM) {
      scaleContainer.style.transform = transform;
    }
  }

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
