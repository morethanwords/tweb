import middlewarePromise from '../../helpers/middlewarePromise';
import namedPromises from '../../helpers/namedPromises';
import {Chat, Dialog} from '../../layer';
import appDialogsManager from '../../lib/appManagers/appDialogsManager';
import {isDialog} from '../../lib/appManagers/utils/dialogs/isDialog';
import {i18n} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';
import {AutonomousBotforumTopicList} from '../autonomousDialogList/botforumTopics';
import SortedDialogList from '../sortedDialogList';
import wrapPeerTitle from '../wrappers/peerTitle';
import {ForumTab} from './forumTab';


export class BotforumTab extends ForumTab {
  private dialogsCountI18nEl: HTMLElement;

  syncInit(): void {
    super.syncInit();

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
    this.scrollable.append(list);
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

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.peerId !== chatId.toPeerId(true)) {
        return;
      }

      const chat = apiManagerProxy.getChat(chatId);
      if(!(chat as Chat.channel)?.pFlags?.forum) {
        appDialogsManager.toggleForumTab(undefined, this);
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      for(const [, {dialog}] of dialogs) {
        if(isDialog(dialog) && dialog.peerId === this.peerId) {
          this.updateAllChatsDialog(dialog);
        }
      }
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
      this.subtitle.append(this.dialogsCountI18nEl = i18n('ChannelDirectMessages.ThreadsCount', [dialogs ? dialogs.count + '' : '~']))
    } catch{}
  }

  // TODO: there should be monthly users there
  private async updateDialogsCount() {
    if(!this.dialogsCountI18nEl) return;
    const {count} = await this.managers.monoforumDialogsStorage.getDialogs({parentPeerId: this.peerId, limit: 1});
    this.dialogsCountI18nEl.replaceWith(i18n('ChannelDirectMessages.ThreadsCount', [count + '']));
  }
}
