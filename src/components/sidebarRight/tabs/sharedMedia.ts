/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager from "../../../lib/appManagers/appImManager";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager, { User } from "../../../lib/appManagers/appUsersManager";
import { logger } from "../../../lib/logger";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AppSearchSuper, { SearchSuperType } from "../../appSearchSuper.";
import AvatarElement from "../../avatar";
import SidebarSlider, { SliderSuperTab } from "../../slider";
import CheckboxField from "../../checkboxField";
import { attachClickEvent, replaceContent, whichChild } from "../../../helpers/dom";
import appSidebarRight from "..";
import { TransitionSlider } from "../../transition";
import appNotificationsManager from "../../../lib/appManagers/appNotificationsManager";
import AppEditGroupTab from "./editGroup";
import PeerTitle from "../../peerTitle";
import AppEditChannelTab from "./editChannel";
import AppEditContactTab from "./editContact";
import appChatsManager, { Channel } from "../../../lib/appManagers/appChatsManager";
import { Chat, UserProfilePhoto } from "../../../layer";
import Button from "../../button";
import ButtonIcon from "../../buttonIcon";
import I18n, { i18n, LangPackKey } from "../../../lib/langPack";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import { copyTextToClipboard } from "../../../helpers/clipboard";
import { toast } from "../../toast";
import { fastRaf } from "../../../helpers/schedulers";
import { safeAssign } from "../../../helpers/object";
import { forEachReverse } from "../../../helpers/array";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import renderImageFromUrl from "../../../helpers/dom/renderImageFromUrl";
import SwipeHandler from "../../swipeHandler";
import { MOUNT_CLASS_TO } from "../../../config/debug";
import AppAddMembersTab from "../../sidebarLeft/tabs/addMembers";
import PopupPickUser from "../../popups/pickUser";
import PopupPeer from "../../popups/peer";

let setText = (text: string, row: Row) => {
  fastRaf(() => {
    row.title.innerHTML = text;
    row.container.style.display = '';
  });
};

type ListLoaderResult<T> = {count: number, items: any[]};
class ListLoader<T> {
  public current: T;
  public previous: T[] = [];
  public next: T[] = [];
  public count: number;

  public tempId = 0;
  public loadMore: (anchor: T, older: boolean) => Promise<ListLoaderResult<T>>;
  public processItem: (item: any) => false | T;
  public onJump: (item: T, older: boolean) => void;
  public loadCount = 50;
  public reverse = false; // reverse means next = higher msgid

  public loadedAllUp = false;
  public loadedAllDown = false;
  public loadPromiseUp: Promise<void>;
  public loadPromiseDown: Promise<void>;

  constructor(options: {
    loadMore: ListLoader<T>['loadMore'],
    loadCount: ListLoader<T>['loadCount'],
    processItem?: ListLoader<T>['processItem'],
    onJump: ListLoader<T>['onJump'],
  }) {
    safeAssign(this, options);


  }

  get index() {
    return this.count !== undefined ? this.previous.length : -1;
  }

  public go(length: number) {
    let items: T[], item: T;
    if(length > 0) {
      items = this.next.splice(0, length);
      item = items.pop();
      if(!item) {
        return;
      }

      this.previous.push(this.current, ...items);
    } else {
      items = this.previous.splice(this.previous.length + length, -length);
      item = items.shift();
      if(!item) {
        return;
      }

      this.next.unshift(...items, this.current);
    }

    this.current = item;
    this.onJump(item, length > 0);
  }

  public load(older: boolean) {
    if(older && this.loadedAllDown) return Promise.resolve();
    else if(!older && this.loadedAllUp) return Promise.resolve();

    if(older && this.loadPromiseDown) return this.loadPromiseDown;
    else if(!older && this.loadPromiseUp) return this.loadPromiseUp;

    /* const loadCount = 50;
    const backLimit = older ? 0 : loadCount; */
  
    let anchor: T;
    if(older) {
      anchor = this.reverse ? this.previous[0] : this.next[this.next.length - 1];
    } else {
      anchor = this.reverse ? this.next[this.next.length - 1] : this.previous[0];
    }

    const promise = this.loadMore(anchor, older).then(result => {
      if(result.items.length < this.loadCount) {
        if(older) this.loadedAllDown = true;
        else this.loadedAllUp = true;
      }

      if(this.count === undefined) {
        this.count = result.count || result.items.length;
      }

      const method = older ? result.items.forEach.bind(result.items) : forEachReverse.bind(null, result.items);
      method((item: any) => {
        const processed = this.processItem ? this.processItem(item) : item;

        if(!processed) return;

        if(older) {
          if(this.reverse) this.previous.unshift(processed);
          else this.next.push(processed);
        } else {
          if(this.reverse) this.next.push(processed);
          else this.previous.unshift(processed);
        }
      });
    }, () => {}).then(() => {
      if(older) this.loadPromiseDown = null;
      else this.loadPromiseUp = null;
    });

    if(older) this.loadPromiseDown = promise;
    else this.loadPromiseUp = promise;

    return promise;
  }
}

