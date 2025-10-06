import {Chat} from '../../layer';
import appDialogsManager from '../../lib/appManagers/appDialogsManager';
import appImManager, {AppImManager} from '../../lib/appManagers/appImManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';
import {AutonomousForumTopicList} from '../autonomousDialogList/forumTopics';
import ButtonMenuToggle from '../buttonMenuToggle';
import {ChatType} from '../chat/chat';
import PopupElement from '../popups';
import PopupDeleteDialog from '../popups/deleteDialog';
import appSidebarLeft from '../sidebarLeft';
import AppEditTopicTab from '../sidebarRight/tabs/editTopic';
import AppSharedMediaTab from '../sidebarRight/tabs/sharedMedia';
import SortedDialogList from '../sortedDialogList';
import wrapPeerTitle from '../wrappers/peerTitle';
import {ForumTab} from './forumTab';


export class GroupForumTab extends ForumTab {
  syncInit(): void {
    super.syncInit();

    const isFloating = !this.slider;

    this.xd = new AutonomousForumTopicList({peerId: this.peerId, isFloating, appDialogsManager});
    this.xd.scrollable = this.scrollable;
    this.xd.sortedList = new SortedDialogList({
      itemSize: 64,
      noAvatar: true,
      appDialogsManager,
      scrollable: this.scrollable,
      managers: this.managers,
      log: this.log,
      requestItemForIdx: this.xd.requestItemForIdx,
      onListShrinked: this.xd.onListShrinked,
      indexKey: 'index_0',
      virtualFilterId: this.peerId
    });

    const list = this.xd.sortedList.list;
    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});
    this.scrollable.append(list);
    this.xd.bindScrollable();

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'add',
        text: 'ForumTopic.Context.New',
        onClick: () => {
          appSidebarLeft.createTab(AppEditTopicTab).open(this.peerId);
        },
        separatorDown: true,
        verify: () => this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_topics')
      }, {
        icon: 'info',
        text: 'ForumTopic.Context.Info',
        onClick: () => {
          AppSharedMediaTab.open(appSidebarLeft, this.peerId);
        }
      }, {
        icon: 'message',
        text: 'ForumTopic.Context.ShowAsMessages',
        onClick: this.viewAsMessages,
        verify: () => {
          const chat = appImManager.chat;
          return !chat || !appImManager.isSamePeer(chat, this.getOptionsForMessages());
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
          PopupElement.createPopup(PopupDeleteDialog, this.peerId, undefined, (promise) => {
            this._close();
          });
        },
        separator: true,
        verify: async() => !!(await this.managers.appMessagesManager.getDialogOnly(this.peerId))
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
        appDialogsManager.toggleForumTab(undefined, this);
      }
    });

    this.header.append(btnMenu);
  }

  async asyncInit(): Promise<void> {
    await super.asyncInit();

    const middleware = this.middlewareHelper.get();
    const peerId = this.peerId;

    this.managers.apiUpdatesManager.subscribeToChannelUpdates(this.peerId.toChatId());
    middleware.onDestroy(() => {
      this.managers.apiUpdatesManager.unsubscribeFromChannelUpdates(this.peerId.toChatId());
    });

    const peerTitlePromise = wrapPeerTitle({
      peerId,
      dialog: true,
      wrapOptions: {middleware}
    });

    const setStatusPromise = appImManager.setPeerStatus({
      peerId,
      element: this.subtitle,
      needClear: true,
      useWhitespace: false,
      middleware,
      noTyping: true
    });

    // this.managers.dialogsStorage.getForumTopics(this.peerId).then((messagesForumTopics) => {
    //   console.log(messagesForumTopics);

    //   const promises = messagesForumTopics.topics.map((forumTopic) => {
    //     return this.sortedDialogList.add(forumTopic.id);
    //   });

    //   return Promise.all(promises);
    // }).then(() => {
    //   this.dialogsPlaceholder.detach(this.sortedDialogList.getAll().size);
    // });
    //

    this.xd.onChatsScroll();

    return Promise.all([
      peerTitlePromise,
      setStatusPromise
      // this.xd.onChatsScroll().then((loadResult) => {
      //   return loadResult.cached ? loadResult.renderPromise : undefined
      // })
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
    const chat = appImManager.chat;
    const peerId = this.peerId;
    this._close();
    await this.managers.appChatsManager.toggleViewForumAsMessages(peerId.toChatId(), true);
    appImManager[chat?.peerId === peerId ? 'setPeer' : 'setInnerPeer'](this.getOptionsForMessages());
  };
}
