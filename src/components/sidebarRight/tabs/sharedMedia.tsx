import {Component, createRoot} from 'solid-js';
import rootScope, {BroadcastEvents} from '@lib/rootScope';
import AppSearchSuper, {SearchSuperMediaTab, SearchSuperMediaType, SearchSuperType} from '@components/appSearchSuper';
import TransitionSlider from '@components/transition';
import {AppEditBotTab, AppEditChatTab, AppEditContactTab, AppEditTopicTab} from '@components/solidJsTabs/tabs';
import Button from '@components/button';
import ButtonIcon from '@components/buttonIcon';
import I18n, {LangPackKey, i18n} from '@lib/langPack';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {renderPeerProfile} from '@components/peerProfile';
import {Message} from '@layer';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import liteMode from '@helpers/liteMode';
import addChatUsers from '@components/addChatUsers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import ButtonMenuToggle, {filterButtonMenuItems} from '@components/buttonMenuToggle';
import {useIsFrozen} from '@stores/appState';
import {profileStarGiftsButtonMenu} from '@components/stargifts/profileList';
import {profileStoriesButtonMenu} from '@components/stories/profileList';
import namedPromises from '@helpers/namedPromises';
import hasRights from '@lib/appManagers/utils/chats/hasRights';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';

type SharedMediaHistoryStorage = Partial<{
  [type in SearchSuperType]: {mid: number, peerId: PeerId}[]
}>;

const historiesStorage: {
  [peerId: PeerId]: {
    [threadId: number]: SharedMediaHistoryStorage
  }
} = {};