class PeerProfileAvatars {
  public static BASE_CLASS = 'profile-avatars';
  public container: HTMLElement;
  public avatars: HTMLElement;
  //public gradient: HTMLElement;
  public info: HTMLElement;
  public tabs: HTMLDivElement;
  public listLoader: ListLoader<string>;
  public peerId: number;

  constructor() {
    this.container = document.createElement('div');
    this.container.classList.add(PeerProfileAvatars.BASE_CLASS + '-container');

    this.avatars = document.createElement('div');
    this.avatars.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatars');

    //this.gradient = document.createElement('div');
    //this.gradient.classList.add(PeerProfileAvatars.BASE_CLASS + '-gradient');

    this.info = document.createElement('div');
    this.info.classList.add(PeerProfileAvatars.BASE_CLASS + '-info');

    this.tabs = document.createElement('div');
    this.tabs.classList.add(PeerProfileAvatars.BASE_CLASS + '-tabs');

    this.container.append(this.avatars, /* this.gradient,  */this.info, this.tabs);

    let cancel = false;
    attachClickEvent(this.container, (_e) => {
      if(cancel) {
        cancel = false;
        return;
      }

      const rect = this.container.getBoundingClientRect();

      const e = (_e as TouchEvent).touches ? (_e as TouchEvent).touches[0] : _e as MouseEvent;
      const x = e.pageX;

      const centerX = rect.right - (rect.width / 2);
      const toRight = x > centerX;

      // this.avatars.classList.remove('no-transition');
      // fastRaf(() => {
        this.listLoader.go(toRight ? 1 : -1);
      // });
    });

    let width = 0, x = 0, lastDiffX = 0, lastIndex = 0, minX = 0;
    const swipeHandler = new SwipeHandler({
      element: this.avatars, 
      onSwipe: (xDiff, yDiff) => {
        lastDiffX = xDiff;
        let lastX = x + xDiff * -2;
        if(lastX > 0) lastX = 0;
        else if(lastX < minX) lastX = minX;

        this.avatars.style.transform = `translate3d(${lastX}px, 0, -1px) scale(2)`;
        //console.log(xDiff, yDiff);
        return false;
      }, 
      verifyTouchTarget: (e) => {
        if(this.tabs.classList.contains('hide')) {
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
        
        this.avatars.style.transform = `translate3d(${x}px, 0, -1px) scale(2)`;

        this.avatars.classList.add('no-transition');
        void this.avatars.offsetLeft; // reflow
      },
      onReset: () => {
        const addIndex = Math.ceil(Math.abs(lastDiffX) / (width / 2)) * (lastDiffX >= 0 ? 1 : -1);
        cancel = true;
        
        //console.log(addIndex);

        this.avatars.classList.remove('no-transition');
        fastRaf(() => {
          this.listLoader.go(addIndex);
        });
      }
    });
  }

  public setPeer(peerId: number) {
    this.peerId = peerId;

    const photo = appPeersManager.getPeerPhoto(peerId);
    if(!photo) {
      return;
    }

    const loadCount = 50;
    const listLoader: PeerProfileAvatars['listLoader'] = this.listLoader = new ListLoader<string>({
      loadCount,
      loadMore: (anchor, older) => {
        return appPhotosManager.getUserPhotos(peerId, anchor || listLoader.current, loadCount).then(result => {
          return {
            count: result.count,
            items: result.photos
          };
        });
      },
      processItem: this.processItem,
      onJump: (item, older) => {
        const id = this.listLoader.index;
        //const nextId = Math.max(0, id);
        this.avatars.style.transform = `translate3d(-${200 * id}%, 0, -1px) scale(2)`;

        const activeTab = this.tabs.querySelector('.active');
        if(activeTab) activeTab.classList.remove('active');

        const tab = this.tabs.children[id] as HTMLElement;
        tab.classList.add('active');
      }
    });

    listLoader.current = (photo as UserProfilePhoto.userProfilePhoto).photo_id;
    this.processItem(listLoader.current);

    listLoader.load(true);
  }

  public addTab() {
    const tab = document.createElement('div');
    tab.classList.add(PeerProfileAvatars.BASE_CLASS + '-tab');
    this.tabs.append(tab);

    if(this.tabs.childElementCount === 1) {
      tab.classList.add('active');
    }

    this.tabs.classList.toggle('hide', this.tabs.childElementCount <= 1);
  }

  public processItem = (photoId: string) => {
    const avatar = document.createElement('div');
    avatar.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar');

    const photo = appPhotosManager.getPhoto(photoId);
    const img = new Image();
    img.classList.add(PeerProfileAvatars.BASE_CLASS + '-avatar-image');
    img.draggable = false;

    if(photo) {
      appPhotosManager.preloadPhoto(photo, appPhotosManager.choosePhotoSize(photo, 420, 420, false)).then(() => {
        renderImageFromUrl(img, photo.url, () => {
          avatar.append(img);
        });
      });
    } else {
      const photo = appPeersManager.getPeerPhoto(this.peerId);
      appProfileManager.putAvatar(avatar, this.peerId, photo, 'photo_big', img);
    }

    this.avatars.append(avatar);

    this.addTab();

    return photoId;
  };
}

class PeerProfile {
  public element: HTMLElement;
  public avatars: PeerProfileAvatars;
  private avatar: AvatarElement;
  private section: SettingSection;
  private name: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private bio: Row;
  private username: Row;
  private phone: Row;
  private notifications: Row;
  
