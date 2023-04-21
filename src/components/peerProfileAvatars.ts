/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_PARALLAX_SUPPORTED from '../environment/parallaxSupport';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import findAndSplice from '../helpers/array/findAndSplice';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import filterChatPhotosMessages from '../helpers/filterChatPhotosMessages';
import ListenerSetter from '../helpers/listenerSetter';
import ListLoader from '../helpers/listLoader';
import {fastRaf} from '../helpers/schedulers';
import {Message, ChatFull, MessageAction, Photo} from '../layer';
import type {AppMessagesManager} from '../lib/appManagers/appMessagesManager';
import {AppManagers} from '../lib/appManagers/managers';
import choosePhotoSize from '../lib/appManagers/utils/photos/choosePhotoSize';
import {openAvatarViewer} from './avatar';
import {putAvatar} from './putPhoto';
import Scrollable from './scrollable';
import SwipeHandler from './swipeHandler';
import wrapPhoto from './wrappers/photo';

const LOAD_NEAREST = 3;

export default class PeerProfileAvatars {
  private static BASE_CLASS = 'profile-avatars';
  private static SCALE = IS_PARALLAX_SUPPORTED ? 2 : 1;
  private static TRANSLATE_TEMPLATE = IS_PARALLAX_SUPPORTED ? `translate3d({x}, 0, -1px) scale(${PeerProfileAvatars.SCALE})` : 'translate({x}, 0)';
  public container: HTMLElement;
  public avatars: HTMLElement;
  public gradient: HTMLElement;
  public info: HTMLElement;
  public arrowPrevious: HTMLElement;
  public arrowNext: HTMLElement;
  private tabs: HTMLDivElement;
  private listLoader: ListLoader<Photo.photo['id'] | Message.messageService, Photo.photo['id'] | Message.messageService>;
  private peerId: PeerId;
  private intersectionObserver: IntersectionObserver;
  private loadCallbacks: Map<Element, () => void>;
  private listenerSetter: ListenerSetter;
  private swipeHandler: SwipeHandler;

  constructor(
    public scrollable: Scrollable,
    private managers: AppManagers
  ) {
    this.container = document.createElement('div');
    this.container.classList.add(PeerProfileAvatars.BASE_CLASS + '-container');

    this.avatars = document.createElement('div');
    this.avatars.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatars');

    this.gradient = document.createElement('div');
    this.gradient.classList.add(PeerProfileAvatars.BASE_CLASS + '-gradient');

    this.info = document.createElement('div');
    this.info.classList.add(PeerProfileAvatars.BASE_CLASS + '-info');

    this.tabs = document.createElement('div');
    this.tabs.classList.add(PeerProfileAvatars.BASE_CLASS + '-tabs');

    this.arrowPrevious = document.createElement('div');
    this.arrowPrevious.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow', 'tgico-avatarprevious');

    /* const previousIcon = document.createElement('i');
    previousIcon.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow-icon', 'tgico-previous');
    this.arrowBack.append(previousIcon); */

    this.arrowNext = document.createElement('div');
    this.arrowNext.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow', PeerProfileAvatars.BASE_CLASS + '-arrow-next', 'tgico-avatarnext');

    /* const nextIcon = document.createElement('i');
    nextIcon.classList.add(PeerProfileAvatars.BASE_CLASS + '-arrow-icon', 'tgico-next');
    this.arrowNext.append(nextIcon); */

    this.container.append(this.avatars, this.gradient, this.info, this.tabs, this.arrowPrevious, this.arrowNext);

    this.loadCallbacks = new Map();
    this.listenerSetter = new ListenerSetter();

    const checkScrollTop = () => {
      if(this.scrollable.scrollTop !== 0) {
        this.scrollable.scrollIntoViewNew({
          element: this.scrollable.container.firstElementChild as HTMLElement,
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

        // this.avatars.classList.remove('no-transition');
        // fastRaf(() => {
        this.avatars.classList.add('no-transition');
        void this.avatars.offsetLeft; // reflow

        let distance: number;
        if(this.listLoader.index === 0 && !toRight) distance = this.listLoader.count - 1;
        else if(this.listLoader.index === (this.listLoader.count - 1) && toRight) distance = -(this.listLoader.count - 1);
        else distance = toRight ? 1 : -1;
        this.listLoader.go(distance);

        fastRaf(() => {
          this.avatars.classList.remove('no-transition');
        });
        // });
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

  public async setPeer(peerId: PeerId) {
    this.peerId = peerId;

    const photo = await this.managers.appPeersManager.getPeerPhoto(peerId);
    if(!photo) {
      return;
    }

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

            filterChatPhotosMessages(value);

            if(!listLoader.current) {
              const chatFull = result[0];
              const message = findAndSplice(value.messages, (message) => {
                return ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo.id === chatFull.chat_photo.id;
              }) as Message.messageService;

              listLoader.current = message || await this.managers.appMessagesManager.generateFakeAvatarMessage(this.peerId, chatFull.chat_photo);
            }

            // console.log('avatars loaded:', value);
            return {
              count: value.count,
              items: value.messages
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

        const activeTab = this.tabs.querySelector('.active');
        if(activeTab) activeTab.classList.remove('active');

        const tab = this.tabs.children[id] as HTMLElement;
        tab.classList.add('active');

        this.loadNearestToTarget(this.avatars.children[id]);
      }
    });

    if(photo._ === 'userProfilePhoto') {
      listLoader.current = photo.photo_id;
    }

    await this.processItem(listLoader.current);

    // listLoader.loaded
    listLoader.load(true);
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
    const avatar = document.createElement('div');
    avatar.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar', 'media-container', 'hide');

    this.avatars.append(avatar);

    let photo: Photo.photo;
    if(photoId) {
      photo = typeof(photoId) !== 'object' ?
        await this.managers.appPhotosManager.getPhoto(photoId) :
        (photoId.action as MessageAction.messageActionChannelEditPhoto).photo as Photo.photo;
    }

    const img = new Image();
    img.classList.add('avatar-photo');
    img.draggable = false;

    const loadCallback = async() => {
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
        const photo = await this.managers.appPeersManager.getPeerPhoto(this.peerId);
        await putAvatar(avatar, this.peerId, photo, 'photo_big', img);
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

  public cleanup() {
    this.listenerSetter.removeAll();
    this.swipeHandler.removeListeners();
    this.intersectionObserver?.disconnect();
  }
}
