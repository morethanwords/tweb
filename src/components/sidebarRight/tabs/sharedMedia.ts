/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../../../lib/rootScope';
import AppSearchSuper, {SearchSuperType} from '../../appSearchSuper.';
import SidebarSlider, {SliderSuperTab} from '../../slider';
import TransitionSlider from '../../transition';
import AppEditChatTab from './editChat';
import PeerTitle from '../../peerTitle';
import AppEditContactTab from './editContact';
import Button from '../../button';
import ButtonIcon from '../../buttonIcon';
import I18n, {i18n, LangPackKey} from '../../../lib/langPack';
import {toastNew} from '../../toast';
import AppAddMembersTab from '../../sidebarLeft/tabs/addMembers';
import PopupPickUser from '../../popups/pickUser';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerCheckboxOptions} from '../../popups/peer';
import ButtonCorner from '../../buttonCorner';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import PeerProfile from '../../peerProfile';
import {Message} from '../../../layer';
import getMessageThreadId from '../../../lib/appManagers/utils/messages/getMessageThreadId';
import AppEditTopicTab from './editTopic';
import liteMode from '../../../helpers/liteMode';
import PopupElement from '../../popups';
import AppEditBotTab from './editBot';
import addChatUsers from '../../addChatUsers';

type SharedMediaHistoryStorage = Partial<{
  [type in SearchSuperType]: {mid: number, peerId: PeerId}[]
}>;

const historiesStorage: {
  [peerId: PeerId]: {
    [threadId: number]: SharedMediaHistoryStorage
  }
} = {};

// TODO: отредактированное сообщение не изменится
export default class AppSharedMediaTab extends SliderSuperTab {
  private editBtn: HTMLElement;

  private peerId: PeerId;
  private threadId: number;

  private searchSuper: AppSearchSuper;

  private profile: PeerProfile;
  private peerChanged: boolean;

  private titleI18n: I18n.IntlElement;

  public isFirst: boolean;

  public init() {
    // const perf = performance.now();

    this.container.classList.add('shared-media-container', 'profile-container');

    // * header
    const newCloseBtn = Button('btn-icon sidebar-close-button', {noRipple: true});
    this.closeBtn.replaceWith(newCloseBtn);
    this.closeBtn = newCloseBtn;

    const animatedCloseIcon = document.createElement('div');
    animatedCloseIcon.classList.add('animated-close-icon');
    newCloseBtn.append(animatedCloseIcon);

    if(this.isFirst) {
      animatedCloseIcon.classList.add('state-back');
    }

    const transitionContainer = document.createElement('div');
    transitionContainer.className = 'transition slide-fade';

    const transitionFirstItem = document.createElement('div');
    transitionFirstItem.classList.add('transition-item');

    this.titleI18n = new I18n.IntlElement();
    this.title.append(this.titleI18n.element);
    this.editBtn = ButtonIcon('edit');
    // const moreBtn = ButtonIcon('more');

    transitionFirstItem.append(this.title, this.editBtn/* , moreBtn */);

    const transitionLastItem = document.createElement('div');
    transitionLastItem.classList.add('transition-item');

    const secondTitle: HTMLElement = this.title.cloneNode() as any;
    secondTitle.append(i18n('PeerInfo.SharedMedia'));

    transitionLastItem.append(secondTitle);

    transitionContainer.append(transitionFirstItem, transitionLastItem);

    this.header.append(transitionContainer);

    // * body

    this.profile = new PeerProfile(this.managers, this.scrollable, this.listenerSetter);
    this.profile.init();

    this.scrollable.append(this.profile.element);

    const HEADER_HEIGHT = 56;
    this.scrollable.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect();
      if(!rect.width) return;

      const top = rect.top - 1;
      setIsSharedMedia(top <= HEADER_HEIGHT);
    };

    const setIsSharedMedia = (isSharedMedia: boolean) => {
      animatedCloseIcon.classList.toggle('state-back', this.isFirst || isSharedMedia);
      this.searchSuper.container.classList.toggle('is-full-viewport', isSharedMedia);
      transition(+isSharedMedia);

      if(!isSharedMedia) {
        this.searchSuper.cleanScrollPositions();
      }
    };

    const transition = TransitionSlider({
      content: transitionContainer,
      type: 'slide-fade',
      transitionTime: 400,
      isHeavy: false
    });