  private cleaned: boolean;
  private setBioTimeout: number;
  private setPeerStatusInterval: number;

  private peerId = 0;
  private threadId: number;

  public init() {
    this.init = null;

    this.element = document.createElement('div');
    this.element.classList.add('profile-content');

    this.section = new SettingSection({
      noDelimiter: true
    });

    this.avatar = new AvatarElement();
    this.avatar.classList.add('profile-avatar', 'avatar-120');
    this.avatar.setAttribute('dialog', '1');
    this.avatar.setAttribute('clickable', '');

    this.name = document.createElement('div');
    this.name.classList.add('profile-name');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('profile-subtitle');

    this.bio = new Row({
      title: ' ',
      subtitleLangKey: 'UserBio',
      icon: 'info',
      clickable: (e) => {
        if((e.target as HTMLElement).tagName === 'A') {
          return;
        }
        
        appProfileManager.getProfileByPeerId(this.peerId).then(full => {
          copyTextToClipboard(full.about);
          toast(I18n.format('BioCopied', true));
        });
      }
    });

    this.bio.title.classList.add('pre-wrap');

    this.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: () => {
        const peer: Channel | User = appPeersManager.getPeer(this.peerId);
        copyTextToClipboard('@' + peer.username);
        toast(I18n.format('UsernameCopied', true));
      }
    });

    this.phone = new Row({
      title: ' ',
      subtitleLangKey: 'Phone',
      icon: 'phone',
      clickable: () => {
        const peer: User = appUsersManager.getUser(this.peerId);
        copyTextToClipboard('+' + peer.phone);
        toast(I18n.format('PhoneCopied', true));
      }
    });

    this.notifications = new Row({
      checkboxField: new CheckboxField({text: 'Notifications'})
    });
    
    this.section.content.append(this.phone.container, this.username.container, this.bio.container, this.notifications.container);
    this.element.append(this.section.container);

    this.notifications.checkboxField.input.addEventListener('change', (e) => {
      if(!e.isTrusted) {
        return;
      }

      //let checked = this.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.on('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        const muted = appNotificationsManager.isPeerLocalMuted(this.peerId, false);
        this.notifications.checkboxField.checked = !muted;
      }
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId} = e;

      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    rootScope.on('peer_bio_edit', (peerId) => {
      if(peerId === this.peerId) {
        this.setBio(true);
      }
    });

