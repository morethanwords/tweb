/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppMessagesManager} from '../lib/appManagers/appMessagesManager';
import IS_PARALLAX_SUPPORTED from '../environment/parallaxSupport';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import findAndSplice from '../helpers/array/findAndSplice';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import filterChatPhotosMessages from '../helpers/filterChatPhotosMessages';
import ListenerSetter from '../helpers/listenerSetter';
import ListLoader from '../helpers/listLoader';
import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';
import {fastRaf} from '../helpers/schedulers';
import {Message, ChatFull, MessageAction, Photo, User} from '../layer';
import {AppManagers} from '../lib/appManagers/managers';
import choosePhotoSize from '../lib/appManagers/utils/photos/choosePhotoSize';
import {avatarNew, wrapPhotoToAvatar} from './avatarNew';
import Scrollable from './scrollable';
import SwipeHandler from './swipeHandler';
import wrapPhoto from './wrappers/photo';
import openAvatarViewer from './openAvatarViewer';
import Icon from './icon';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import {createEffect, createRoot, on} from 'solid-js';
import {usePeerProfileAppearance} from '../hooks/useProfileColors';
import {getHexColorFromTelegramColor} from '../helpers/color';
import wrapEmojiPattern from './wrappers/emojiPattern';
import {useCollapsable} from '../hooks/useCollapsable';
import deferredPromise from '../helpers/cancellablePromise';
import useIsNightTheme from '../hooks/useIsNightTheme';
import customProperties from '../helpers/dom/customProperties';
import findUpClassName from '../helpers/dom/findUpClassName';
import {changeTitleEmojiColor} from './peerTitle';

const LOAD_NEAREST = 3;
export const SHOW_NO_AVATAR = true;

export default class PeerProfileAvatars {
  private static BASE_CLASS = 'profile-avatars';
  private static SCALE = IS_PARALLAX_SUPPORTED ? 2 : 1;
  private static TRANSLATE_TEMPLATE = IS_PARALLAX_SUPPORTED ? `translate3d({x}, 0, -1px) scale(${PeerProfileAvatars.SCALE})` : 'translate({x}, 0)';
  public container: HTMLElement;
  private avatars: HTMLElement;
  private gradient: HTMLElement;
  private gradientTop: HTMLElement;
  public info: HTMLElement;
  private arrowPrevious: HTMLElement;
  private arrowNext: HTMLElement;
  private tabs: HTMLDivElement;
  private listLoader: ListLoader<Photo.photo['id'] | Message.messageService, Photo.photo['id'] | Message.messageService>;
  private peerId: PeerId;
  private intersectionObserver: IntersectionObserver;
  private loadCallbacks: Map<Element, () => void>;
  private listenerSetter: ListenerSetter;
  private swipeHandler: SwipeHandler;
  private middlewareHelper: MiddlewareHelper;
  private hasBackgroundColor: boolean;
  private emojiPatternCanvas: HTMLCanvasElement;
  private unfold: (e?: MouseEvent) => void;
  private fakeAvatar: ReturnType<typeof avatarNew>;
  private hasNoPhoto: boolean;

