import middlewarePromise from '@helpers/middlewarePromise';
import namedPromises from '@helpers/namedPromises';
import {Dialog} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {AutonomousMonoforumThreadList} from '@components/autonomousDialogList/monoforumThreads';
import SortedDialogList from '@components/sortedDialogList';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {ForumTab} from '@components/forumTab/forumTab';


export class MonoforumTab extends ForumTab {
  private dialogsCountI18nEl: HTMLElement;

  syncInit(): void {
    super.syncInit();


    const autonomousList = new AutonomousMonoforumThreadList({peerId: this.peerId, appDialogsManager});
    autonomousList.scrollable = this.scrollable;

    const sortedList = autonomousList.sortedList = new SortedDialogList({
      itemSize: 72,
      appDialogsManager,
      scrollable: this.scrollable,
      managers: rootScope.managers,
      requestItemForIdx: autonomousList.requestItemForIdx,
      onListShrinked: autonomousList.onListShrinked,
      indexKey: 'index_0',
      monoforumParentPeerId: this.peerId
    });

    sortedList.addPinned(this.peerId);

    const list = autonomousList.sortedList.list;

    this.xd = autonomousList;

    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});
    this.scrollable.append(list);
    autonomousList.bindScrollable();


    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(dialog.peerId === this.peerId) {
        this._close();
      }
    });

    this.listenerSetter.add(rootScope)('monoforum_dialogs_update', ({dialogs}) => {
      if(!dialogs.find(dialog => dialog.parentPeerId === this.peerId)) return;
      this.updateDialogsCount();
    });

    this.listenerSetter.add(rootScope)('monoforum_dialogs_drop', () => {
      this.updateDialogsCount();
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
        dialogs: this.managers.monoforumDialogsStorage.getDialogs({parentPeerId: peerId, limit: 1})
      }));

      this.title.append(peerTitle);
      this.subtitle.append(this.dialogsCountI18nEl = i18n('ChannelDirectMessages.ThreadsCount', [dialogs ? dialogs.count + '' : '~']))
    } catch{}
  }

  private async updateDialogsCount() {
    if(!this.dialogsCountI18nEl) return;
    const {count} = await this.managers.monoforumDialogsStorage.getDialogs({parentPeerId: this.peerId, limit: 1});
    this.dialogsCountI18nEl.replaceWith(i18n('ChannelDirectMessages.ThreadsCount', [count + '']));
  }
}