    rootScope.on('user_update', (e) => {
      const userId = e;

      if(this.peerId === userId) {
        this.setPeerStatus();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    if(needClear) {
      this.subtitle.innerHTML = '‎'; // ! HERE U CAN FIND WHITESPACE
    }

    appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId !== this.peerId) {
        return;
      }

      this.subtitle.textContent = '';
      this.subtitle.append(subtitle || '');
    });
  };

  public cleanupHTML() {
    this.bio.container.style.display = 'none';
    this.phone.container.style.display = 'none';
    this.username.container.style.display = 'none';
    this.notifications.container.style.display = '';
    this.notifications.checkboxField.checked = true;
    if(this.setBioTimeout) {
      window.clearTimeout(this.setBioTimeout);
      this.setBioTimeout = 0;
    }
  }

  public setAvatar() {
    if(this.peerId !== rootScope.myId) {
      const photo = appPeersManager.getPeerPhoto(this.peerId);

      if(photo) {
        const oldAvatars = this.avatars;
        this.avatars = new PeerProfileAvatars();
        this.avatars.setPeer(this.peerId);
        this.avatars.info.append(this.name, this.subtitle);
  
        this.avatar.remove();
    
        if(oldAvatars) oldAvatars.container.replaceWith(this.avatars.container);
        else this.element.prepend(this.avatars.container);

        return;
      }
    }

    if(this.avatars) {
      this.avatars.container.remove();
      this.avatars = undefined;
    }

    this.avatar.setAttribute('peer', '' + this.peerId);

    this.section.content.prepend(this.avatar, this.name, this.subtitle);
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;

    this.cleanupHTML();

    this.setAvatar();

    // username
    if(peerId !== rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.username);
      }
      
      const muted = appNotificationsManager.isPeerLocalMuted(peerId, false);
      this.notifications.checkboxField.checked = !muted;
    } else {
      window.requestAnimationFrame(() => {
        this.notifications.container.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerId > 0) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerId);
      if(user.phone && peerId !== rootScope.myId) {
        setText(user.rPhone, this.phone);
      }
    }/*  else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
    } */

    this.setBio();

    replaceContent(this.name, new PeerTitle({
      peerId,
      dialog: true
    }).element);

    this.setPeerStatus(true);
  }

  public setBio(override?: true) {
    if(this.setBioTimeout) {
      window.clearTimeout(this.setBioTimeout);
      this.setBioTimeout = 0;
    }

    const peerId = this.peerId;
    const threadId = this.threadId;

    if(!peerId) {
      return;
    }

    let promise: Promise<boolean>;
    if(peerId > 0) {
      promise = appProfileManager.getProfile(peerId, override).then(userFull => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          //this.log.warn('peer changed');
          return false;
        }
        
        if(userFull.rAbout && peerId !== rootScope.myId) {
          setText(userFull.rAbout, this.bio);
        }
        
        //this.log('userFull', userFull);
        return true;
      });
    } else {
      promise = appProfileManager.getChatFull(-peerId, override).then((chatFull) => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          //this.log.warn('peer changed');
          return false;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.bio);
        }

        return true;
      });
    }

    promise.then((canSetNext) => {
      if(canSetNext) {
        this.setBioTimeout = window.setTimeout(() => this.setBio(true), 60e3);
      }
    });
  }

  public setPeer(peerId: number, threadId = 0) {
    if(this.peerId === peerId && this.threadId === peerId) return;

    if(this.init) {
      this.init();
    }

    this.peerId = peerId;
    this.threadId = threadId;
    
    this.cleaned = true;
  }
}

// TODO: отредактированное сообщение не изменится
export default class AppSharedMediaTab extends SliderSuperTab {
  private editBtn: HTMLElement;

  private peerId = 0;
  private threadId = 0;

  private historiesStorage: {
    [peerId: number]: Partial<{
      [type in SearchSuperType]: {mid: number, peerId: number}[]
    }>
  } = {};

  private searchSuper: AppSearchSuper;

  private profile: PeerProfile;

  constructor(slider: SidebarSlider) {
    super(slider, false);
  }