  constructor(
    private scrollable: Scrollable,
    private managers: AppManagers,
    private setCollapsedOn: HTMLElement
  ) {
    this.container = document.createElement('div');
    this.container.classList.add(PeerProfileAvatars.BASE_CLASS + '-container');

    this.avatars = document.createElement('div');
    this.avatars.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatars');

    this.gradient = document.createElement('div');
    this.gradient.classList.add(PeerProfileAvatars.BASE_CLASS + '-gradient');

    this.gradientTop = this.gradient.cloneNode() as HTMLElement;
    this.gradientTop.classList.add(PeerProfileAvatars.BASE_CLASS + '-gradient-top');

    this.info = document.createElement('div');
    this.info.classList.add(PeerProfileAvatars.BASE_CLASS + '-info');

    this.tabs = document.createElement('div');
    this.tabs.classList.add(PeerProfileAvatars.BASE_CLASS + '-tabs');

    this.arrowPrevious = document.createElement('div');
    this.arrowPrevious.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow');
    this.arrowPrevious.append(Icon('avatarprevious', PeerProfileAvatars.BASE_CLASS + '-arrow-icon'));

    this.middlewareHelper = getMiddleware();

    this.arrowNext = document.createElement('div');
    this.arrowNext.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow', PeerProfileAvatars.BASE_CLASS + '-arrow-next');
    this.arrowNext.append(Icon('avatarnext', PeerProfileAvatars.BASE_CLASS + '-arrow-icon'));

    this.container.append(this.avatars, this.gradient, this.gradientTop, this.info, this.tabs, this.arrowPrevious, this.arrowNext);

    this.loadCallbacks = new Map();
    this.listenerSetter = new ListenerSetter();

    const checkScrollTop = () => {
      if(this.scrollable.scrollPosition !== 0) {
        this.scrollable.scrollIntoViewNew({
          element: this.scrollable.firstElementChild as HTMLElement,
          position: 'start'
        });
        return false;
      }

      return true;
    };

    const SWITCH_ZONE = 1 / 3;
    let cancel = false;
    let freeze = false;
    attachClickEvent(this.container, async(_e) => {
      if(freeze) {
        cancelEvent(_e);
        return;
      }

      if(cancel) {
        cancel = false;
        return;
      }

      if(!checkScrollTop()) {
        return;
      }

      if(this.hasNoPhoto) {
        return;
      }

      if(this.isCollapsed() && this.unfold) {
        if(findUpClassName(_e.target, 'avatar') && this.container.classList.contains('has-stories')) {
          cancel = true;
          simulateClickEvent(this.fakeAvatar.node);
          return;
        }

        this.unfold(_e);
        return;
      }

      const rect = this.container.getBoundingClientRect();

      // const e = (_e as TouchEvent).touches ? (_e as TouchEvent).touches[0] : _e as MouseEvent;
      const e = _e;
      const x = e.pageX;

      const clickX = x - rect.left;
      if((!this.listLoader.previous.length && !this.listLoader.next.length) ||
        (clickX > (rect.width * SWITCH_ZONE) && clickX < (rect.width - rect.width * SWITCH_ZONE))) {
        const peerId = this.peerId;

        const targets: {element: HTMLElement, item: Photo.photo['id'] | Message.messageService}[] = [];
        this.listLoader.previous.concat(this.listLoader.current, this.listLoader.next).forEach((item, idx) => {
          targets.push({
            element: /* null */this.avatars.children[idx] as HTMLElement,
            item
          });
        });

        const prevTargets = targets.slice(0, this.listLoader.previous.length);
        const nextTargets = targets.slice(this.listLoader.previous.length + 1);

        const target = this.avatars.children[this.listLoader.previous.length] as HTMLElement;
        freeze = true;
        openAvatarViewer(
          target,
          peerId,
          () => peerId === this.peerId,
          this.listLoader.current as Message.messageService,
          prevTargets,
          nextTargets
        );
        freeze = false;
      } else {
        const centerX = rect.right - (rect.width / 2);
        const toRight = x > centerX;

        let distance: number;
        if(this.listLoader.index === 0 && !toRight) distance = this.listLoader.count - 1;
        else if(this.listLoader.index === (this.listLoader.count - 1) && toRight) distance = -(this.listLoader.count - 1);
        else distance = toRight ? 1 : -1;

        this.goWithoutTransition(distance);
      }
    }, {listenerSetter: this.listenerSetter});

    const cancelNextClick = () => {
      cancel = true;
      document.body.addEventListener(IS_TOUCH_SUPPORTED ? 'touchend' : 'click', (e) => {
        cancel = false;
      }, {once: true});
    };

    let width = 0, x = 0, lastDiffX = 0, /* lastIndex = 0, */ minX = 0;
    const swipeHandler = this.swipeHandler = new SwipeHandler({
      element: this.avatars,
      onSwipe: (xDiff, yDiff) => {
        xDiff *= -1;
        yDiff *= -1;

        lastDiffX = xDiff;
        let lastX = x + xDiff * -PeerProfileAvatars.SCALE;
        if(lastX > 0) lastX = 0;
        else if(lastX < minX) lastX = minX;

        this.avatars.style.transform = PeerProfileAvatars.TRANSLATE_TEMPLATE.replace('{x}', lastX + 'px');
        // console.log(xDiff, yDiff);
        return false;
      },
      verifyTouchTarget: (e) => {
        if(!checkScrollTop()) {
          cancelNextClick();
          cancelEvent(e as any as Event);
          return false;
        } else if(this.isCollapsed()) {
          return false;
        } else if(this.container.classList.contains('is-single') || freeze) {
          return false;
        }

        return true;
      },
      onFirstSwipe: () => {
        const rect = this.avatars.getBoundingClientRect();
        width = rect.width;
        minX = -width * (this.tabs.childElementCount - 1);

        /* lastIndex = whichChild(this.tabs.querySelector('.active'));
        x = -width * lastIndex; */
        x = rect.left - this.container.getBoundingClientRect().left;

        this.avatars.style.transform = PeerProfileAvatars.TRANSLATE_TEMPLATE.replace('{x}', x + 'px');

        this.container.classList.add('is-swiping');
        this.avatars.classList.add('no-transition');
        void this.avatars.offsetLeft; // reflow
      },
      onReset: () => {
        const addIndex = Math.ceil(Math.abs(lastDiffX) / (width / PeerProfileAvatars.SCALE)) * (lastDiffX >= 0 ? 1 : -1);
        cancelNextClick();

        // console.log(addIndex);

        this.avatars.classList.remove('no-transition');
        fastRaf(() => {
          this.listLoader.go(addIndex);
          this.container.classList.remove('is-swiping');
        });
      }
    });

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if(!entry.isIntersecting) {
          return;
        }

        this.loadNearestToTarget(entry.target);
      });
    });

    this.setCollapsed(true);

    const o = scrollable.onAdditionalScroll;
    scrollable.onAdditionalScroll = () => {
      o?.();
      this.updateHeaderFilled();
    };

    this.middlewareHelper.onDestroy(() => {
      scrollable.onAdditionalScroll = o;
    });

    createRoot((dispose) => {
      this.middlewareHelper.onDestroy(() => {
        dispose();
        this.unfold = undefined;
      });

      const {folded, unfold, fold} = useCollapsable({
        container: () => this.container,
        listenWheelOn: this.setCollapsedOn,
        scrollable: () => scrollable.container,
        disableHoverWhenFolded: false
      });

      this.unfold = unfold;

      createEffect(() => {
        if(this.hasNoPhoto && !folded()) {
          fold();
          return;
        }

        this.setCollapsed(folded());
      });
    });

    /* this.listenerSetter.add(rootScope)('avatar_update', (peerId) => {
      if(this.peerId === peerId) {
        const photo = appPeersManager.getPeerPhoto(peerId);
        if(photo) {
          const id = photo.photo_id;
          const previous = this.listLoader.previous;
          for(let i = 0; i < previous.length; ++i) {
            if(previous[i] === id)
          }
          this.listLoader.previous.forEach((_id, idx, arr) => {});
        }
      }
    }); */
  }

  public goWithoutTransition(distance: number) {
    this.avatars.classList.add('no-transition');
    void this.avatars.offsetLeft; // reflow

    this.listLoader.go(distance);

    fastRaf(() => {
      this.avatars.classList.remove('no-transition');
    });
  }

  public async setPeer(peerId: PeerId) {
    this.peerId = peerId;
    this.middlewareHelper.clean();

    const photo = await this.managers.appPeersManager.getPeerPhoto(peerId);
    if(!photo && !SHOW_NO_AVATAR) {
      return;
    }

    this.hasNoPhoto = !photo;

    await this.applyAppearance();

    if(this.fakeAvatar) {
      this.fakeAvatar.node.remove();
    }
    this.fakeAvatar = avatarNew({
      peerId,
      isBig: true,
      middleware: this.middlewareHelper.get(),
      size: 120,
      withStories: true,
      onStoriesStatus: (has) => {
        this.container.classList.toggle('has-stories', has);
      },
      storyColors: {
        read: 'rgba(255, 255, 255, .3)'
      }
    });
    this.fakeAvatar.node.classList.add('profile-avatars-avatar-fake');
    await this.fakeAvatar.readyThumbPromise;
    this.avatars.before(this.fakeAvatar.node);

    const listLoader: PeerProfileAvatars['listLoader'] = this.listLoader = new ListLoader({
      loadCount: 50,
      loadMore: (anchor, older, loadCount) => {
        if(!older) return Promise.resolve({count: undefined, items: []});

        if(peerId.isUser()) {
          const maxId: Photo.photo['id'] = anchor as any;
          return this.managers.appPhotosManager.getUserPhotos(peerId, maxId, loadCount).then((value) => {
            return {
              count: value.count,
              items: value.photos
            };
          });
        } else {
          const promises: [Promise<ChatFull> | ChatFull, ReturnType<AppMessagesManager['getHistory']>] = [] as any;
          if(!listLoader.current) {
            promises.push(this.managers.appProfileManager.getChatFull(peerId.toChatId()));
          }

          promises.push(this.managers.appMessagesManager.getHistory({
            peerId,
            offsetId: Number.MAX_SAFE_INTEGER,
            inputFilter: {
              _: 'inputMessagesFilterChatPhotos'
            },
            limit: loadCount,
            backLimit: 0
          }));

          return Promise.all(promises).then(async(result) => {
            const value = result.pop() as typeof result[1];

            let {messages, history} = value;
            if(!messages) {
              messages = value.messages = history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid));
            }

            filterChatPhotosMessages(value);

            if(!listLoader.current) {
              const chatFull = result[0];
              const message = findAndSplice(messages, (message) => {
                return ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo.id === chatFull.chat_photo.id;
              }) as Message.messageService;

              listLoader.current = message || await this.managers.appMessagesManager.generateFakeAvatarMessage(this.peerId, chatFull.chat_photo);
            }

            // console.log('avatars loaded:', value);
            return {
              count: value.count,
              items: messages
            };
          });
        }
      },
      processItem: this.processItem,
      onJump: (item, older) => {
        const id = this.listLoader.index;
        // const nextId = Math.max(0, id);
        const x = 100 * PeerProfileAvatars.SCALE * id;
        this.avatars.style.transform = PeerProfileAvatars.TRANSLATE_TEMPLATE.replace('{x}', `-${x}%`);

        [this.tabs, this.avatars].forEach((container) => {
          const activeTab = container.querySelector('.active');
          if(activeTab) activeTab.classList.remove('active');

          const tab = container.children[id] as HTMLElement;
          tab.classList.add('active');
        });

        this.loadNearestToTarget(this.avatars.children[id]);
      }
    });

    if(photo?._ === 'userProfilePhoto') {
      listLoader.current = photo.photo_id;
    }

    await this.processItem(listLoader.current);

    // listLoader.loaded
    listLoader.load(true);
  }

  private _applyAppearance() {
    const middleware = this.middlewareHelper.get();
    const renderBackgroundEmoji = (docId: DocId, hasBgColor: boolean) => {
      this.emojiPatternCanvas?.remove();
      this.emojiPatternCanvas = undefined;

      if(!docId) {
        return;
      }

      const CANVAS_WIDTH = 393;
      const CANVAS_HEIGHT = 258;

      const canvas = this.emojiPatternCanvas = document.createElement('canvas');
      canvas.classList.add('profile-avatars-pattern');
      const ctx = canvas.getContext('2d');

      const dpr = window.devicePixelRatio;
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.width = `${CANVAS_WIDTH}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;

      const drawHalo = () => {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const radius = 140 * dpr;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
      };

      if(hasBgColor) {
        drawHalo();
      } else {
        canvas.style.mixBlendMode = 'unset';
      }

      const deferred = deferredPromise<void>();
      const MIN_SIZE = 18;
      const MIDDLE_SIZE = 20;
      const MAX_SIZE = 24;
      const MIN_OPACITY = .16;
      const MIDDLE_OPACITY = .2;
      const promise = wrapEmojiPattern({
        docId,
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        emojiSize: 24,
        middleware,
        positions: [
          [307, 155, MIN_SIZE, MIN_OPACITY],
          [68, 155, MIN_SIZE, MIN_OPACITY],
          [317, 95, MIN_SIZE, MIN_OPACITY],
          [58, 95, MIN_SIZE, MIN_OPACITY],
          [292, 52, MIN_SIZE, MIN_OPACITY],
          [83, 52, MIN_SIZE, MIN_OPACITY],
          [213, 195, MIN_SIZE, MIDDLE_OPACITY],
          [162, 195, MIN_SIZE, MIDDLE_OPACITY],
          [273, 204, MIN_SIZE, MIN_OPACITY],
          [102, 204, MIN_SIZE, MIN_OPACITY],
          [253, 163, MIDDLE_SIZE, MIDDLE_OPACITY],
          [120, 163, MIDDLE_SIZE, MIDDLE_OPACITY],
          [258, 75, MIN_SIZE, MIDDLE_OPACITY],
          [117, 75, MIN_SIZE, MIDDLE_OPACITY],
          [269, 113, MAX_SIZE, MIDDLE_OPACITY],
          [100, 113, MAX_SIZE, MIDDLE_OPACITY],
          [230, 44, MIDDLE_SIZE, MIDDLE_OPACITY],
          [143, 44, MIDDLE_SIZE, MIDDLE_OPACITY],
          [187.5, 34, MIN_SIZE, MIDDLE_OPACITY]
        ],
        color: customProperties.getProperty('primary-text-color'),
        onCacheStatus: (cached) => {
          if(cached) {
            promise.then(deferred.resolve.bind(deferred));
          } else {
            deferred.resolve();
          }
        }
      }).then((_canvas) => {
        if(!middleware()) return;

        ctx.drawImage(_canvas, 0, 0);
      });

      this.container.prepend(this.emojiPatternCanvas);

      return deferred;
    };

    const setBackgroundColors = (bgColors: number[]) => {
      let backgroundStr: string;
      if(bgColors) {
        const colors = bgColors.map((color) => getHexColorFromTelegramColor(color));
        if(colors.length === 1) {
          backgroundStr = colors[0];
        } else {
          backgroundStr = `linear-gradient(180deg, ${colors.join(', ')})`;
        }
      }
      this.container.style.background = backgroundStr;
      this.hasBackgroundColor = !!backgroundStr;
    };

    const {colorSet, backgroundEmojiId} = usePeerProfileAppearance(this.peerId);
    const deferred = deferredPromise<void>();
    createEffect(() => {
      const bgColors = colorSet()?.bg_colors;
      const docId = backgroundEmojiId();
      // const docId = '5301072507598550489';

      setBackgroundColors(bgColors);
      this.setCollapsed(this.isCollapsed());

      const isNightTheme = useIsNightTheme();
      createEffect(on(
        isNightTheme,
        () => {
          const promise = renderBackgroundEmoji(docId, !!bgColors);
          if(promise) promise.then(deferred.resolve.bind(deferred));
          else deferred.resolve();
        }
      ));
    });

    return deferred;
  }

  private applyAppearance() {
    const middleware = this.middlewareHelper.get();
    return createRoot((dispose) => {
      middleware.onDestroy(dispose);
      return this._applyAppearance();
    });
  }

  public addTab() {
    const tab = document.createElement('div');
    tab.classList.add(PeerProfileAvatars.BASE_CLASS + '-tab');
    this.tabs.append(tab);

    if(this.tabs.childElementCount === 1) {
      tab.classList.add('active');
    }

    this.container.classList.toggle('is-single', this.tabs.childElementCount <= 1);
  }

  public processItem = async(photoId: Photo.photo['id'] | Message.messageService) => {
    const middleware = this.middlewareHelper.get();
    const avatar = document.createElement('div');
    avatar.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar', 'media-container', 'hide');

    const isFirst = this.avatars.childElementCount === 0;
    this.avatars.append(avatar);

    let photo: Photo.photo;
    if(photoId) {
      photo = typeof(photoId) !== 'object' ?
        await this.managers.appPhotosManager.getPhoto(photoId) :
        (photoId.action as MessageAction.messageActionChannelEditPhoto).photo as Photo.photo;
    }

    const loadCallback = async() => {
      const avatarElem = avatarNew({
        middleware,
        size: 'full',
        isDialog: false,
        isBig: true
        // size: isFirst ? 120 : 'full',
        // withStories: isFirst
      });

      if(isFirst) {
        avatarElem.node.classList.add('profile-avatars-avatar-first');
      }

      if(photo) {
        const boxSize = 420;
        const photoSize = choosePhotoSize(photo, boxSize, boxSize, false);
        await wrapPhotoToAvatar(avatarElem, photo, boxSize, photoSize);
      } else {
        avatarElem.render({
          peerId: this.peerId
        });

        await avatarElem.readyThumbPromise;
      }

      avatar.append(avatarElem.node);
      avatar.classList.remove('hide');

      return;
      if(photo) {
        const res = await wrapPhoto({
          container: avatar,
          photo,
          size: choosePhotoSize(photo, 420, 420, false),
          withoutPreloader: true
        });

        [res.images.thumb, res.images.full].filter(Boolean).forEach((img) => {
          img.classList.add('avatar-photo');
        });
      } else {
        const _avatar = avatarNew({
          middleware,
          size: 'full',
          isBig: true,
          peerId: this.peerId
        });
        await _avatar.readyThumbPromise;
        avatar.append(_avatar.node);
      }

      avatar.classList.remove('hide');
    };

    if(this.avatars.childElementCount <= LOAD_NEAREST) {
      await loadCallback();
    } else {
      this.intersectionObserver.observe(avatar);
      this.loadCallbacks.set(avatar, loadCallback);
    }

    this.addTab();

    if(this.tabs.childElementCount === 1) {
      avatar.classList.add('active');
    }

    return photoId;
  };

  private loadNearestToTarget(target: Element) {
    const children = Array.from(target.parentElement.children);
    const idx = children.indexOf(target);
    const slice = children.slice(Math.max(0, idx - LOAD_NEAREST), Math.min(children.length, idx + LOAD_NEAREST));

    slice.forEach((target) => {
      const callback = this.loadCallbacks.get(target);
      if(callback) {
        callback();
        this.loadCallbacks.delete(target);
        this.intersectionObserver.unobserve(target);
      }
    });
  }

  private setCollapsed(collapsed: boolean) {
    // * go to the first avatar
    if(!this.isCollapsed() && collapsed && this.listLoader?.index) {
      this.goWithoutTransition(-this.listLoader.index);
    }

    this.setCollapsedOn.classList.toggle('is-collapsed', collapsed);
    const needWhite = this.hasBackgroundColor || !collapsed;
    if(this.setCollapsedOn.classList.contains('need-white') !== needWhite) {
      this.setCollapsedOn.classList.toggle('need-white', needWhite);
      changeTitleEmojiColor(this.info, needWhite ? 'white' : 'primary-color');
    }
    this.updateHeaderFilled();
  }

  private isCollapsed() {
    return this.setCollapsedOn.classList.contains('is-collapsed');
  }

  public updateHeaderFilled() {
    this.setCollapsedOn.classList.toggle(
      'header-filled',
      (!this.hasBackgroundColor && this.isCollapsed() && this.scrollable.scrollPosition >= 5) ||
        this.scrollable.scrollPosition >= 240
    );
  }

  public cleanup() {
    this.listenerSetter.removeAll();
    this.swipeHandler.removeListeners();
    this.intersectionObserver?.disconnect();
    this.middlewareHelper.destroy();
  }
}
