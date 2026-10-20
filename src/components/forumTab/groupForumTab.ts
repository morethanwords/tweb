import {Chat} from '@layer';
import {AppImManager} from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {AutonomousForumTopicList} from '@components/autonomousDialogList/forumTopics';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ChatType} from '@components/chat/chatType';
import showDeleteDialogPopup from '@components/popups/deleteDialog';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';
import ForumTopicsSelection from '@components/forumTopicsSelection';
import SortedDialogList from '@components/sortedDialogList';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {ForumTab} from '@components/forumTab/forumTab';
import getGroupForumMembershipAction
from '@components/forumTab/getGroupForumMembershipAction';
import joinChat from '@components/chat/joinChat';
import {toastNew} from '@components/toast';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';


export class GroupForumTab extends ForumTab {
  /** Selecting several topics of this forum at once, for as long as the tab is open */
  protected selection: ForumTopicsSelection;

  syncInit(): void {
    super.syncInit();

    this.container.classList.add('topic-dialogs-override');

    this.xd = new AutonomousForumTopicList({peerId: this.peerId, appDialogsManager: hotReloadGuard.appDialogsManager});
    this.xd.scrollable = this.scrollable;
    this.xd.sortedList = new SortedDialogList({
      itemSize: 64,
      noAvatar: true,
      appDialogsManager: hotReloadGuard.appDialogsManager,
      scrollable: this.scrollable,
      managers: this.managers,
      log: this.log,
      requestItemForIdx: this.xd.requestItemForIdx,
      onListShrinked: this.xd.onListShrinked,
      indexKey: 'index_0',
      virtualFilterId: this.peerId
    });

    const list = this.xd.sortedList.list;

    // * the topics of this forum are selected on their own, and by their own rules - a topic is
    // * neither archived nor marked unread, and it is closed and reopened instead (Android's
    // * `TopicsFragment`). The bar stands in for this tab's header, so it goes with the tab
    this.selection = new ForumTopicsSelection({
      managers: this.managers,
      getHeader: () => this.header,
      getFilterId: () => this.peerId,
      getSortedList: () => this.xd.sortedList,
      getDialogKey: (element) => this.xd.getDialogKeyFromElement(element),
      listContainer: this.scrollable.container
    });

    hotReloadGuard.appDialogsManager.setListClickListener({list, onFound: null, withContext: true, selection: this.selection});
    this.scrollable.append(list);
    this.xd.bindScrollable();

    // a forum keeps its pinned topics in the same kind of block a folder keeps its pinned chats
    this.xd.attachPinnedReorder();

    const getMembershipAction = () => {
      return getGroupForumMembershipAction(
        apiManagerProxy.getChat(this.peerId.toChatId())
      );
    };

    let joining = false;
    const join = async() => {
      if(joining) {
        return;
      }

      joining = true;
      try {
        await joinChat({
          peerId: this.peerId,
          managers: this.managers,
          appImManager: hotReloadGuard.appImManager
        });
      } catch(error) {
        console.error('join forum error', error);
        toastNew({langPackKey: 'Error.AnError'});
      } finally {
        joining = false;
      }
    };

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'add',
        text: 'ForumTopic.Context.New',
        onClick: () => {
          hotReloadGuard.appSidebarLeft.createTab(hotReloadGuard.tabs.AppEditTopicTab).open({peerId: this.peerId});
        },
        separatorDown: true,
        verify: () => this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_topics')
      }, {
        icon: 'info',
        text: 'ForumTopic.Context.Info',
        onClick: () => {
          AppSharedMediaTab.open(hotReloadGuard.appSidebarLeft, this.peerId);
        }
      }, {
        icon: 'message',
        text: 'ForumTopic.Context.ShowAsMessages',
        onClick: this.viewAsMessages,
        verify: () => {
          const chat = hotReloadGuard.appImManager.chat;
          return !chat || !hotReloadGuard.appImManager.isSamePeer(chat, this.getOptionsForMessages());
        }
      }, {
        icon: 'adduser',
        text: 'ForumTopic.Context.AddMember',
        onClick: () => {},
        verify: () => false && this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'invite_users')
      }, {
        icon: 'logout',
        danger: true,
        text: 'LeaveMegaMenu',
        onClick: () => {
          showDeleteDialogPopup(this.peerId, undefined, (promise) => {
            this._close();
          });
        },
        separator: true,
        verify: () => getMembershipAction() === 'leave'
      }, {
        icon: 'adduser',
        text: 'JoinByPeekGroupTitle',
        onClick: join,
        separator: true,
        verify: () => !joining && getMembershipAction() === 'join'
      }, {
        icon: 'adduser',
        text: 'ForumTopic.Context.ApplyToJoin',
        onClick: join,
        separator: true,
        verify: () => !joining && getMembershipAction() === 'request'
      }]
    });

    this.listenerSetter.add(rootScope)('history_reload', (peerId) => {
      if(this.peerId !== peerId) {
        return;
      }

      this.xd.fullReset();
    });

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.peerId !== chatId.toPeerId(true)) {
        return;
      }

      const chat = apiManagerProxy.getChat(chatId);
      if(!(chat as Chat.channel).pFlags.forum) {
        hotReloadGuard.appDialogsManager.toggleForumTab(undefined, this);
      }
    });

    this.header.append(btnMenu);
  }

  async asyncInit(): Promise<void> {
    const managers = bindManagersToSession(this.managers);
    await super.asyncInit();

    const middleware = this.middlewareHelper.get();
    const peerId = this.peerId;

    managers.apiUpdatesManager.subscribeToChannelUpdates(this.peerId.toChatId());
    middleware.onDestroy(() => {
      this.managers.apiUpdatesManager.unsubscribeFromChannelUpdates(this.peerId.toChatId());
    });

    const peerTitlePromise = wrapPeerTitle({
      peerId,
      dialog: true,
      wrapOptions: {middleware}
    });

    const setStatusPromise = hotReloadGuard.appImManager.setPeerStatus({
      peerId,
      element: this.subtitle,
      needClear: true,
      useWhitespace: false,
      middleware,
      noTyping: true
    });

    return Promise.all([
      peerTitlePromise,
      setStatusPromise
    ]).then(([
      peerTitle,
      setStatus
      // _
    ]) => {
      if(!middleware()) {
        return;
      }

      this.title.append(peerTitle);
      setStatus?.();
    });
  }

  public getOptionsForMessages(): Parameters<AppImManager['isSamePeer']>[0] {
    return {
      peerId: this.peerId,
      type: ChatType.Chat
    };
  }

  public viewAsMessages = async() => {
    const chat = hotReloadGuard.appImManager.chat;
    const peerId = this.peerId;
    this._close();
    await this.managers.appChatsManager.toggleViewForumAsMessages(peerId.toChatId(), true);
    hotReloadGuard.appImManager[chat?.peerId === peerId ? 'setPeer' : 'setInnerPeer'](this.getOptionsForMessages());
  };
}