  public init() {
    //const perf = performance.now();

    this.container.classList.add('shared-media-container', 'profile-container');

    // * header
    const newCloseBtn = Button('btn-icon sidebar-close-button', {noRipple: true});
    this.closeBtn.replaceWith(newCloseBtn);
    this.closeBtn = newCloseBtn;

    const animatedCloseIcon = document.createElement('div');
    animatedCloseIcon.classList.add('animated-close-icon');
    newCloseBtn.append(animatedCloseIcon);

    const transitionContainer = document.createElement('div');
    transitionContainer.className = 'transition slide-fade';
    
    const transitionFirstItem = document.createElement('div');
    transitionFirstItem.classList.add('transition-item');

    this.title.append(i18n('Profile'));
    this.editBtn = ButtonIcon('edit');
    //const moreBtn = ButtonIcon('more');

    transitionFirstItem.append(this.title, this.editBtn/* , moreBtn */);

    const transitionLastItem = document.createElement('div');
    transitionLastItem.classList.add('transition-item');

    const secondTitle: HTMLElement = this.title.cloneNode() as any;
    secondTitle.append(i18n('PeerInfo.SharedMedia'));

    transitionLastItem.append(secondTitle);

    transitionContainer.append(transitionFirstItem, transitionLastItem);

    this.header.append(transitionContainer);

    // * body

    this.profile = new PeerProfile();
    this.profile.init();
    
    this.scrollable.append(this.profile.element);

    const HEADER_HEIGHT = 56;
    this.scrollable.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect(); 
      if(!rect.width) return;

      const top = rect.top;
      const isSharedMedia = top <= HEADER_HEIGHT;
      animatedCloseIcon.classList.toggle('state-back', isSharedMedia);
      transition(+isSharedMedia);

      if(!isSharedMedia) {
        this.searchSuper.cleanScrollPositions();
      }
    };

    const transition = TransitionSlider(transitionContainer, 'slide-fade', 400, null, false);

    transition(0);

    attachClickEvent(this.closeBtn, (e) => {
      if(this.closeBtn.firstElementChild.classList.contains('state-back')) {
        this.scrollable.scrollIntoViewNew(this.scrollable.container.firstElementChild as HTMLElement, 'start');
        transition(0);
        animatedCloseIcon.classList.remove('state-back');
      } else if(!this.scrollable.isHeavyAnimationInProgress) {
        appSidebarRight.onCloseBtnClick();
      }
    });

    attachClickEvent(this.editBtn, (e) => {
      let tab: AppEditGroupTab | AppEditChannelTab | AppEditContactTab;
      if(appPeersManager.isAnyGroup(this.peerId)) {
        tab = new AppEditGroupTab(appSidebarRight);
      } else if(this.peerId > 0) {
        tab = new AppEditContactTab(appSidebarRight);
      } else {
        tab = new AppEditChannelTab(appSidebarRight);
      }

      if(tab) {
        if(tab instanceof AppEditGroupTab) {
          tab.chatId = -this.peerId;
        } else {
          tab.peerId = this.peerId;
        }
        
        tab.open();
      }
    });

    //this.container.prepend(this.closeBtn.parentElement);

