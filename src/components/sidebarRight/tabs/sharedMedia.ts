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
import Scrollable from "../../scrollable";
import SidebarSlider, { SliderSuperTab, SliderTab } from "../../slider";
import CheckboxField from "../../checkboxField";
import { attachClickEvent } from "../../../helpers/dom";
import appSidebarRight from "..";
import { TransitionSlider } from "../../transition";
import appNotificationsManager from "../../../lib/appManagers/appNotificationsManager";
import AppEditGroupTab from "./editGroup";
import PeerTitle from "../../peerTitle";
import AppEditChannelTab from "./editChannel";
import AppEditContactTab from "./editContact";
import appChatsManager, { Channel } from "../../../lib/appManagers/appChatsManager";
import { Chat } from "../../../layer";
import Button from "../../button";
import ButtonIcon from "../../buttonIcon";
import I18n, { i18n } from "../../../lib/langPack";
import { SettingSection } from "../../sidebarLeft";
import Row from "../../row";
import { copyTextToClipboard } from "../../../helpers/clipboard";
import { toast } from "../../toast";

let setText = (text: string, row: Row) => {
  window.requestAnimationFrame(() => {
    row.title.innerHTML = text;
    row.container.style.display = '';
  });
};

// TODO: отредактированное сообщение не изменится
export default class AppSharedMediaTab extends SliderSuperTab {
  public editBtn: HTMLElement;

  private peerId = 0;
  private threadId = 0;

  public profileContentEl: HTMLDivElement;
  public profileElements: {
    avatar: AvatarElement,
    name: HTMLDivElement,
    subtitle: HTMLDivElement,
    bio: Row,
    username: Row,
    phone: Row,
    notifications: Row
  } = {} as any;

  public historiesStorage: {
    [peerId: number]: Partial<{
      [type in SearchSuperType]: {mid: number, peerId: number}[]
    }>
  } = {};

  private log = logger('SM'/* , LogLevels.error */);
  setPeerStatusInterval: number;
  cleaned: boolean;
  searchSuper: AppSearchSuper;

  private setBioTimeout: number;

  constructor(slider: SidebarSlider) {
    super(slider, false);
  }

