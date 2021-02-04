import type { AppChatsManager, Channel } from "../../lib/appManagers/appChatsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppSidebarRight } from "../sidebarRight";
import type Chat from "./chat";
import { findUpClassName, cancelEvent, attachClickEvent, blurActiveElement } from "../../helpers/dom";
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
import appStateManager from "../../lib/appManagers/appStateManager";
import PopupDeleteDialog from "../popups/deleteDialog";

export default class ChatTopbar {
  container: HTMLDivElement;
  btnBack: HTMLButtonElement;
  chatInfo: HTMLDivElement;
  avatarElement: AvatarElement;
  title: HTMLDivElement;
  subtitle: HTMLDivElement;
  chatUtils: HTMLDivElement;
  btnJoin: HTMLButtonElement;
  btnPinned: HTMLButtonElement;
  btnMute: HTMLButtonElement;
  btnSearch: HTMLButtonElement;
  btnMore: HTMLButtonElement;
  
  public chatAudio: ChatAudio;
  public pinnedMessage: ChatPinnedMessage;

  private setUtilsRAF: number;
  public peerId: number;
  public wasPeerId: number;
  private setPeerStatusInterval: number;

  public listenerSetter: ListenerSetter;

  public menuButtons: (ButtonMenuItemOptions & {verify: () => boolean})[] = [];

  constructor(private chat: Chat, private appSidebarRight: AppSidebarRight, private appMessagesManager: AppMessagesManager, private appPeersManager: AppPeersManager, private appChatsManager: AppChatsManager) {
    this.listenerSetter = new ListenerSetter();
  }