    transition(0);

    attachClickEvent(this.closeBtn, (e) => {
      if(transition.prevId()) {
        this.scrollable.scrollIntoViewNew({
          element: this.scrollable.container.firstElementChild as HTMLElement,
          position: 'start'
        });
        transition(0);

        if(!this.isFirst) {
          animatedCloseIcon.classList.remove('state-back');
        }
      } else if(!this.scrollable.isHeavyAnimationInProgress) {
        this.slider.onCloseBtnClick();
      }
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(this.editBtn, async() => {
      let tab: AppEditChatTab | AppEditContactTab | AppEditTopicTab | AppEditBotTab;
      const {peerId, threadId} = this;
      if(threadId && await this.managers.appPeersManager.isForum(peerId)) {
        tab = this.slider.createTab(AppEditTopicTab)
      } else if(peerId.isAnyChat()) {
        tab = this.slider.createTab(AppEditChatTab);
      } else if(await this.managers.appUsersManager.isBot(peerId)) {
        tab = this.slider.createTab(AppEditBotTab);
      } else {
        tab = this.slider.createTab(AppEditContactTab);
      }

      if(!tab) {
        return;
      }

      if(tab instanceof AppEditTopicTab) {
        tab.open(peerId, this.threadId);
      } else if(tab instanceof AppEditBotTab) {
        tab.open(peerId);
      } else {
        if(tab instanceof AppEditChatTab) {
          tab.chatId = peerId.toChatId();
        } else {
          tab.peerId = peerId;
        }

        tab.open();
      }
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope)('contacts_update', (userId) => {
      if(this.peerId === userId) {
        this.toggleEditBtn();
      }
    });

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.peerId === chatId.toPeerId(true)) {
        this.toggleEditBtn();
      }
    });