  protected init() {
    this.container.id = 'shared-media-container';
    this.container.classList.add('profile-container');

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

    this.title.append(i18n('Telegram.PeerInfoController'));
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
    
    this.profileContentEl = document.createElement('div');
    this.profileContentEl.classList.add('profile-content');

    const section = new SettingSection({
      noDelimiter: true
    });

    this.profileElements.avatar = new AvatarElement();
    this.profileElements.avatar.classList.add('profile-avatar', 'avatar-120');
    this.profileElements.avatar.setAttribute('dialog', '1');
    this.profileElements.avatar.setAttribute('clickable', '');

    this.profileElements.name = document.createElement('div');
    this.profileElements.name.classList.add('profile-name');

    this.profileElements.subtitle = document.createElement('div');
    this.profileElements.subtitle.classList.add('profile-subtitle');

    this.profileElements.bio = new Row({
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

    this.profileElements.bio.title.classList.add('pre-wrap');

    this.profileElements.username = new Row({
      title: ' ',
      subtitleLangKey: 'Username',
      icon: 'username',
      clickable: () => {
        const peer: Channel | User = appPeersManager.getPeer(this.peerId);
        copyTextToClipboard('@' + peer.username);
        toast(I18n.format('UsernameCopied', true));
      }
    });

    this.profileElements.phone = new Row({
      title: ' ',
      subtitleLangKey: 'Phone',
      icon: 'phone',
      clickable: () => {
        const peer: User = appUsersManager.getUser(this.peerId);
        copyTextToClipboard('+' + peer.phone);
        toast(I18n.format('PhoneCopied', true));
      }
    });

    this.profileElements.notifications = new Row({
      checkboxField: new CheckboxField({text: 'Notifications'})
    });
    
    section.content.append(this.profileElements.avatar, this.profileElements.name, this.profileElements.subtitle, 
      this.profileElements.bio.container, this.profileElements.username.container, this.profileElements.phone.container, this.profileElements.notifications.container);
    this.profileContentEl.append(section.container);
    this.scrollable.append(this.profileContentEl);

    const HEADER_HEIGHT = 56;
    this.scrollable.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect(); 
      if(!rect.width) return;

      const top = rect.top;
      const isSharedMedia = top <= HEADER_HEIGHT;
      animatedCloseIcon.classList.toggle('state-back', isSharedMedia);
      transition(+isSharedMedia);

      if(!isSharedMedia) {
        this.searchSuper.goingHard = {};
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

    this.profileElements.notifications.checkboxField.input.addEventListener('change', (e) => {
      if(!e.isTrusted) {
        return;
      }

      //let checked = this.profileElements.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.on('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        const muted = appNotificationsManager.isPeerLocalMuted(this.peerId, false);
        this.profileElements.notifications.checkboxField.checked = !muted;
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

    this.searchSuper = new AppSearchSuper([{
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
    }], this.scrollable/* , undefined, undefined, false */);

    this.profileContentEl.append(this.searchSuper.container);
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    if(needClear) {
      this.profileElements.subtitle.innerHTML = '‎'; // ! HERE U CAN FIND WHITESPACE
    }

    appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId !== this.peerId) {
        return;
      }

      this.profileElements.subtitle.textContent = '';
      this.profileElements.subtitle.append(subtitle || '');
    });
  };

  public renderNewMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;
    
    mids = mids.slice().reverse(); // ! because it will be ascend sorted array
    for(const type of this.searchSuper.types) {
      const inputFilter = type.inputFilter;
      const filtered = this.searchSuper.filterMessagesByType(mids.map(mid => appMessagesManager.getMessageByPeer(peerId, mid)), inputFilter);
      if(filtered.length) {
        if(this.historiesStorage[peerId][inputFilter]) {
          this.historiesStorage[peerId][inputFilter].unshift(...filtered.map(message => ({mid: message.mid, peerId: message.peerId})));
        }

        if(this.peerId === peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
          this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
          this.searchSuper.performSearchResult(filtered, inputFilter, false);
        }

        break;
      }
    }
  }

  public deleteDeletedMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;

    for(const mid of mids) {
      for(const type of this.searchSuper.types) {
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
    this.profileElements.bio.container.style.display = 'none';
    this.profileElements.phone.container.style.display = 'none';
    this.profileElements.username.container.style.display = 'none';
    this.profileElements.notifications.container.style.display = '';
    this.profileElements.notifications.checkboxField.checked = true;
    this.editBtn.style.display = 'none';
    if(this.setBioTimeout) {
      window.clearTimeout(this.setBioTimeout);
      this.setBioTimeout = 0;
    }

    this.searchSuper.cleanupHTML();
    this.searchSuper.selectTab(0, false);
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  public setPeer(peerId: number, threadId = 0) {
    if(this.peerId === peerId && this.threadId === peerId) return;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.peerId = peerId;
    this.threadId = threadId;
    this.searchSuper.setQuery({
      peerId, 
      //threadId, 
      historyStorage: this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {})
    });
    this.cleaned = true;
  }

  public loadSidebarMedia(single: boolean) {
    this.searchSuper.load(single);
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;

    this.cleanupHTML();

    this.profileElements.avatar.setAttribute('peer', '' + peerId);

    // username
    if(peerId !== rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.profileElements.username);
      }
      
      const muted = appNotificationsManager.isPeerLocalMuted(peerId, false);
      this.profileElements.notifications.checkboxField.checked = !muted;
    } else {
      window.requestAnimationFrame(() => {
        this.profileElements.notifications.container.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerId > 0) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerId);
      if(user.phone && peerId !== rootScope.myId) {
        setText(user.rPhone, this.profileElements.phone);
      }
    }/*  else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
    } */

    this.setBio();

    this.profileElements.name.innerHTML = '';
    this.profileElements.name.append(new PeerTitle({
      peerId,
      dialog: true
    }).element);
    
    if(peerId > 0) {
      if(peerId !== rootScope.myId && appUsersManager.isContact(peerId)) {
        this.editBtn.style.display = '';
      }
    } else {
      const chat: Chat = appChatsManager.getChat(-peerId);
      if(chat._ === 'chat' || (chat as Chat.channel).admin_rights) {
        this.editBtn.style.display = '';
      }
    }

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
          this.log.warn('peer changed');
          return false;
        }
        
        if(userFull.rAbout && peerId !== rootScope.myId) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
        return true;
      });
    } else {
      promise = appProfileManager.getChatFull(-peerId, override).then((chatFull) => {
        if(this.peerId !== peerId || this.threadId !== threadId) {
          this.log.warn('peer changed');
          return false;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
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

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}