  public construct() {
    //this.chat.log.error('Topbar construction');

    this.container = document.createElement('div');
    this.container.classList.add('sidebar-header', 'topbar');

    this.btnBack = ButtonIcon('arrow_back sidebar-close-button', {noRipple: true});

    // * chat info section
    this.chatInfo = document.createElement('div');
    this.chatInfo.classList.add('chat-info');

    const person = document.createElement('div');
    person.classList.add('person');

    const content = document.createElement('div');
    content.classList.add('content');

    const top = document.createElement('div');
    top.classList.add('top');

    this.title = document.createElement('div');
    this.title.classList.add('user-title');

    top.append(this.title);

    const bottom = document.createElement('div');
    bottom.classList.add('bottom');

    if(this.subtitle) {
      bottom.append(this.subtitle);
    }

    content.append(top, bottom);
    if(this.avatarElement) {
      person.append(this.avatarElement);
    }

    person.append(content);
    this.chatInfo.append(person);

    // * chat utils section
    this.chatUtils = document.createElement('div');
    this.chatUtils.classList.add('chat-utils');

    this.chatAudio = new ChatAudio(this, this.chat, this.appMessagesManager, this.appPeersManager);

    if(this.menuButtons.length) {
      this.btnMore = ButtonMenuToggle({listenerSetter: this.listenerSetter}, 'bottom-left', this.menuButtons, (e) => {
        cancelEvent(e);
        this.menuButtons.forEach(button => {
          button.element.classList.toggle('hide', !button.verify());
        });

        // delete button
        this.menuButtons[this.menuButtons.length - 1].element.firstChild.nodeValue = this.appPeersManager.getDeleteButtonText(this.peerId);
      });
    }

    this.chatUtils.append(...[this.chatAudio ? this.chatAudio.divAndCaption.container : null, this.pinnedMessage ? this.pinnedMessage.pinnedMessageContainer.divAndCaption.container : null, this.btnJoin, this.btnPinned, this.btnMute, this.btnSearch, this.btnMore].filter(Boolean));

    this.container.append(this.btnBack, this.chatInfo, this.chatUtils);

    // * construction end

    // * fix topbar overflow section

    this.listenerSetter.add(window, 'resize', this.onResize);
    mediaSizes.addListener('changeScreen', this.onChangeScreen);

    attachClickEvent(this.container, (e) => {
      const container: HTMLElement = findUpClassName(e.target, 'pinned-container');
      blurActiveElement();
      if(container) {
        cancelEvent(e);
        
        const mid = +container.dataset.mid;
        const peerId = +container.dataset.peerId;
        if(container.classList.contains('pinned-message')) {
          //if(!this.pinnedMessage.locked) {
            this.pinnedMessage.followPinnedMessage(mid);
          //}
        } else {
          this.chat.appImManager.setInnerPeer(peerId, mid);
        }
      } else {
        this.appSidebarRight.toggleSidebar(true);
      }
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.btnBack, (e) => {
      cancelEvent(e);
      this.chat.appImManager.setPeer(0);
      blurActiveElement();
    }, {listenerSetter: this.listenerSetter});
  }

  public constructUtils() {
    this.menuButtons = [{
      icon: 'search',
      text: 'Search',
      onClick: () => {
        new ChatSearch(this, this.chat);
      },
      verify: () => mediaSizes.isMobile
    }, /* {
      icon: 'pinlist',
      text: 'Pinned Messages',
      onClick: () => this.openPinned(false),
      verify: () => mediaSizes.isMobile
    }, */ {
      icon: 'mute',
      text: 'Mute',
      onClick: () => {
        this.appMessagesManager.mutePeer(this.peerId);
      },
      verify: () => this.chat.type === 'chat' && rootScope.myId !== this.peerId && !this.appMessagesManager.isPeerMuted(this.peerId)
    }, {
      icon: 'unmute',
      text: 'Unmute',
      onClick: () => {
        this.appMessagesManager.mutePeer(this.peerId);
      },
      verify: () => this.chat.type === 'chat' && rootScope.myId !== this.peerId && this.appMessagesManager.isPeerMuted(this.peerId)
    }, {
      icon: 'select',
      text: 'Select Messages',
      onClick: () => {
        this.chat.selection.toggleSelection(true, true);
      },
      verify: () => !this.chat.selection.isSelecting && !!Object.keys(this.chat.bubbles.bubbles).length
    }, {
      icon: 'select',
      text: 'Clear Selection',
      onClick: () => {
        this.chat.selection.cancelSelection();
      },
      verify: () => this.chat.selection.isSelecting
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: () => {
        new PopupDeleteDialog(this.peerId);
      },
      verify: () => this.chat.type === 'chat' && !!this.appMessagesManager.getDialogByPeerId(this.peerId)[0]
    }];

    this.btnSearch = ButtonIcon('search');
    attachClickEvent(this.btnSearch, (e) => {
      cancelEvent(e);
      if(this.peerId) {
        this.appSidebarRight.searchTab.open(this.peerId, this.chat.threadId);
      }
    }, {listenerSetter: this.listenerSetter});
  }

  public constructPeerHelpers() {
    this.avatarElement = new AvatarElement();
    this.avatarElement.setAttribute('dialog', '1');
    //this.avatarElement.setAttribute('clickable', '');
    this.avatarElement.classList.add('avatar-40', 'person-avatar');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('info');

    this.pinnedMessage = new ChatPinnedMessage(this, this.chat, this.appMessagesManager, this.appPeersManager);

    this.btnJoin = Button('btn-primary chat-join hide');
    this.btnJoin.append('SUBSCRIBE');

    this.btnPinned = ButtonIcon('pinlist');
    this.btnMute = ButtonIcon('mute');

    attachClickEvent(this.btnPinned, (e) => {
      cancelEvent(e);
      blurActiveElement();
      this.openPinned(true);
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.btnMute, (e) => {
      cancelEvent(e);
      blurActiveElement();
      this.appMessagesManager.mutePeer(this.peerId);
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.btnJoin, (e) => {
      cancelEvent(e);

      blurActiveElement();
      this.btnJoin.setAttribute('disabled', 'true');
      this.appChatsManager.joinChannel(-this.peerId).finally(() => {
        this.btnJoin.removeAttribute('disabled');
      });
    //});
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope, 'chat_update', (e) => {
      const peerId: number = e;
      if(this.peerId === -peerId) {
        const chat = this.appChatsManager.getChat(peerId) as Channel/*  | Chat */;
        
        this.btnJoin.classList.toggle('hide', !(chat as Channel)?.pFlags?.left);
        this.setUtilsWidth();
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_notify_settings', (e) => {
      const peerId = e;

      if(peerId === this.peerId) {
        this.setMutedState();
      }
    });

    this.listenerSetter.add(rootScope, 'peer_typings', (e) => {
      const {peerId} = e;

      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    this.listenerSetter.add(rootScope, 'user_update', (e) => {
      const userId = e;

      if(this.peerId === userId) {
        this.setPeerStatus();
      }
    });

    if(this.pinnedMessage) {
      this.chat.addListener('setPeer', (mid, isTopMessage) => {
        const middleware = this.chat.bubbles.getMiddleware();
        appStateManager.getState().then((state) => {
          if(!middleware()) return;
  
          this.pinnedMessage.hidden = !!state.hiddenPinnedMessages[this.chat.peerId];
  
          if(isTopMessage) {
            this.pinnedMessage.unsetScrollDownListener();
            this.pinnedMessage.testMid(mid, 0); // * because slider will not let get bubble by document.elementFromPoint
          } else if(!this.pinnedMessage.locked) {
            this.pinnedMessage.handleFollowingPinnedMessage();
            this.pinnedMessage.testMid(mid);
          }
        });
      });
    }

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);

    return this;
  }

  public constructPinnedHelpers() {
    this.listenerSetter.add(rootScope, 'peer_pinned_messages', (e) => {
      const {peerId, mids, pinned} = e;

      if(peerId !== this.peerId) return;

      if(mids) {
        this.setTitle();
      }
    });
  }
  
  public constructDiscussionHelpers() {
    this.pinnedMessage = new ChatPinnedMessage(this, this.chat, this.appMessagesManager, this.appPeersManager);
  }

  public openPinned(byCurrent: boolean) {
    this.chat.appImManager.setInnerPeer(this.peerId, byCurrent ? +this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.dataset.mid : 0, 'pinned');
  }

  private onResize = () => {
    this.setUtilsWidth(true);
  };

  private onChangeScreen = (from: ScreenSize, to: ScreenSize) => {
    this.container.classList.toggle('is-pinned-floating', mediaSizes.isMobile);
    this.chatAudio && this.chatAudio.divAndCaption.container.classList.toggle('is-floating', to === ScreenSize.mobile);
    this.pinnedMessage && this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-floating', to === ScreenSize.mobile);
    this.setUtilsWidth(true);
  };

  public destroy() {
    //this.chat.log.error('Topbar destroying');

    this.listenerSetter.removeAll();
    mediaSizes.removeListener('changeScreen', this.onChangeScreen);
    window.clearInterval(this.setPeerStatusInterval);
    
    if(this.pinnedMessage) {
      this.pinnedMessage.destroy(); // * возможно это можно не делать
    }

    delete this.chatAudio;
    delete this.pinnedMessage;
  }

  public setPeer(peerId: number) {
    this.wasPeerId = this.peerId;
    this.peerId = peerId;

    this.container.style.display = peerId ? '' : 'none';
  }

  public finishPeerChange(isTarget: boolean, isJump: boolean, lastMsgId: number) {
    const peerId = this.peerId;

    if(this.avatarElement) {
      this.avatarElement.setAttribute('peer', '' + peerId);
      this.avatarElement.update();
    }

    const isBroadcast = this.appPeersManager.isBroadcast(peerId);

    this.btnMute && this.btnMute.classList.toggle('hide', !isBroadcast);
    this.btnJoin && this.btnJoin.classList.toggle('hide', !this.appChatsManager.getChat(-peerId)?.pFlags?.left);
    this.setUtilsWidth();

    const middleware = this.chat.bubbles.getMiddleware();
    if(this.pinnedMessage) { // * replace with new one
      if(this.chat.type === 'chat') {
        if(this.wasPeerId) { // * change
          const newPinnedMessage = new ChatPinnedMessage(this, this.chat, this.appMessagesManager, this.appPeersManager);
          this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.replaceWith(newPinnedMessage.pinnedMessageContainer.divAndCaption.container);
          this.pinnedMessage.destroy();
          //this.pinnedMessage.pinnedMessageContainer.toggle(true);
          this.pinnedMessage = newPinnedMessage;
        }
        
        appStateManager.getState().then((state) => {
          if(!middleware()) return;
  
          this.pinnedMessage.hidden = !!state.hiddenPinnedMessages[peerId];
  
          if(!isTarget) {
            this.pinnedMessage.setCorrectIndex(0);
          }
        });
      } else if(this.chat.type === 'discussion') {
        this.pinnedMessage.pinnedMid = this.chat.threadId;
        this.pinnedMessage.count = 1;
        this.pinnedMessage.pinnedIndex = 0;
        this.pinnedMessage._setPinnedMessage();
      }
    }

    window.requestAnimationFrame(() => {
      this.setTitle();
      this.setPeerStatus(true);
      this.setMutedState();
    });
  }

  public setTitle(count?: number) {
    let title = '';
    if(this.chat.type === 'pinned') {
      title = [count > 1 ? count : false, 'Pinned Messages'].filter(Boolean).join(' ');
      
      if(count === undefined) {
        this.appMessagesManager.getSearchCounters(this.peerId, [{_: 'inputMessagesFilterPinned'}]).then(result => {
          const count = result[0].count;
          this.setTitle(count);

          // ! костыль х2, это нужно делать в другом месте
          if(!count) {
            this.chat.appImManager.setPeer(0); // * close tab

            // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
            const originalChat = this.chat.appImManager.chat;
            if(originalChat.topbar.pinnedMessage) {
              originalChat.topbar.pinnedMessage.pinnedMessageContainer.toggle(true);
            }
          }
        });
      }
    } else if(this.chat.type === 'scheduled') {
      if(this.peerId === rootScope.myId) {
        title = [count > 1 ? count : false, 'Reminders'].filter(Boolean).join(' ');
      } else {
        title = [count > 1 ? count : false, 'Scheduled Messages'].filter(Boolean).join(' ');
      }
      
      if(count === undefined) {
        this.appMessagesManager.getScheduledMessages(this.peerId).then(mids => {
          this.setTitle(mids.length);
        });
      }
    } else if(this.chat.type === 'discussion') {
      title = [count > 1 ? count : false, 'Comments'].filter(Boolean).join(' ');

      if(count === undefined) {
        Promise.all([
          this.appMessagesManager.getHistory(this.peerId, 0, 1, 0, this.chat.threadId),
          Promise.resolve()
        ]).then(() => {
          this.setTitle(this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId).count);
        });
      }
    } else if(this.chat.type === 'chat') {
      if(this.peerId === rootScope.myId) title = 'Saved Messages';
      else title = this.appPeersManager.getPeerTitle(this.peerId);
    }
    
    this.title.innerHTML = title;
  }

  public setMutedState() {
    if(!this.btnMute) return;

    const peerId = this.peerId;
    let muted = this.appMessagesManager.isPeerMuted(peerId);
    if(this.appPeersManager.isBroadcast(peerId)) { // not human
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
    if(!this.subtitle) return;

    const peerId = this.peerId;
    if(needClear) {
      this.subtitle.innerHTML = '';
    }

    this.chat.appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId !== this.peerId) {
        return;
      }

      this.subtitle.innerHTML = subtitle;
    });
  };
}
