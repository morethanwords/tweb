import PARALLAX_SUPPORTED from "../environment/parallaxSupport";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import renderImageFromUrl from "../helpers/dom/renderImageFromUrl";
import filterChatPhotosMessages from "../helpers/filterChatPhotosMessages";
import ListLoader from "../helpers/listLoader";
import { fastRaf } from "../helpers/schedulers";
import { Message, ChatFull, MessageAction, Photo } from "../layer";
import appAvatarsManager from "../lib/appManagers/appAvatarsManager";
import appDownloadManager from "../lib/appManagers/appDownloadManager";
import appMessagesManager, { AppMessagesManager } from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import appProfileManager from "../lib/appManagers/appProfileManager";
import { openAvatarViewer } from "./avatar";
import Scrollable from "./scrollable";
import SwipeHandler from "./swipeHandler";

export default class PeerProfileAvatars {
  private static BASE_CLASS = 'profile-avatars';
  private static SCALE = PARALLAX_SUPPORTED ? 2 : 1;
  private static TRANSLATE_TEMPLATE = PARALLAX_SUPPORTED ? `translate3d({x}, 0, -1px) scale(${PeerProfileAvatars.SCALE})` : 'translate({x}, 0)';
  public container: HTMLElement;
  public avatars: HTMLElement;
  public gradient: HTMLElement;
  public info: HTMLElement;
  public arrowPrevious: HTMLElement;
  public arrowNext: HTMLElement;
  private tabs: HTMLDivElement;
  private listLoader: ListLoader<Photo.photo['id'] | Message.messageService, Photo.photo['id'] | Message.messageService>;
  private peerId: PeerId;

  constructor(public scrollable: Scrollable) {
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

    const checkScrollTop = () => {
      if(this.scrollable.scrollTop !== 0) {
        this.scrollable.scrollIntoViewNew(this.scrollable.container.firstElementChild as HTMLElement, 'start');
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
      if((!this.listLoader.previous.length && !this.listLoader.next.length) 
        || (clickX > (rect.width * SWITCH_ZONE) && clickX < (rect.width - rect.width * SWITCH_ZONE))) {
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
        openAvatarViewer(target, peerId, () => peerId === this.peerId, this.listLoader.current, prevTargets, nextTargets);
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
    });

    const cancelNextClick = () => {
      cancel = true;
      document.body.addEventListener(IS_TOUCH_SUPPORTED ? 'touchend' : 'click', (e) => {
        cancel = false;
      }, {once: true});
    };

    let width = 0, x = 0, lastDiffX = 0, lastIndex = 0, minX = 0;
    const swipeHandler = new SwipeHandler({
      element: this.avatars, 
      onSwipe: (xDiff, yDiff) => {
        lastDiffX = xDiff;
        let lastX = x + xDiff * -PeerProfileAvatars.SCALE;
        if(lastX > 0) lastX = 0;
        else if(lastX < minX) lastX = minX;

        this.avatars.style.transform = PeerProfileAvatars.TRANSLATE_TEMPLATE.replace('{x}', lastX + 'px');
        //console.log(xDiff, yDiff);
        return false;
      }, 
      verifyTouchTarget: (e) => {
        if(!checkScrollTop()) {
          cancelNextClick();
          cancelEvent(e);
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
        
        //console.log(addIndex);

        this.avatars.classList.remove('no-transition');
        fastRaf(() => {
          this.listLoader.go(addIndex);
          this.container.classList.remove('is-swiping');
        });
      }
    });
  }

  public setPeer(peerId: PeerId) {
    this.peerId = peerId;

    const photo = appPeersManager.getPeerPhoto(peerId);
    if(!photo) {
      return;
    }

    const listLoader: PeerProfileAvatars['listLoader'] = this.listLoader = new ListLoader({
      loadCount: 50,
      loadMore: (anchor, older, loadCount) => {
        if(!older) return Promise.resolve({count: undefined, items: []});

        if(peerId.isUser()) {
          const maxId: Photo.photo['id'] = (anchor || listLoader.current) as any;
          return appPhotosManager.getUserPhotos(peerId, maxId, loadCount).then(value => {
            return {
              count: value.count,
              items: value.photos
            };
          });
        } else {
          const promises: [Promise<ChatFull>, ReturnType<AppMessagesManager['getSearch']>] = [] as any;
          if(!listLoader.current) {
            promises.push(appProfileManager.getChatFull(peerId.toChatId()));
          }
          
          promises.push(appMessagesManager.getSearch({
            peerId,
            maxId: Number.MAX_SAFE_INTEGER,
            inputFilter: {
              _: 'inputMessagesFilterChatPhotos'
            },
            limit: loadCount,
            backLimit: 0
          }));

          return Promise.all(promises).then((result) => {
            const value = result.pop() as typeof result[1];

            filterChatPhotosMessages(value);

            if(!listLoader.current) {
              const chatFull = result[0];
              const message = value.history.findAndSplice(m => {
                return ((m as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo.id === chatFull.chat_photo.id;
              }) as Message.messageService;
              
              listLoader.current = message || appMessagesManager.generateFakeAvatarMessage(this.peerId, chatFull.chat_photo);
            }

            //console.log('avatars loaded:', value);
            return {
              count: value.count,
              items: value.history
            };
          });
        }
      },
      processItem: this.processItem,
      onJump: (item, older) => {
        const id = this.listLoader.index;
        //const nextId = Math.max(0, id);
        const x = 100 * PeerProfileAvatars.SCALE * id;
        this.avatars.style.transform = PeerProfileAvatars.TRANSLATE_TEMPLATE.replace('{x}', `-${x}%`);

        const activeTab = this.tabs.querySelector('.active');
        if(activeTab) activeTab.classList.remove('active');

        const tab = this.tabs.children[id] as HTMLElement;
        tab.classList.add('active');
      }
    });

    if(photo._ === 'userProfilePhoto') {
      listLoader.current = photo.photo_id;
    }

    this.processItem(listLoader.current);

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

  public processItem = (photoId: Photo.photo['id'] | Message.messageService) => {
    const avatar = document.createElement('div');
    avatar.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar');

    let photo: Photo.photo;
    if(photoId) {
      photo = typeof(photoId) !== 'object' ? 
        appPhotosManager.getPhoto(photoId) : 
        (photoId.action as MessageAction.messageActionChannelEditPhoto).photo as Photo.photo;
    }

    const img = new Image();
    img.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar-image');
    img.draggable = false;

    if(photo) {
      const size = appPhotosManager.choosePhotoSize(photo, 420, 420, false);
      appPhotosManager.preloadPhoto(photo, size).then(() => {
        const cacheContext = appDownloadManager.getCacheContext(photo, size.type);
        renderImageFromUrl(img, cacheContext.url, () => {
          avatar.append(img);
        });
      });
    } else {
      const photo = appPeersManager.getPeerPhoto(this.peerId);
      appAvatarsManager.putAvatar(avatar, this.peerId, photo, 'photo_big', img);
    }

    this.avatars.append(avatar);

    this.addTab();

    return photoId;
  };
}