    this.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      this.renderNewMessage(message);
    });

    this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      this.deleteDeletedMessages(peerId, Array.from(msgs));
    });

    // Calls when message successfully sent and we have an id
    this.listenerSetter.add(rootScope)('message_sent', ({message}) => {
      this.renderNewMessage(message);
    });

    // this.container.prepend(this.closeBtn.parentElement);

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
        inputFilter: 'inputMessagesFilterRoundVoice',
        name: 'SharedVoiceTab2',
        type: 'voice'
      }, {
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'ChatList.Filter.Groups',
        type: 'groups'
      }],
      scrollable: this.scrollable,
      onChangeTab: (mediaTab) => {
        const timeout = mediaTab.type === 'members' && liteMode.isAvailable('animations') ? 250 : 0;
        setTimeout(() => {
          btnAddMembers.classList.toggle('is-hidden', mediaTab.type !== 'members');
        }, timeout);
      },
      managers: this.managers
    });

    this.searchSuper.scrollStartCallback = () => {
      setIsSharedMedia(true);
    };

    this.profile.element.append(this.searchSuper.container);

    const btnAddMembers = ButtonCorner({icon: 'addmember_filled'});
    this.content.append(btnAddMembers);

    attachClickEvent(btnAddMembers, async() => {
      addChatUsers({
        peerId: this.peerId,
        slider: this.slider
      });
    }, {listenerSetter: this.listenerSetter});

    // console.log('construct shared media time:', performance.now() - perf);
  }

  private _renderNewMessage(message: Message.message | Message.messageService, threadId?: number) {
    const historyStorage = historiesStorage[message.peerId]?.[threadId];
    if(!historyStorage) return;

    for(const mediaTab of this.searchSuper.mediaTabs) {
      const inputFilter = mediaTab.inputFilter;
      const history = historyStorage[inputFilter];
      if(!history) {
        continue;
      }

      const filtered = this.searchSuper.filterMessagesByType([message], inputFilter)
      .filter((message) => !history.find((m) => m.mid === message.mid && m.peerId === message.peerId));
      if(filtered.length) {
        history.unshift(...filtered.map((message) => ({mid: message.mid, peerId: message.peerId})));

        if(this.peerId === message.peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
          this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
          this.searchSuper.performSearchResult(filtered, mediaTab, false);
        }
      }
    }
  }

  private async renderNewMessage(message: Message.message | Message.messageService) {
    if(this.init) return; // * not inited yet

    const {peerId} = message;
    const isForum = await this.managers.appPeersManager.isForum(peerId);
    const threadId = getMessageThreadId(message, isForum);

    this._renderNewMessage(message);
    if(threadId) {
      this._renderNewMessage(message, threadId);
    }
  }

  public _deleteDeletedMessages(historyStorage: SharedMediaHistoryStorage, peerId: PeerId, mids: number[]) {
    for(const mid of mids) {
      for(const type of this.searchSuper.mediaTabs) {
        const inputFilter = type.inputFilter;

        const history = historyStorage[inputFilter];
        if(!history) continue;

        const idx = history.findIndex((m) => m.mid === mid);
        if(idx === -1) {
          continue;
        }

        history.splice(idx, 1);

        if(this.peerId === peerId) {
          const container = this.searchSuper.tabs[inputFilter];
          const div = container.querySelector(`[data-mid="${mid}"][data-peer-id="${peerId}"]`) as HTMLElement;
          if(div) {
            if(this.searchSuper.selection.isSelecting) {
              this.searchSuper.selection.toggleByElement(div);
            }

            div.remove();
          }

          if(this.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
            --this.searchSuper.usedFromHistory[inputFilter];
          }
        }

        // can have element in different tabs somehow
        // break;
      }
    }
  }

  public deleteDeletedMessages(peerId: PeerId, mids: number[]) {
    if(this.init) return; // * not inited yet

    const h = historiesStorage[peerId];
    if(!h) return;

    for(const threadId in h) {
      this._deleteDeletedMessages(h[threadId], peerId, mids);
    }

    this.scrollable.onScroll();
  }

  private async cleanupHTML() {
    // const perf = performance.now();
    const isAnyChat = this.peerId.isAnyChat();
    const [canViewMembers, hasRights] = await Promise.all([
      isAnyChat ? this.searchSuper.canViewMembers() : false,
      isAnyChat ? this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'invite_users') : false
    ]);

    return () => {
      this.profile.cleanupHTML();
      this.editBtn.classList.add('hide');
      this.searchSuper.cleanupHTML(true);
      this.container.classList.toggle('can-add-members', canViewMembers && hasRights);
    };
    // console.log('cleanupHTML shared media time:', performance.now() - perf);
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return false;

    this.peerId = peerId;
    this.threadId = threadId;
    this.peerChanged = true;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.searchSuper.setQuery({
      peerId,
      threadId,
      historyStorage: (historiesStorage[peerId] ??= {})[threadId] ??= {}
    });

    this.profile.setPeer(peerId, threadId);

    return true;
  }

  private async changeTitleKey() {
    const isForum = this.managers.appPeersManager.isForum(this.peerId);

    return () => {
      this.titleI18n.compareAndUpdate({key: this.threadId && isForum ? 'AccDescrTopic' : 'Profile'});
    };
  }

  public async fillProfileElements() {
    if(!this.peerChanged) {
      return;
    }

    this.peerChanged = false;
    const callbacks = await Promise.all([
      this.cleanupHTML(),
      this.toggleEditBtn(true),
      this.profile.fillProfileElements(),
      this.changeTitleKey()
    ]);

    return () => {
      callbacks.forEach((callback) => {
        callback?.();
      });
    };
  }

  private async toggleEditBtn<T extends boolean>(manual?: T): Promise<T extends true ? () => void : void> {
    let show: boolean;
    if(this.peerId.isUser()) {
      show = this.peerId !== rootScope.myId && await this.managers.appUsersManager.canEdit(this.peerId.toUserId());
    } else {
      const chatId = this.peerId.toChatId();
      const isTopic = this.threadId && await this.managers.appChatsManager.isForum(chatId);
      show = await this.managers.appChatsManager.hasRights(chatId, isTopic ? 'manage_topics' : 'change_info');
    }

    const callback = () => {
      this.editBtn.classList.toggle('hide', !show);
    };

    return manual ? callback : callback() as any;
  }

  public loadSidebarMedia(single: boolean, justLoad?: boolean) {
    this.searchSuper.load(single, justLoad);
  }

  onOpenAfterTimeout() {
    super.onOpenAfterTimeout();

    this.scrollable.onScroll();
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();

    if(this.destroyable) {
      this.profile.destroy();
      this.searchSuper.destroy();
    }
  }

  public destroy() {
    this.destroyable = true;
    this.onCloseAfterTimeout();
  }
}
