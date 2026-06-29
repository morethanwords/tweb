import type {AppMessagesManager} from '@appManagers/appMessagesManager';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import findAndSplice from '@helpers/array/findAndSplice';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import filterChatPhotosMessages from '@helpers/filterChatPhotosMessages';
import ListenerSetter from '@helpers/listenerSetter';
import ListLoader from '@helpers/listLoader';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {fastRaf} from '@helpers/schedulers';
import {Message, ChatFull, MessageAction, Photo, User, ChatPhoto, UserFull} from '@layer';
import {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import {avatarNew, wrapPhotoToAvatar} from '@components/avatarNew';
import animationIntersector from '@components/animationIntersector';
import Scrollable from '@components/scrollable';
import SwipeHandler from '@components/swipeHandler';
import wrapPhoto from '@components/wrappers/photo';
import openAvatarViewer from '@components/openAvatarViewer';
import Icon from '@components/icon';
import apiManagerProxy from '@lib/apiManagerProxy';
import {createEffect, createRoot, on} from 'solid-js';
import {usePeerProfileAppearance} from '@hooks/useProfileColors';
import {getHexColorFromTelegramColor} from '@helpers/color';
import wrapEmojiPattern from '@components/wrappers/emojiPattern';
import {useCollapsable} from '@hooks/useCollapsable';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import useIsNightTheme from '@hooks/useIsNightTheme';
import customProperties from '@helpers/dom/customProperties';
import findUpClassName from '@helpers/dom/findUpClassName';
import {getOverlayRoot} from '@helpers/appWindow';
import {changeTitleEmojiColor} from '@components/peerTitle';
import ProgressivePreloader from '@components/preloader';
import {avatarUploads} from '@stores/avatarUpload';

const LOAD_NEAREST = 3;
export const SHOW_NO_AVATAR = true;

export default class PeerProfileAvatars {
  private static BASE_CLASS = 'profile-avatars';
  private static SCALE = 1;
  private static TRANSLATE_TEMPLATE = 'translate({x}, 0)';
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
  private videoProgressRAF: number;
  private fold: () => void;
  private uploadInProgress: boolean;
  private uploadPreloader: ProgressivePreloader;
  // The public (fallback) photo, appended at the END of the carousel on the
  // self profile. Resolved id + a once-guard so it's added on exactly one page.
  private fallbackPhotoId: Photo.photo['id'];
  private fallbackAppended: boolean;
  public onNeedWhiteChanged: (needWhite: boolean) => void;

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

    this.container.append(this.avatars, this.gradient, this.gradientTop, this.tabs, this.arrowPrevious, this.arrowNext, this.info);

    this.loadCallbacks = new Map();
    this.listenerSetter = new ListenerSetter();

    // An avatar video fires 'play' when it (re)starts — e.g. when the right
    // sidebar is reopened (animationIntersector.toggleVideosUnder resumes it) or
    // it's scrolled back into view. 'play' doesn't bubble, so capture it on the
    // container to wake the progress loop, which self-suspends (see the tick)
    // whenever the active video is paused so it isn't churning rAF for nothing.
    // Scope to avatar videos — other <video>s appended into the container (pinned
    // gifts, story previews) shouldn't wake the loop.
    this.listenerSetter.add(this.container)('play', (e) => {
      if((e.target as HTMLElement)?.classList?.contains('avatar-video') && !this.videoProgressRAF) {
        this.startVideoProgressLoop();
      }
    }, {capture: true});

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
      if(
        findUpClassName(_e.target, 'profile-subtitle-rating') ||
        findUpClassName(_e.target, 'emoji-status')
      ) {
        return;
      }

      if(freeze) {
        cancelEvent(_e);
        return;
      }

      if(cancel) {
        cancel = false;
        return;
      }

      // While an avatar upload is running the header stays collapsed and locked;
      // let clicks fall through to the cancel preloader instead of expanding.
      if(this.uploadInProgress) {
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
        // The viewer's own loader owns the public (fallback) photo — it keeps it
        // last and never paginates from it. Don't pass it through here, or it
        // would be re-anchored (duplicates) / no longer last in the viewer.
        const nextTargets = targets.slice(this.listLoader.previous.length + 1)
        .filter((target) => target.item !== this.fallbackPhotoId);

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
      getOverlayRoot().addEventListener(IS_TOUCH_SUPPORTED ? 'touchend' : 'click', (e) => {
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
      fastRaf(this.updateHeaderFilled);
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
        disableHoverWhenFolded: false,
        // Don't let wheel/swipe expand the header while an avatar upload runs.
        shouldIgnore: () => this.uploadInProgress
      });

      this.unfold = unfold;
      this.fold = fold;

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

    // Resolve the public (fallback) photo to append at the END of the carousel.
    // Only on the user's own profile (fallback_photo is a self concept), and
    // only when they have avatars. getProfile is normally already cached here.
    this.fallbackPhotoId = undefined;
    this.fallbackAppended = false;
    if(peerId === rootScope.myId && peerId.isUser() && !this.hasNoPhoto) {
      const userFull = await this.managers.appProfileManager.getProfile(peerId.toUserId());
      const fallback = (userFull as UserFull.userFull)?.fallback_photo as Photo.photo;
      if(fallback?._ === 'photo') this.fallbackPhotoId = fallback.id;
    }

    const listLoader: PeerProfileAvatars['listLoader'] = this.listLoader = new ListLoader({
      loadCount: 50,
      loadMore: (anchor, older, loadCount) => {
        if(!older) return Promise.resolve({count: undefined, items: []});

        if(peerId.isUser()) {
          const maxId: Photo.photo['id'] = anchor as any;
          return this.managers.appPhotosManager.getUserPhotos(peerId, maxId, loadCount).then((value) => {
            const items = value.photos.slice();
            let count = value.count;
            if(this.fallbackPhotoId) {
              // The public photo is one extra item beyond the real ones.
              if(count !== undefined) count += 1;
              // Append it once, on the last page (a short page = the end).
              if(!this.fallbackAppended && value.photos.length < loadCount) {
                items.push(this.fallbackPhotoId);
                this.fallbackAppended = true;
              }
            }

            return {count, items};
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
              const chatPhoto = chatFull?.chat_photo;
              const message = findAndSplice(messages, (message) => {
                return ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo.id === chatPhoto?.id;
              }) as Message.messageService;

              listLoader.current = message || (chatPhoto && await this.managers.appMessagesManager.generateFakeAvatarMessage(this.peerId, chatPhoto));
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

        // The active item changed — wake the (possibly self-suspended) progress
        // loop so the newly-active video's tab fill updates even if it was
        // already playing and so didn't fire a fresh 'play' event.
        if(!this.videoProgressRAF) this.startVideoProgressLoop();
      }
    });

    if(photo?._ === 'userProfilePhoto') {
      listLoader.current = photo.photo_id;
    }

    await this.processItem(listLoader.current);

    // listLoader.loaded
    listLoader.load(true);

    // Only run the per-frame tab-progress loop when the current photo is an
    // animated (video) avatar. For static photos it has nothing to do, and a
    // forever-running rAF needlessly churns the rendering pipeline every frame
    // (which can visibly interfere with the avatar's load fade-in).
    if((photo as ChatPhoto.chatPhoto)?.pFlags?.has_video) {
      this.startVideoProgressLoop();
    }
    this.watchAvatarUpload();
  }

  // Watches the per-peer avatar-upload store; while an upload for THIS peer is in
  // flight, collapse the header, lock expansion and show a cancellable progress
  // ring centered on the avatar.
  private watchAvatarUpload() {
    const middleware = this.middlewareHelper.get();
    createRoot((dispose) => {
      middleware.onDestroy(() => {
        dispose();
        this.hideUploadProgress();
      });

      createEffect(() => {
        const entry = avatarUploads().get(this.peerId);
        if(entry) this.showUploadProgress(entry.promise);
        else this.hideUploadProgress();
      });
    });
  }

  private showUploadProgress(promise: CancellablePromise<any>) {
    if(this.uploadInProgress) return;
    this.uploadInProgress = true;
    this.container.classList.add('is-avatar-uploading');

    // Force the header collapsed (shouldIgnore + the click guard keep it there).
    this.fold?.();

    if(!this.uploadPreloader) {
      this.uploadPreloader = new ProgressivePreloader({
        isUpload: true,
        cancelable: true,
        tryAgainOnFail: false
      });
    }

    const target = this.fakeAvatar?.node || this.container;
    this.uploadPreloader.attach(target, true, promise);
  }

  private hideUploadProgress() {
    if(!this.uploadInProgress) return;
    this.uploadInProgress = false;
    this.container.classList.remove('is-avatar-uploading');
    this.uploadPreloader?.detach();
  }

  // Drives the active .profile-avatars-tab fill from the playing video avatar's
  // currentTime, reusing the stories progress-bar mechanism (--progress + a
  // bright :before fill) while keeping the profile tab styling.
  private startVideoProgressLoop() {
    cancelAnimationFrame(this.videoProgressRAF);
    // Tie the loop to this setPeer's middleware: it becomes invalid on the next
    // setPeer (middlewareHelper.clean) or on cleanup(), so a previous profile's
    // loop can't leak and churn the DOM while the next profile loads. Robust to
    // transient DOM detachment (unlike an isConnected check).
    const middleware = this.middlewareHelper.get();
    const tick = () => {
      if(!middleware()) {
        this.videoProgressRAF = 0;
        return;
      }
      // Suspend the loop the moment the active video stops advancing (paused
      // because the right bar is closed / scrolled off / idle / lite-mode) —
      // there's nothing to animate, so don't keep churning rAF every frame. The
      // captured 'play' listener restarts it when the video resumes.
      if(!this.updateActiveTabProgress()) {
        this.videoProgressRAF = 0;
        return;
      }
      this.videoProgressRAF = requestAnimationFrame(tick);
    };
    this.videoProgressRAF = requestAnimationFrame(tick);
  }

  // Returns whether the active avatar video is currently playing (so the rAF
  // progress loop knows whether it's still worth running).
  private updateActiveTabProgress() {
    const activeIndex = this.listLoader?.index ?? 0;
    const tabs = this.tabs.children;
    const avatars = this.avatars.children;
    let activePlaying = false;
    for(let i = 0; i < tabs.length; ++i) {
      const tab = tabs[i] as HTMLElement;
      const avatar = avatars[i] as HTMLElement;
      let video = avatar?.querySelector('video.avatar-video') as HTMLVideoElement;
      // The first carousel item mirrors the current profile photo, which the
      // (reliably loaded) fake/main avatar already plays — fall back to it.
      if(!video && i === 0) {
        video = this.fakeAvatar?.node.querySelector('video.avatar-video') as HTMLVideoElement;
      }
      const isPlaying = tab.classList.contains('is-playing');
      if(i === activeIndex && video && video.duration && !video.paused) {
        activePlaying = true;
        // Only touch the DOM when something actually changed — re-asserting the
        // class / style every animation frame churns the header (style recalc +
        // paint) for nothing and can flicker the loading avatar underneath.
        if(!isPlaying) tab.classList.add('is-playing');
        const value = Math.min(100, (video.currentTime / video.duration) * 100).toFixed(1) + '%';
        if(tab.style.getPropertyValue('--progress') !== value) {
          tab.style.setProperty('--progress', value);
        }
      } else if(isPlaying) {
        tab.classList.remove('is-playing');
        tab.style.removeProperty('--progress');
      }
    }

    return activePlaying;
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

    const peerProfileAppearance = usePeerProfileAppearance(this.peerId);
    const deferred = deferredPromise<void>();
    createEffect(() => {
      const {bgColors, backgroundEmojiId} = peerProfileAppearance()
      // const docId = '5301072507598550489';

      setBackgroundColors(bgColors);
      this.setCollapsed(this.isCollapsed());

      const isNightTheme = useIsNightTheme();
      createEffect(on(
        isNightTheme,
        () => {
          const promise = renderBackgroundEmoji(backgroundEmojiId, !!bgColors);
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
        isBig: true,
        // Show the cached small thumb first, then the big — but DON'T fade the
        // big in. On first open photo_big isn't cached anywhere, so its fade-in
        // animation makes the avatar's colour gradient show through (the
        // "blink"). No fade => the big just swaps over the small instantly.
        noFadeIn: true
        // size: isFirst ? 120 : 'full',
        // withStories: isFirst
      });

      if(isFirst) {
        avatarElem.node.classList.add('profile-avatars-avatar-first');
      }

      // The first carousel item IS the peer's current avatar, which the chat
      // list already cached (inputPeerPhotoFileLocation). Render it via the
      // cached-avatar path so it shows INSTANTLY on open/navigation instead of
      // flashing the solid colour placeholder while the full photo
      // (inputPhotoFileLocation, uncached) downloads. Older photos still go
      // through wrapPhoto.
      if(photo && !isFirst) {
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
      this.onNeedWhiteChanged?.(needWhite);
      changeTitleEmojiColor(this.info, needWhite ? 'white' : 'primary-color');
    }
    this.updateHeaderFilled();
  }

  private isCollapsed() {
    return this.setCollapsedOn.classList.contains('is-collapsed');
  }

  updateHeaderFilled = () => {
    this.setCollapsedOn.classList.toggle(
      'header-filled',
      (!this.hasBackgroundColor && this.isCollapsed() && this.scrollable.scrollPosition >= 5) ||
        this.scrollable.scrollPosition >= 200
    );
  }

  public cleanup() {
    cancelAnimationFrame(this.videoProgressRAF);
    // Release the avatar videos we registered with the intersector. While the
    // right sidebar was closed, toggleVideosUnder may have LOCKED them, and a
    // locked item is NOT auto-removed when it leaves the DOM (checkAnimation
    // early-returns on locked) — so unregister + free the decoder explicitly.
    this.container.querySelectorAll<HTMLVideoElement>('video.avatar-video').forEach((video) => {
      animationIntersector.removeAnimationByPlayer(video);
      video.pause();
      video.src = '';
      video.load();
    });
    this.listenerSetter.removeAll();
    this.swipeHandler.removeListeners();
    this.intersectionObserver?.disconnect();
    this.middlewareHelper.destroy();
  }
}