const SharedMedia: Component = () => {
  const [tab] = useSuperTab<typeof AppSharedMediaTab>();
  const {HotReloadGuard, apiManagerProxy, appImManager} = useHotReloadGuard();

  const getHistoryStorage = (peerId: PeerId, threadId?: number) => {
    return (historiesStorage[peerId] ??= {})[threadId] ??= {};
  };

  const setQuery = () => {
    const {peerId, threadId} = tab;
    const historyStorage = getHistoryStorage(peerId, threadId);
    historyStorage.inputMessagesFilterEmpty = getHistoryStorage(rootScope.myId, peerId).inputMessagesFilterEmpty ??= [];

    tab.searchSuper.setQuery({
      peerId,
      threadId,
      historyStorage
    });
  };

  const cleanupHTML = async() => {
    const isAnyChat = tab.peerId.isAnyChat();
    const [canViewMembers, hasInviteRights] = await Promise.all([
      isAnyChat ? tab.searchSuper.canViewMembers() : false,
      isAnyChat ? tab.managers.appChatsManager.hasRights(tab.peerId.toChatId(), 'invite_users') : false
    ]);

    return () => {
      editBtn.classList.add('hide');
      tab.searchSuper.cleanupHTML();
      tab.container.classList.toggle('can-add-members', canViewMembers && hasInviteRights);
    };
  };

  const changeTitleKey = async() => {
    const {peerId, threadId} = tab;
    const isSavedDialog = !!(peerId === rootScope.myId && threadId);
    const usePeerId = isSavedDialog ? threadId : peerId;
    const {isForum, isBotforum, isBroadcast, isBot, peerTitle} = await namedPromises({
      isForum: tab.managers.appPeersManager.isForum(usePeerId),
      isBotforum: tab.managers.appPeersManager.isBotforum(usePeerId),
      isBroadcast: tab.managers.appPeersManager.isBroadcast(usePeerId),
      isBot: tab.managers.appPeersManager.isBot(usePeerId),
      peerTitle: wrapPeerTitle({
        peerId,
        threadId: isSavedDialog ? undefined : threadId,
        meAsNotes: isSavedDialog && threadId === rootScope.myId,
        dialog: true
      })
    });

    const titleKey = ((): LangPackKey => {
      if((isForum || isBotforum) && threadId) {
        return 'Profile.Info.Topic';
      } else if(isBot) {
        return 'Profile.Info.Bot';
      } else if(isBroadcast) {
        return 'Profile.Info.Channel';
      } else if(usePeerId.isUser()) {
        return 'Profile.Info.User';
      } else {
        return 'Profile.Info.Group';
      }
    })();

    return () => {
      titleI18n.compareAndUpdate({
        key: titleKey
      });
      sharedMediaTitle.replaceChildren(peerTitle);
      btnMenu.classList.toggle('hide', !tab.isFirst || isSavedDialog || peerId !== rootScope.myId);
    };
  };

  function toggleEditBtn(manual: true): Promise<() => void>;
  function toggleEditBtn(manual?: false): Promise<void>;
  async function toggleEditBtn(manual?: boolean): Promise<(() => void) | void> {
    const {peerId} = tab;
    let show: boolean;
    if(useIsFrozen()) {
      show = false;
    } else if(peerId.isUser()) {
      show = peerId !== rootScope.myId && await tab.managers.appUsersManager.canEdit(peerId.toUserId());
    } else {
      const chatId = peerId.toChatId();
      const isTopic = tab.threadId && apiManagerProxy.isForum(peerId);
      if(isTopic) {
        show = await tab.managers.dialogsStorage.canManageTopic(await tab.managers.dialogsStorage.getForumTopic(peerId, tab.threadId));
      } else {
        const chat = apiManagerProxy.getChat(chatId);
        // Mirror tdesktop's EditPeerInfoBox::Available — the Edit button is shown to any
        // admin, not only those holding the change_info right, so an admin who can manage
        // members/permissions/etc. can still reach the edit screen.
        if(chat._ === 'channel') {
          show = !chat.pFlags.monoforum && (hasRights(chat, 'just_admin') || hasRights(chat, 'change_info'));
        } else {
          show = hasRights(chat, 'change_info') || hasRights(chat, 'change_permissions');
        }
      }
    }

    const callback = () => {
      editBtn.classList.toggle('hide', !show);
    };

    return manual ? callback : callback();
  }

  const fillProfileElements = async() => {
    if(!tab.peerChanged) {
      return;
    }

    tab.peerChanged = false;
    const callbacks = await Promise.all([
      cleanupHTML(),
      toggleEditBtn(true),
      changeTitleKey(),
      (() => {
        !tab.noProfile && createRoot((dispose) => {
          tab.middlewareHelper.onDestroy(dispose);
          tab.scrollable.append(renderPeerProfile({
            peerId: tab.peerId,
            threadId: tab.threadId,
            isDialog: true,
            scrollable: tab.scrollable,
            setCollapsedOn: tab.container,
            searchSuperContainer: tab.searchSuper.container,
            onPinnedGiftsChange: (gifts) => {
              tab.searchSuper.setPinnedGifts(gifts);
            }
          }, HotReloadGuard));
        });

        // * keep same layout
        if(tab.noProfile) {
          tab.container.classList.add('profile-container');

          const content = document.createElement('div');
          content.classList.add('profile-content');

          tab.searchSuper.container.replaceWith(content);
          content.append(tab.searchSuper.container);
        }

        return () => {};
      })()
    ]);

    return () => {
      callbacks.forEach((callback) => {
        callback?.();
      });
    };
  };

  const loadSidebarMedia = (single: boolean, justLoad?: boolean) => {
    return tab.searchSuper.load(single, justLoad);
  };

  const setSearchTab = (type: SearchSuperMediaType) => {
    const idx = tab.searchSuper.mediaTabs.findIndex((t) => t.type === type)
    if(idx === -1) return;
    tab.searchSuper.selectTab(idx);
  };

  const setLoadMutex = (promise: Promise<any>) => {
    tab.searchSuper.loadMutex = promise;
  };

  const _renderNewMessage = (message: Message.message | Message.messageService, peerId = message.peerId, threadId?: number) => {
    const historyStorage = historiesStorage[peerId]?.[threadId];
    if(!historyStorage) return;

    for(const mediaTab of tab.searchSuper.mediaTabs) {
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
            getPeerId(savedPeerId) === tab.searchSuper.searchContext.peerId &&
            !history.some((m) => m.mid === message.mid);
        });
      } else {
        filtered = tab.searchSuper.filterMessagesByType([message], inputFilter);
      }

      if(!filtered.length) {
        continue;
      }

      const toInsert = filtered
      .filter((message) => !history.find((m) => m.mid === message.mid && m.peerId === message.peerId))
      .map((message) => ({mid: message.mid, peerId: message.peerId}));
      history.unshift(...toInsert);

      if(
        (mediaTab.type === 'saved' ? tab.peerId === threadId : tab.peerId === peerId) &&
        tab.searchSuper.usedFromHistory[inputFilter] !== -1 &&
        tab.threadId === threadId
      ) {
        tab.searchSuper.usedFromHistory[inputFilter] += filtered.length;
        tab.searchSuper.performSearchResult({messages: filtered, mediaTab, append: false}).then((length) => {
          tab.searchSuper.setCounter(mediaTab.type, tab.searchSuper.counters[mediaTab.type] + length);
        });
      }
    }
  };

  const renderNewMessage = async(message: Message.message | Message.messageService) => {
    const {peerId} = message;
    const isForum = await tab.managers.appPeersManager.isForum(peerId);
    const threadId = getMessageThreadId(message, {isForum});

    _renderNewMessage(message);
    if(threadId) {
      _renderNewMessage(message, undefined, threadId);
    }
  };

  const _deleteDeletedMessages = (
    historyStorage: SharedMediaHistoryStorage,
    peerId: PeerId,
    mids: number[],
    threadId?: number
  ) => {
    const notFound: Set<SearchSuperMediaTab> = new Set();
    for(const mid of mids) {
      for(const mediaTab of tab.searchSuper.mediaTabs) {
        const inputFilter = mediaTab.inputFilter;

        const history = historyStorage[inputFilter];
        if(!history) continue;

        const isGood = mediaTab.type === 'saved' ?
          tab.peerId === threadId :
          tab.peerId === peerId && tab.threadId === threadId;

        const idx = history.findIndex((m) => m.mid === mid);
        if(idx === -1) {
          history.splice(idx, 1);
        }

        if(isGood) {
          const container = tab.searchSuper.tabs[inputFilter];
          const div = container.querySelector(`[data-mid="${mid}"][data-peer-id="${peerId}"]`) as HTMLElement;
          if(div) {
            if(tab.searchSuper.selection.isSelecting) {
              tab.searchSuper.selection.toggleByElement(div);
            }

            const divs = container.querySelectorAll<HTMLElement>('[data-mid][data-peer-id]');
            const idx = Array.from(divs).indexOf(div);
            div.remove();

            if(idx !== -1 && tab.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
              --tab.searchSuper.usedFromHistory[inputFilter];
            }

            tab.searchSuper.setCounter(
              mediaTab.type,
              tab.searchSuper.counters[mediaTab.type] - 1
            );
          } else {
            notFound.add(mediaTab);
          }
        }

        // can have element in different tabs somehow
        // break;
      }
    }

    const filters = Array.from(notFound).map((mediaTab) => ({_: mediaTab.inputFilter}));
    if(!filters.length) {
      return;
    }

    const middleware = tab.searchSuper.middleware.get();
    tab.searchSuper.getSearchCounters(filters).then((counters) => {
      if(!middleware()) {
        return;
      }

      notFound.forEach((mediaTab) => {
        const counter = counters.find((c) => c.filter._ === mediaTab.inputFilter);
        if(counter) {
          tab.searchSuper.setCounter(mediaTab.type, counter.count);
        }
      });
    });
  };

  const deleteDeletedMessages = (peerId: PeerId, msgs: BroadcastEvents['history_delete']['msgs']) => {
    const h = historiesStorage[peerId];
    if(!h) return;
    const mids = [...msgs.keys()];

    for(const threadId in h) {
      _deleteDeletedMessages(h[threadId], peerId, mids, isNaN(+threadId) ? undefined : +threadId);
    }

    tab.scrollable.onScroll();
  };

  // ===== build (the former init body) =====

  tab.container.classList.add('shared-media-container');

  // * header
  const newCloseBtn = Button('btn-icon sidebar-close-button', {noRipple: true});
  tab.closeBtn.replaceWith(newCloseBtn);
  tab.closeBtn = newCloseBtn;

  const animatedCloseIcon = document.createElement('div');
  animatedCloseIcon.classList.add('animated-close-icon');
  newCloseBtn.append(animatedCloseIcon);

  if(tab.isFirst) {
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

    title ??= tab.title.cloneNode() as any;
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

  const titleI18n = new I18n.IntlElement();
  const transitionFirstItem = makeTransitionItem(titleI18n.element, true, tab.title);
  const editBtn = ButtonIcon('edit');

  let lastMediaTabType: SearchSuperMediaTab['type'];
  const btnMenuButtons: ButtonMenuItemOptionsVerifiable[] = [
    {
      icon: 'message',
      text: 'SavedViewAsMessages',
      onClick: () => {
        appImManager.toggleViewAsMessages(rootScope.myId, true);
      },
      verify: () => tab.peerId === rootScope.myId && tab.isFirst
    },
    ...profileStoriesButtonMenu({
      peerId: tab.peerId,
      slider: tab.slider,
      verify: () => lastMediaTabType === 'stories',
      canEdit: () => {
        if(tab.peerId === rootScope.myId) return true;
        if(tab.peerId.isAnyChat()) {
          return tab.managers.appChatsManager.hasRights(tab.peerId.toChatId(), 'edit_stories');
        }
        return false;
      }
    }),
    ...profileStarGiftsButtonMenu({
      get store() { return tab.searchSuper.stargiftsStore },
      get actions() { return tab.searchSuper.stargiftsActions },
      verify: () => lastMediaTabType === 'gifts',
      peerId: tab.peerId
    })
  ];
  const btnMenu = ButtonMenuToggle({
    listenerSetter: tab.listenerSetter,
    direction: 'bottom-left',
    buttons: btnMenuButtons
  });

  transitionFirstItem.element.append(editBtn);

  enum TitleIndex {
    Profile = 0,
    Media = 1
  };

  const transitionSharedMedia = makeTransitionItem(i18n('PeerInfo.SharedMedia'));
  const sharedMediaTitle = transitionSharedMedia.title;

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

  tab.header.append(transitionContainer, btnMenu);

  // * body

  const HEADER_HEIGHT = 56;
  const ADDITIONAL_OFFSET = 16;
  const OFFSET = HEADER_HEIGHT + ADDITIONAL_OFFSET;
  const BODY_PADDING = 16;
  const cb = tab.scrollable.onAdditionalScroll;
  tab.scrollable.onAdditionalScroll = () => {
    cb?.();
    const isSingle = tab.searchSuper.navScrollableContainer.classList.contains('is-single');
    const rect = (isSingle ? tab.searchSuper.container : tab.searchSuper.nav).getBoundingClientRect();
    if(!rect.width) return;

    const top = rect.top - 1;
    setIsSharedMedia(top <= (OFFSET + BODY_PADDING));
  };

  const getTitleIndex = (isSharedMedia = transition.prevId() !== TitleIndex.Profile) => {
    let index = TitleIndex.Profile;
    if(isSharedMedia) {
      index = TitleIndex.Media;
    }

    return index;
  };

  const setIsSharedMedia = (isSharedMedia: boolean) => {
    animatedCloseIcon.classList.toggle('state-back', tab.isFirst || isSharedMedia);
    tab.searchSuper.container.classList.toggle('is-full-viewport', isSharedMedia);
    tab.header.classList.toggle('hide-border', isSharedMedia);

    transition(getTitleIndex(isSharedMedia));

    if(isSharedMedia) {
      tab.container.classList.add('header-filled');
    } else {
      tab.searchSuper.cleanScrollPositions();
    }
  };

  const transition = TransitionSlider({
    content: transitionContainer,
    type: 'slide-fade',
    transitionTime: 400,
    isHeavy: false
  });

  transition(tab.noProfile ? TitleIndex.Media : TitleIndex.Profile);

  const transitionSubtitle = TransitionSlider({
    content: sharedMediaTransitionContainer,
    type: 'slide-fade',
    transitionTime: 400,
    isHeavy: false
  });

  transitionSubtitle(0);

  attachClickEvent(tab.closeBtn, (e) => {
    if(transition.prevId() && !tab.noProfile) {
      tab.scrollable.scrollIntoViewNew({
        element: tab.scrollable.container.querySelector('.profile-content') as HTMLElement,
        position: 'start'
      });
      transition(TitleIndex.Profile);

      if(!tab.isFirst) {
        animatedCloseIcon.classList.remove('state-back');
        tab.container.classList.remove('header-filled');
      }
    } else if(!tab.scrollable.isHeavyAnimationInProgress) {
      tab.slider.onCloseBtnClick();
    }
  }, {listenerSetter: tab.listenerSetter});

  attachClickEvent(editBtn, async() => {
    let editTab: InstanceType<typeof AppEditChatTab> | InstanceType<typeof AppEditContactTab> | InstanceType<typeof AppEditTopicTab> | InstanceType<typeof AppEditBotTab>;
    const {peerId, threadId} = tab;
    if(threadId && await tab.managers.appPeersManager.isForum(peerId)) {
      editTab = tab.slider.createTab(AppEditTopicTab)
    } else if(peerId.isAnyChat()) {
      editTab = tab.slider.createTab(AppEditChatTab);
    } else if(await tab.managers.appUsersManager.isBot(peerId)) {
      editTab = tab.slider.createTab(AppEditBotTab);
    } else {
      editTab = tab.slider.createTab(AppEditContactTab);
    }

    if(!editTab) {
      return;
    }

    if(editTab instanceof AppEditTopicTab) {
      editTab.open({peerId, threadId: tab.threadId});
    } else if(editTab instanceof AppEditBotTab) {
      editTab.open(peerId);
    } else if(editTab instanceof AppEditContactTab) {
      editTab.open(peerId);
    } else {
      // all four edit tabs are scaffolds now; their structural types don't
      // subtract from the instanceof union, so cast to the editChat one.
      (editTab as InstanceType<typeof AppEditChatTab>).open({chatId: peerId.toChatId()});
    }
  }, {listenerSetter: tab.listenerSetter});

  tab.listenerSetter.add(rootScope)('contacts_update', (userId) => {
    if(tab.peerId === userId.toPeerId(false)) {
      toggleEditBtn();
    }
  });

  tab.listenerSetter.add(rootScope)('chat_update', (chatId) => {
    if(tab.peerId === chatId.toPeerId(true)) {
      toggleEditBtn();
    }
  });

  tab.listenerSetter.add(rootScope)('history_multiappend', (message) => {
    renderNewMessage(message);
  });

  tab.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
    deleteDeletedMessages(peerId, msgs);
  });

  tab.searchSuper = new AppSearchSuper({
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
    scrollable: tab.scrollable,
    onChangeTab: (mediaTab) => {
      transitionSubtitle(c.findIndex((item) => item[0] === mediaTab.type));
      lastMediaTabType = mediaTab.type;

      const timeout = mediaTab.type === 'members' && liteMode.isAvailable('animations') ? 250 : 0;
      setTimeout(() => {
        btnAddMembers.classList.toggle('is-hidden', mediaTab.type !== 'members');
      }, timeout);

      if(!tab.isFirst) {
        if(mediaTab.type === 'gifts' || mediaTab.type === 'stories') {
          filterButtonMenuItems(btnMenuButtons).then((items) => {
            btnMenu.classList.toggle('hide', items.length === 0);
          })
        } else {
          btnMenu.classList.add('hide');
        }
      }
    },
    managers: tab.managers,
    onLengthChange: (type, length) => {
      const item = c.find((item) => item[0] === type);
      if(!item) {
        return;
      }

      item[2].compareAndUpdate({key: item[1], args: [length]});
    },
    openSavedDialogsInner: !tab.isFirst,
    slider: tab.slider,
    scrollOffset: OFFSET
  });

  tab.searchSuper.scrollStartCallback = () => {
    setIsSharedMedia(true);
  };

  if(tab.noProfile) {
    tab.scrollable.append(tab.searchSuper.container);
  }

  const btnAddMembers = ButtonCorner({icon: 'addmember_filled'});
  tab.content.append(btnAddMembers);

  attachClickEvent(btnAddMembers, () => {
    addChatUsers({
      peerId: tab.peerId,
      slider: tab.slider
    });
  }, {listenerSetter: tab.listenerSetter});

  (tab as any)._impl = {
    setQuery,
    fillProfileElements,
    loadSidebarMedia,
    setSearchTab,
    setLoadMutex
  };

  return null;
};

export default SharedMedia;
