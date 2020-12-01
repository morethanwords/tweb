import type { AppChatsManager, Channel } from "../../lib/appManagers/appChatsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppSidebarRight } from "../sidebarRight";
import type Chat from "./chat";
import { findUpClassName, cancelEvent, attachClickEvent } from "../../helpers/dom";
import mediaSizes, { ScreenSize } from "../../helpers/mediaSizes";
import { isSafari } from "../../helpers/userAgent";
import rootScope from "../../lib/rootScope";
import AvatarElement from "../avatar";
import Button from "../button";
import ButtonIcon from "../buttonIcon";
import ButtonMenuToggle from "../buttonMenuToggle";
import ChatAudio from "./audio";
import ChatPinnedMessage from "./pinnedMessage";
import ChatSearch from "./search";
import { ButtonMenuItemOptions } from "../buttonMenu";
import ListenerSetter from "../../helpers/listenerSetter";

export default class ChatTopbar {
  container: HTMLDivElement;
  btnBack: HTMLButtonElement;
  chatInfo: HTMLDivElement;
  avatarElement: AvatarElement;
  title: HTMLDivElement;
  subtitle: HTMLDivElement;
  chatUtils: HTMLDivElement;
  btnJoin: HTMLButtonElement;
  btnMute: HTMLButtonElement;
  btnSearch: HTMLButtonElement;
  btnMore: HTMLButtonElement;
  
  public chatAudio: ChatAudio;
  public pinnedMessage: ChatPinnedMessage;

  private setUtilsRAF: number;
  public peerID: number;
  private setPeerStatusInterval: number;

  public listenerSetter: ListenerSetter;