    this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'PeerMedia.Members',
        type: 'members'
      }, {
        inputFilter: 'inputMessagesFilterPhotoVideo',
        name: 'SharedMediaTab2',
        type: 'media'
      }, {
        inputFilter: 'inputMessagesFilterDocument',
        name: 'SharedFilesTab2',
        type: 'files'
      }, {
        inputFilter: 'inputMessagesFilterUrl',
        name: 'SharedLinksTab2',
        type: 'links'
      }, {
        inputFilter: 'inputMessagesFilterMusic',
        name: 'SharedMusicTab2',
        type: 'music'
      }, {
        inputFilter: 'inputMessagesFilterVoice',
        name: 'SharedVoiceTab2',
        type: 'voice'
      }], 
      scrollable: this.scrollable,
      onChangeTab: (mediaTab) => {
        let timeout = mediaTab.type === 'members' && rootScope.settings.animationsEnabled ? 250 : 0;
        setTimeout(() => {
          btnAddMembers.classList.toggle('is-hidden', mediaTab.type !== 'members');
        }, timeout);
      }
    });

    this.profile.element.append(this.searchSuper.container);

    const btnAddMembers = Button('btn-corner btn-circle', {icon: 'addmember_filled'});
    this.content.append(btnAddMembers);

    btnAddMembers.addEventListener('click', () => {
      const id = -this.peerId;
      const isChannel = appChatsManager.isChannel(id);

      const showConfirmation = (peerIds: number[], callback: () => void) => {
        let titleLangKey: LangPackKey = 'GroupAddMembers', descriptionLangKey: LangPackKey, descriptionLangArgs: any[];

        if(peerIds.length > 1) {
          descriptionLangKey = 'PeerInfo.Confirm.AddMembers1';
          descriptionLangArgs = [peerIds.length];
        } else {
          descriptionLangKey = 'PeerInfo.Confirm.AddMember';
          descriptionLangArgs = [new PeerTitle({
            peerId: peerIds[0],
            onlyFirstName: true
          }).element];
        }

        new PopupPeer('popup-add-members', {
          peerId: -id,
          titleLangKey,
          descriptionLangKey,
          descriptionLangArgs,
          buttons: [{
            langKey: 'Add',
            callback: () => {
              callback();
            }
          }]
        }).show();
      };
      
      if(isChannel) {
        const tab = new AppAddMembersTab(this.slider);
        tab.open({
          peerId: this.peerId,
          type: 'channel',
          skippable: false,
          takeOut: (peerIds) => {
            showConfirmation(peerIds, () => {
              tab.attachToPromise(appChatsManager.inviteToChannel(id, peerIds));
            });

            return false;
          },
          title: 'GroupAddMembers',
          placeholder: 'SendMessageTo'
        });
      } else {
        new PopupPickUser({
          peerTypes: ['contacts'],
          placeholder: 'Search',
          onSelect: (peerId) => {
            setTimeout(() => {
              showConfirmation([peerId], () => {
                appChatsManager.addChatUser(id, peerId);
              });
            }, 0);
          },
        });
      }
    });

    //console.log('construct shared media time:', performance.now() - perf);
  }

  public renderNewMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;
    
    mids = mids.slice().reverse(); // ! because it will be ascend sorted array
    for(const mediaTab of this.searchSuper.mediaTabs) {
      const inputFilter = mediaTab.inputFilter;
      const filtered = this.searchSuper.filterMessagesByType(mids.map(mid => appMessagesManager.getMessageByPeer(peerId, mid)), inputFilter);
      if(filtered.length) {
        if(this.historiesStorage[peerId][inputFilter]) {
          this.historiesStorage[peerId][inputFilter].unshift(...filtered.map(message => ({mid: message.mid, peerId: message.peerId})));
        }

        if(this.peerId === peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
          this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
          this.searchSuper.performSearchResult(filtered, mediaTab, false);
        }

        break;
      }
    }
  }

  public deleteDeletedMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;

    for(const mid of mids) {
      for(const type of this.searchSuper.mediaTabs) {
        const inputFilter = type.inputFilter;

        if(!this.historiesStorage[peerId][inputFilter]) continue;

        const history = this.historiesStorage[peerId][inputFilter];
        const idx = history.findIndex(m => m.mid === mid);
        if(idx !== -1) {
          history.splice(idx, 1);

          if(this.peerId === peerId) {
            const container = this.searchSuper.tabs[inputFilter];
            const div = container.querySelector(`div[data-mid="${mid}"][data-peer-id="${peerId}"]`);
            if(div) {
              div.remove();
            }
  
            if(this.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
              this.searchSuper.usedFromHistory[inputFilter]--;
            }
          }

          break;
        }
      }
    }

    this.scrollable.onScroll();
  }

  public cleanupHTML() {
    // const perf = performance.now();
    this.profile.cleanupHTML();
    
    this.editBtn.style.display = 'none';

    this.searchSuper.cleanupHTML(true);

    this.container.classList.toggle('can-add-members', this.searchSuper.canViewMembers() && appChatsManager.hasRights(-this.peerId, 'invite_users'));

    // console.log('cleanupHTML shared media time:', performance.now() - perf);
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  public setPeer(peerId: number, threadId = 0) {
    if(this.peerId === peerId && this.threadId === peerId) return;

    this.peerId = peerId;
    this.threadId = threadId;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.searchSuper.setQuery({
      peerId, 
      //threadId, 
      historyStorage: this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {})
    });

    this.profile.setPeer(peerId, threadId);
  }

  public fillProfileElements() {
    this.cleanupHTML();

    this.profile.fillProfileElements();

    if(this.peerId > 0) {
      if(this.peerId !== rootScope.myId && appUsersManager.isContact(this.peerId)) {
        this.editBtn.style.display = '';
      }
    } else {
      const chat: Chat = appChatsManager.getChat(-this.peerId);
      if(chat._ === 'chat' || (chat as Chat.channel).admin_rights) {
        this.editBtn.style.display = '';
      }
    }
  }

  public loadSidebarMedia(single: boolean) {
    this.searchSuper.load(single);
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.AppSharedMediaTab = AppSharedMediaTab);
