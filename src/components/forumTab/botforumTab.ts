import middlewarePromise from '@helpers/middlewarePromise';
import namedPromises from '@helpers/namedPromises';
import asyncThrottle from '@helpers/schedulers/asyncThrottle';
import {Chat, Dialog} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import {i18n} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {AutonomousBotforumTopicList} from '@components/autonomousDialogList/botforumTopics';
import SortedDialogList from '@components/sortedDialogList';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {ForumTab} from '@components/forumTab/forumTab';


export class BotforumTab extends ForumTab {
  private dialogsCountI18nEl: HTMLElement;

  syncInit(): void {
    super.syncInit();

    this.middlewareHelper.get().onClean(() => {
      this.updateDialogsCount.clear();
    });

    this.container.classList.add('topic-dialogs-override');

    const autonomousList = new AutonomousBotforumTopicList({peerId: this.peerId, appDialogsManager});
    autonomousList.scrollable = this.scrollable;

    const sortedList = autonomousList.sortedList = new SortedDialogList({
      itemSize: 64,
      noAvatar: true,
      appDialogsManager,
      scrollable: this.scrollable,
      managers: rootScope.managers,
      requestItemForIdx: autonomousList.requestItemForIdx,
      onListShrinked: autonomousList.onListShrinked,
      indexKey: 'index_0',
      virtualFilterId: this.peerId
    });

    sortedList.addPinned(this.peerId);

    const list = autonomousList.sortedList.list;
    autonomousList.bindScrollable();

    this.xd = autonomousList;

    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});
    this.scrollable.append(list);


    this.listenerSetter.add(rootScope)('history_reload', (peerId) => {
      if(this.peerId !== peerId) {
        return;
      }

      this.xd.fullReset();
    });

    this.listenerSetter.add(rootScope)('user_update', (userId) => {
      if(this.peerId !== userId.toPeerId()) {
        return;
      }

      const user = apiManagerProxy.getUser(userId);
      if(user?._ === 'user' && !user?.pFlags?.bot_forum_view) {
        appDialogsManager.toggleForumTab(undefined, this);
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      for(const [peerId, {dialog, topics}] of dialogs) {
        if(isDialog(dialog) && dialog.peerId === this.peerId) {
          this.updateAllChatsDialog(dialog);
        }
        if(peerId === this.peerId && topics?.size) {
          this.updateDialogsCount();
        }
      }
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog}) => {
      if(!isDialog(dialog) || dialog.peerId !== this.peerId) return;
      this.updateAllChatsDialog(dialog);
    });
  }

  private updateAllChatsDialog(dialog: Dialog.dialog) {
    const dialogElement = this.xd.getDialogElement(this.peerId);
    if(!dialogElement) {
      return;
    }

    appDialogsManager.setLastMessageN({
      dialog,
      dialogElement,
      setUnread: true
    });
  }

  async asyncInit(): Promise<void> {
    await super.asyncInit();

    const middleware = this.middlewareHelper.get();
    const peerId = this.peerId;

    const wrapPromiseWithMiddleware = middlewarePromise(middleware);

    try {
      const {peerTitle, dialogs} = await wrapPromiseWithMiddleware(namedPromises({
        peerTitle: wrapPeerTitle({
          peerId,
          withIcons: true,
          dialog: true,
          wrapOptions: {middleware}
        }),
        dialogs: this.managers.dialogsStorage.getDialogs({
          filterId: this.peerId,
          limit: 1
        })
      }));

      this.title.append(peerTitle);
      this.subtitle.append(this.dialogsCountI18nEl = i18n('TopicsCount', [dialogs ? dialogs.count + '' : '~']))
    } catch{}
  }

  private updateDialogsCount = asyncThrottle(async() => {
    if(!this.dialogsCountI18nEl) return;
    const {count} = await this.managers.dialogsStorage.getDialogs({filterId: this.peerId, limit: 1});
    this.dialogsCountI18nEl.replaceWith(this.dialogsCountI18nEl = i18n('TopicsCount', [count + '']));
  }, 0);
}