  constructor(private chat: Chat, private appSidebarRight: AppSidebarRight, private appMessagesManager: AppMessagesManager, private appPeersManager: AppPeersManager, private appChatsManager: AppChatsManager, private appUsersManager: AppUsersManager, private appProfileManager: AppProfileManager) {
    this.chat.log.error('Topbar construction');

    this.listenerSetter = new ListenerSetter();
    
    this.container = document.createElement('div');
    this.container.classList.add('sidebar-header', 'topbar');

    this.btnBack = ButtonIcon('back sidebar-close-button', {noRipple: true});

    // * chat info section
    this.chatInfo = document.createElement('div');
    this.chatInfo.classList.add('chat-info');

    const person = document.createElement('div');
    person.classList.add('person');

    this.avatarElement = new AvatarElement();
    this.avatarElement.setAttribute('dialog', '1');
    this.avatarElement.setAttribute('clickable', '');

    const content = document.createElement('div');
    content.classList.add('content');

    const top = document.createElement('div');
    top.classList.add('top');

    this.title = document.createElement('div');
    this.title.classList.add('user-title');

    top.append(this.title);

    const bottom = document.createElement('div');
    bottom.classList.add('bottom');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('info');

    bottom.append(this.subtitle);

    content.append(top, bottom);
    person.append(this.avatarElement, content);
    this.chatInfo.append(person);

    // * chat utils section
    this.chatUtils = document.createElement('div');
    this.chatUtils.classList.add('chat-utils');

    this.chatAudio = new ChatAudio(this, this.chat, this.appMessagesManager, this.appPeersManager);

    this.btnJoin = Button('btn-primary chat-join hide');
    this.btnJoin.append('SUBSCRIBE');

    this.btnMute = ButtonIcon('mute');
    this.btnSearch = ButtonIcon('search');
    const menuButtons: (ButtonMenuItemOptions & {verify: () => boolean})[] = [{
      icon: 'search',
      text: 'Search',
      onClick: () => {
        new ChatSearch(this, this.chat);
      },
      verify: () => mediaSizes.isMobile
    }, {
      icon: 'mute',
      text: 'Mute',
      onClick: () => {
        this.appMessagesManager.mutePeer(this.peerID);
      },
      verify: () => rootScope.myID != this.peerID && !this.appMessagesManager.isPeerMuted(this.peerID)
    }, {
      icon: 'unmute',
      text: 'Unmute',
      onClick: () => {
        this.appMessagesManager.mutePeer(this.peerID);
      },
      verify: () => rootScope.myID != this.peerID && this.appMessagesManager.isPeerMuted(this.peerID)
    }, {
      icon: 'delete danger',
      text: 'Delete and Leave',
      onClick: () => {},
      verify: () => true
    }];
    //menuButtons.forEach(b => b.options = {listenerSetter: this.listenerSetter});
    this.btnMore = ButtonMenuToggle({listenerSetter: this.listenerSetter}, 'bottom-left', menuButtons, () => {
      menuButtons.forEach(button => {
        button.element.classList.toggle('hide', !button.verify());
      });
    });

    this.chatUtils.append(this.chatAudio.divAndCaption.container, this.btnJoin, this.btnMute, this.btnSearch, this.btnMore);

    this.container.append(this.btnBack, this.chatInfo, this.chatUtils);

    // * construction end

    // * fix topbar overflow section

    this.listenerSetter.add(window, 'resize', this.onResize);
    mediaSizes.addListener('changeScreen', this.onChangeScreen);

    this.pinnedMessage = new ChatPinnedMessage(this, this.chat, this.appMessagesManager, this.appPeersManager);

    this.listenerSetter.add(this.container, 'click', (e) => {
      const pinned: HTMLElement = findUpClassName(e.target, 'pinned-container');
      if(pinned) {
        cancelEvent(e);
        
        const mid = +pinned.dataset.mid;
        if(pinned.classList.contains('pinned-message')) {
          this.pinnedMessage.followPinnedMessage(mid);
        } else {
          const message = this.appMessagesManager.getMessage(mid);
  
          this.chat.setPeer(message.peerID, mid);
        }
      } else {
        this.appSidebarRight.toggleSidebar(true);
      }
    });

    this.listenerSetter.add(this.btnBack, 'click', (e) => {
      cancelEvent(e);
      this.chat.appImManager.setPeer(0);
    });

    this.listenerSetter.add(this.btnSearch, 'click', (e) => {
      cancelEvent(e);
      if(this.peerID) {
        appSidebarRight.searchTab.open(this.peerID);
      }
    });

    this.listenerSetter.add(this.btnMute, 'click', (e) => {
      cancelEvent(e);
      this.appMessagesManager.mutePeer(this.peerID);
    });

    //this.listenerSetter.add(this.btnJoin, 'mousedown', (e) => {
    attachClickEvent(this.btnJoin, (e) => {
      cancelEvent(e);

      this.btnJoin.setAttribute('disabled', 'true');
      appChatsManager.joinChannel(-this.peerID).finally(() => {
        this.btnJoin.removeAttribute('disabled');
      });
    //});
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope, 'chat_update', (e) => {
      const peerID: number = e.detail;
      if(this.peerID == -peerID) {
        const chat = appChatsManager.getChat(peerID) as Channel/*  | Chat */;
        
        this.btnJoin.classList.toggle('hide', !(chat as Channel)?.pFlags?.left);
        this.setUtilsWidth();
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_notify_settings', (e) => {
      const peerID = e.detail;

      if(peerID == this.peerID) {
        this.setMutedState();
      }
    });

    this.listenerSetter.add(rootScope, 'peer_typings', (e) => {
      const {peerID} = e.detail;

      if(this.peerID == peerID) {
        this.setPeerStatus();
      }
    });

    this.listenerSetter.add(rootScope, 'user_update', (e) => {
      const userID = e.detail;

      if(this.peerID == userID) {
        this.setPeerStatus();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);
  }

  private onResize = () => {
    this.setUtilsWidth(true);
  };

  private onChangeScreen = (from: ScreenSize, to: ScreenSize) => {
    this.chatAudio.divAndCaption.container.classList.toggle('is-floating', to == ScreenSize.mobile);
    this.pinnedMessage.onChangeScreen(from, to);
    this.setUtilsWidth(true);
  };

  public destroy() {
    this.chat.log.error('Topbar destroying');

    this.listenerSetter.removeAll();
    mediaSizes.removeListener('changeScreen', this.onChangeScreen);
    window.clearInterval(this.setPeerStatusInterval);

    delete this.chatAudio;
    delete this.pinnedMessage;
  }

  public setPeer(peerID: number) {
    this.peerID = peerID;

    this.avatarElement.setAttribute('peer', '' + peerID);
    this.avatarElement.update();

    this.container.classList.remove('is-pinned-shown');
    this.container.style.display = peerID ? '' : 'none';

    const isBroadcast = this.appPeersManager.isBroadcast(peerID);

    this.btnMute.classList.toggle('hide', !isBroadcast);
    this.btnJoin.classList.toggle('hide', !this.appChatsManager.getChat(-peerID)?.pFlags?.left);
    this.setUtilsWidth();

    window.requestAnimationFrame(() => {
      this.pinnedMessage.pinnedIndex/*  = this.pinnedMessage.wasPinnedIndex */ = 0;
      //this.pinnedMessage.setCorrectIndex();
      this.pinnedMessage.setPinnedMessage();
      /* noTransition.forEach(el => {
        el.classList.remove('no-transition-all');
      }); */
      /* if(needToChangeInputDisplay) {
        this.chatInput.style.display = '';
      } */
  
      let title = '';
      if(peerID == rootScope.myID) title = 'Saved Messages';
      else title = this.appPeersManager.getPeerTitle(peerID);
      this.title.innerHTML = title;
 
      this.setPeerStatus(true);
      this.setMutedState();
    });
  }

  public setMutedState() {
    const peerID = this.peerID;
    let muted = this.appMessagesManager.isPeerMuted(peerID);
    if(this.appPeersManager.isBroadcast(peerID)) { // not human
      this.btnMute.classList.remove('tgico-mute', 'tgico-unmute');
      this.btnMute.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
      this.btnMute.style.display = '';
    } else {
      this.btnMute.style.display = 'none';
    }
  }

  // ! У МЕНЯ ПРОСТО СГОРЕЛО, САФАРИ КОНЧЕННЫЙ БРАУЗЕР - ЕСЛИ НЕ СКРЫВАТЬ БЛОК, ТО ПРИ ПЕРЕВОРОТЕ ЭКРАНА НА АЙФОНЕ БЛОК БУДЕТ НЕПРАВИЛЬНО ШИРИНЫ, ДАЖЕ БЕЗ ЭТОЙ ФУНКЦИИ!
  public setUtilsWidth = (resize = false) => {
    //return;
    if(this.setUtilsRAF) window.cancelAnimationFrame(this.setUtilsRAF);

    if(isSafari && resize) {
      this.chatUtils.classList.add('hide');
    }

    //mutationObserver.disconnect();
    this.setUtilsRAF = window.requestAnimationFrame(() => {
      
      //mutationRAF = window.requestAnimationFrame(() => {
        
        //setTimeout(() => {
          if(isSafari && resize) {
            this.chatUtils.classList.remove('hide');
          }
          /* this.chatInfo.style.removeProperty('--utils-width');
          void this.chatInfo.offsetLeft; // reflow */
          const width = /* chatUtils.scrollWidth */this.chatUtils.getBoundingClientRect().width;
          this.chat.log('utils width:', width);
          this.chatInfo.style.setProperty('--utils-width', width + 'px');
          //this.chatInfo.classList.toggle('have-utils-width', !!width);
        //}, 0);
        
        this.setUtilsRAF = 0;

        //mutationObserver.observe(chatUtils, observeOptions);
      //});
    });
  };

  public setPeerStatus = (needClear = false) => {
    const peerID = this.peerID;
    if(needClear) {
      this.subtitle.innerHTML = '';
    }

    this.chat.appImManager.getPeerStatus(this.peerID).then((subtitle) => {
      if(peerID != this.peerID) {
        return;
      }

      this.subtitle.innerHTML = subtitle;
    });
  };
}
