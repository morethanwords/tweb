/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope, {BroadcastEvents} from '../../../lib/rootScope';
import AppSearchSuper, {SearchSuperMediaTab, SearchSuperMediaType, SearchSuperType} from '../../appSearchSuper.';
import SidebarSlider, {SliderSuperTab} from '../../slider';
import TransitionSlider from '../../transition';
import AppEditChatTab from './editChat';
import AppEditContactTab from './editContact';
import Button from '../../button';
import ButtonIcon from '../../buttonIcon';
import I18n, {LangPackKey, i18n} from '../../../lib/langPack';
import ButtonCorner from '../../buttonCorner';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import PeerProfile from '../../peerProfile';
import {Chat, Message} from '../../../layer';
import getMessageThreadId from '../../../lib/appManagers/utils/messages/getMessageThreadId';
import AppEditTopicTab from './editTopic';
import liteMode from '../../../helpers/liteMode';
import AppEditBotTab from './editBot';
import addChatUsers from '../../addChatUsers';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import wrapPeerTitle from '../../wrappers/peerTitle';
import ButtonMenuToggle from '../../buttonMenuToggle';
import appImManager from '../../../lib/appManagers/appImManager';
import {useIsFrozen} from '../../../stores/appState';
import {profileStarGiftsButtonMenu} from '../../stargifts/profileList';

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

  public peerId: PeerId;
  private threadId: number;

  public searchSuper: AppSearchSuper;

  private profile: PeerProfile;
  private peerChanged: boolean;

  private titleI18n: I18n.IntlElement;

  public isFirst: boolean;
  public noProfile: boolean;

  private sharedMediaTitle: HTMLElement;

  private btnMenu: HTMLElement;

  public init() {
    this.init = null;
    // const perf = performance.now();

    this.container.classList.add('shared-media-container');

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

    const createTransitionContainer = () => {
      const transitionContainer = document.createElement('div');
      transitionContainer.className = 'transition slide-fade';
      return transitionContainer;
    };

    const transitionContainer = createTransitionContainer();

    const makeTransitionItem = (titleInner?: HTMLElement, noCounter?: boolean, title?: HTMLElement) => {
      const element = document.createElement('div');
      element.classList.add('transition-item');

      title ??= this.title.cloneNode() as any;
      title.append(titleInner);

      let subtitle: HTMLElement;
      if(noCounter) {
        element.append(title);
      } else {
        const rows = document.createElement('div');
        rows.classList.add('sidebar-header__rows');
        subtitle = document.createElement('div');
        subtitle.classList.add('sidebar-header__subtitle');
        rows.append(title, subtitle);
        element.append(rows);
      }

      return {element, title, subtitle};
    };

    this.titleI18n = new I18n.IntlElement();
    const transitionFirstItem = makeTransitionItem(this.titleI18n.element, true, this.title);
    this.editBtn = ButtonIcon('edit');

    const self = this;
    const btnMenu = this.btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [
        {
          icon: 'message',
          text: 'SavedViewAsMessages',
          onClick: () => {
            appImManager.toggleViewAsMessages(rootScope.myId, true);
          },
          verify: () => this.peerId === rootScope.myId && this.isFirst
        },
        ...profileStarGiftsButtonMenu({
          get store() { return self.searchSuper.stargiftsStore },
          get actions() { return self.searchSuper.stargiftsActions },
          peerId: this.peerId
        })
      ]
    });

    transitionFirstItem.element.append(this.editBtn);

    enum TitleIndex {
      Profile = 0,
      Media = 1
    };

    const transitionSharedMedia = makeTransitionItem(i18n('PeerInfo.SharedMedia'));
    this.sharedMediaTitle = transitionSharedMedia.title;

    const sharedMediaTransitionContainer = createTransitionContainer();
    transitionSharedMedia.subtitle.append(sharedMediaTransitionContainer);

    const c: [SearchSuperMediaTab['type'], LangPackKey, I18n.IntlElement?][] = [
      ['savedDialogs', 'SavedDialogsTabCount'],
      ['stories', 'StoriesCount'],
      ['members', 'Members'],
      ['media', 'MediaFiles'],
      ['gifts', 'StarGiftsCount'],
      ['saved', 'SavedMessagesCount'],
      ['files', 'Files'],
      ['links', 'Links'],
      ['music', 'MusicFiles'],
      ['voice', 'Voice'],
      ['groups', 'CommonGroups'],
      ['similar', 'SimilarChannelsCount']
    ];

    sharedMediaTransitionContainer.append(...c.map((item) => {
      item[2] = new I18n.IntlElement({key: 'Loading'});
      const element = document.createElement('div');
      element.classList.add('transition-item');
      element.append(item[2].element);
      return element;
    }));

    transitionContainer.append(...[
      transitionFirstItem,
      transitionSharedMedia
    ].map(({element}) => element));

    this.header.append(transitionContainer, btnMenu);

    // * body

    if(!this.noProfile) {
      this.profile = new PeerProfile(this.managers, this.scrollable, this.listenerSetter, true, this.container);
      this.profile.init();
      this.profile.onPinnedGiftsChange = (gifts) => {
        this.searchSuper.setPinnedGifts(gifts);
      }
      this.scrollable.append(this.profile.element);
    }

    const HEADER_HEIGHT = 56;
    this.scrollable.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect();
      if(!rect.width) return;

      const top = rect.top - 1;
      setIsSharedMedia(top <= HEADER_HEIGHT);
    };

    const getTitleIndex = (isSharedMedia = transition.prevId() !== TitleIndex.Profile) => {
      let index = TitleIndex.Profile;
      if(isSharedMedia) {
        index = TitleIndex.Media;
      }

      return index;
    };

    const setIsSharedMedia = (isSharedMedia: boolean) => {
      animatedCloseIcon.classList.toggle('state-back', this.isFirst || isSharedMedia);
      this.searchSuper.container.classList.toggle('is-full-viewport', isSharedMedia);

      transition(getTitleIndex(isSharedMedia));

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

    transition(this.profile ? TitleIndex.Profile : TitleIndex.Media);

    const transitionSubtitle = TransitionSlider({
      content: sharedMediaTransitionContainer,
      type: 'slide-fade',
      transitionTime: 400,
      isHeavy: false
    });

    transitionSubtitle(0);

    attachClickEvent(this.closeBtn, (e) => {
      if(transition.prevId() && this.profile) {
        this.scrollable.scrollIntoViewNew({
          element: this.scrollable.container.querySelector('.profile-content') as HTMLElement,
          position: 'start'
        });
        transition(TitleIndex.Profile);

        if(!this.isFirst) {
          animatedCloseIcon.classList.remove('state-back');
          this.container.classList.remove('header-filled');
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
      if(this.peerId === userId.toPeerId(false)) {
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
      this.deleteDeletedMessages(peerId, msgs);
    });

    // Calls when message successfully sent and we have an id
    // this.listenerSetter.add(rootScope)('message_sent', ({message}) => {
    //   this.renderNewMessage(message);
    // });

    // this.container.prepend(this.closeBtn.parentElement);

    // let lastMediaTabType: SearchSuperMediaTab['type'];
    this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        name: 'SharedMedia.SavedDialogs',
        type: 'savedDialogs'
      }, {
        name: 'Stories',
        type: 'stories'
      }, {
        name: 'PeerMedia.Members',
        type: 'members'
      }, {
        inputFilter: 'inputMessagesFilterPhotoVideo',
        name: 'SharedMediaTab2',
        type: 'media'
      }, {
        name: 'SharedMedia.Gifts',
        type: 'gifts'
      }, {
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'SharedMedia.Saved',
        type: 'saved'
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
        name: 'ChatList.Filter.Groups',
        type: 'groups'
      }, {
        name: 'SimilarChannels',
        type: 'similar'
      }],
      scrollable: this.scrollable,
      onChangeTab: (mediaTab) => {
        // lastMediaTabType = mediaTab.type;
        transitionSubtitle(c.findIndex((item) => item[0] === mediaTab.type));

        const timeout = mediaTab.type === 'members' && liteMode.isAvailable('animations') ? 250 : 0;
        setTimeout(() => {
          btnAddMembers.classList.toggle('is-hidden', mediaTab.type !== 'members');
        }, timeout);

        if(!this.isFirst) {
          this.btnMenu.classList.toggle('hide', mediaTab.type !== 'gifts');
        }
      },
      managers: this.managers,
      onLengthChange: (type, length) => {
        const item = c.find((item) => item[0] === type);
        if(!item) {
          return;
        }

        item[2].compareAndUpdate({key: item[1], args: [length]});
      },
      openSavedDialogsInner: !this.isFirst,
      slider: this.slider
    });

    this.searchSuper.scrollStartCallback = () => {
      setIsSharedMedia(true);
      this.container.classList.add('header-filled');
    };

    // * fix scroll position to media tab because of absolute header
    this.searchSuper.scrollOffset = 56;

    if(this.profile) {
      this.profile.element.append(this.searchSuper.container);
    } else {
      this.scrollable.append(this.searchSuper.container);
    }

    const btnAddMembers = ButtonCorner({icon: 'addmember_filled'});
    this.content.append(btnAddMembers);

    attachClickEvent(btnAddMembers, () => {
      addChatUsers({
        peerId: this.peerId,
        slider: this.slider
      });
    }, {listenerSetter: this.listenerSetter});

    // console.log('construct shared media time:', performance.now() - perf);
  }

  private _renderNewMessage(message: Message.message | Message.messageService, peerId = message.peerId, threadId?: number) {
    const historyStorage = historiesStorage[peerId]?.[threadId];
    if(!historyStorage) return;

    for(const mediaTab of this.searchSuper.mediaTabs) {
      const inputFilter = mediaTab.inputFilter;
      const history = historyStorage[inputFilter];
      if(!history) {
        continue;
      }

      let filtered: (typeof message)[];
      if(mediaTab.type === 'saved') {
        filtered = [message].filter((message) => {
          const savedPeerId = (message as Message.message).saved_peer_id;
          return savedPeerId &&
            getPeerId(savedPeerId) === this.searchSuper.searchContext.peerId &&
            !history.some((m) => m.mid === message.mid);
        });
      } else {
        filtered = this.searchSuper.filterMessagesByType([message], inputFilter);
      }

      if(!filtered.length) {
        continue;
      }

      const toInsert = filtered
      .filter((message) => !history.find((m) => m.mid === message.mid && m.peerId === message.peerId))
      .map((message) => ({mid: message.mid, peerId: message.peerId}));
      history.unshift(...toInsert);

      if(
        (mediaTab.type === 'saved' ? this.peerId === threadId : this.peerId === peerId) &&
        this.searchSuper.usedFromHistory[inputFilter] !== -1 &&
        this.threadId === threadId
      ) {
        this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
        this.searchSuper.performSearchResult(filtered, mediaTab, false);
        this.searchSuper.setCounter(mediaTab.type, this.searchSuper.counters[mediaTab.type] + filtered.length);
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
      this._renderNewMessage(message, undefined, threadId);
    }
  }

  public _deleteDeletedMessages(historyStorage: SharedMediaHistoryStorage, peerId: PeerId, mids: number[], threadId?: number) {
    for(const mid of mids) {
      for(const mediaTab of this.searchSuper.mediaTabs) {
        const inputFilter = mediaTab.inputFilter;

        const history = historyStorage[inputFilter];
        if(!history) continue;

        const isGood = mediaTab.type === 'saved' ?
          this.peerId === threadId :
          this.peerId === peerId && this.threadId === threadId;
        if(isGood) {
          this.searchSuper.setCounter(mediaTab.type, this.searchSuper.counters[mediaTab.type] - mids.length);
        }

        const idx = history.findIndex((m) => m.mid === mid);
        if(idx === -1) {
          history.splice(idx, 1);
        }

        if(isGood) {
          const container = this.searchSuper.tabs[inputFilter];
          const div = container.querySelector(`[data-mid="${mid}"][data-peer-id="${peerId}"]`) as HTMLElement;
          if(div) {
            if(this.searchSuper.selection.isSelecting) {
              this.searchSuper.selection.toggleByElement(div);
            }

            const divs = container.querySelectorAll<HTMLElement>('[data-mid][data-peer-id]');
            const idx = Array.from(divs).indexOf(div);
            div.remove();

            if(idx !== -1 && this.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
              --this.searchSuper.usedFromHistory[inputFilter];
            }
          }
        }

        // can have element in different tabs somehow
        // break;
      }
    }
  }

  public deleteDeletedMessages(peerId: PeerId, msgs: BroadcastEvents['history_delete']['msgs']) {
    if(this.init) return; // * not inited yet

    const h = historiesStorage[peerId];
    if(!h) return;
    const mids = [...msgs.keys()];

    for(const threadId in h) {
      this._deleteDeletedMessages(h[threadId], peerId, mids, isNaN(+threadId) ? undefined : +threadId);
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
      this.profile?.cleanupHTML();
      this.editBtn.classList.add('hide');
      this.searchSuper.cleanupHTML(true);
      this.container.classList.toggle('can-add-members', canViewMembers && hasRights);
    };
    // console.log('cleanupHTML shared media time:', performance.now() - perf);
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  private getHistoryStorage(peerId: PeerId, threadId?: number) {
    return (historiesStorage[peerId] ??= {})[threadId] ??= {};
  }

  public setPeer(peerId: PeerId, threadId?: number) {
    if(this.peerId === peerId && this.threadId === threadId) return false;

    this.peerId = peerId;
    this.threadId = threadId;
    this.noProfile ??= peerId === rootScope.myId;
    this.peerChanged = true;

    if(this.init) {
      this.init();
    }

    const historyStorage = this.getHistoryStorage(peerId, threadId);
    historyStorage.inputMessagesFilterEmpty = this.getHistoryStorage(rootScope.myId, peerId).inputMessagesFilterEmpty ??= [];

    this.searchSuper.setQuery({
      peerId,
      threadId,
      historyStorage
    });

    this.profile?.setPeer(peerId, threadId);

    return true;
  }

  private async changeTitleKey() {
    const {peerId, threadId} = this;
    const isSavedDialog = !!(peerId === rootScope.myId && threadId);
    const usePeerId = isSavedDialog ? threadId : peerId;
    const [isForum, isBroadcast, isBot, peerTitle] = await Promise.all([
      this.managers.appPeersManager.isForum(usePeerId),
      this.managers.appPeersManager.isBroadcast(usePeerId),
      this.managers.appPeersManager.isBot(usePeerId),
      wrapPeerTitle({
        peerId,
        threadId: isSavedDialog ? undefined : threadId,
        meAsNotes: isSavedDialog && threadId === rootScope.myId,
        dialog: true
      })
    ]);

    return () => {
      this.titleI18n.compareAndUpdate({
        key: isBot ? 'Profile.Info.Bot' : (isBroadcast ? 'Profile.Info.Channel' : (threadId && isForum ? 'Profile.Info.Topic' : (usePeerId.isUser() ? 'Profile.Info.User' : 'Profile.Info.Group')))
      });
      this.sharedMediaTitle.replaceChildren(peerTitle);
      this.btnMenu.classList.toggle('hide', !this.isFirst || isSavedDialog || peerId !== rootScope.myId);
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
      this.profile?.fillProfileElements(),
      this.changeTitleKey()
    ]);

    return () => {
      callbacks.forEach((callback) => {
        callback?.();
      });
    };
  }

  private async toggleEditBtn(manual: true): Promise<() => void>;
  private async toggleEditBtn(manual?: false): Promise<void>;

  private async toggleEditBtn(manual?: boolean): Promise<(() => void) | void> {
    const {peerId} = this;
    let show: boolean;
    if(useIsFrozen()) {
      show = false;
    } else if(peerId.isUser()) {
      show = peerId !== rootScope.myId && await this.managers.appUsersManager.canEdit(peerId.toUserId());
    } else {
      const chatId = peerId.toChatId();
      const isTopic = this.threadId && apiManagerProxy.isForum(peerId);
      if(isTopic) {
        show = await this.managers.dialogsStorage.canManageTopic(await this.managers.dialogsStorage.getForumTopic(peerId, this.threadId));
      } else {
        const chat = apiManagerProxy.getChat(chatId);
        show = !!(chat as Chat.channel).admin_rights || await this.managers.appChatsManager.hasRights(chatId, 'change_info');
      }
    }

    const callback = () => {
      this.editBtn.classList.toggle('hide', !show);
    };

    return manual ? callback : callback();
  }

  public loadSidebarMedia(single: boolean, justLoad?: boolean) {
    return this.searchSuper.load(single, justLoad);
  }

  public setSearchTab(tab: SearchSuperMediaType) {
    const idx = this.searchSuper.mediaTabs.findIndex((t) => t.type === tab)
    if(idx === -1) return;
    this.searchSuper.selectTab(idx);
  }

  onOpenAfterTimeout() {
    super.onOpenAfterTimeout();

    this.scrollable.onScroll();
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();

    if(this.destroyable) {
      this.profile?.destroy();
      this.searchSuper.destroy();
    }
  }

  public destroy() {
    this.destroyable = true;
    this.onCloseAfterTimeout();
  }

  public static async open(slider: SidebarSlider, peerId: PeerId, noProfile?: boolean) {
    const tab = slider.createTab(AppSharedMediaTab, true);
    tab.noProfile = noProfile;
    tab.isFirst = true;
    tab.setPeer(peerId);
    (await tab.fillProfileElements())();
    await tab.loadSidebarMedia(true);
    return tab.open();
  }
}
