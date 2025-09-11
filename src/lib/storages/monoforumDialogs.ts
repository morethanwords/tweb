import filterUnique from '../../helpers/array/filterUnique';
import lastItem from '../../helpers/array/lastItem';
import getObjectKeysAndSort from '../../helpers/object/getObjectKeysAndSort';
import pause from '../../helpers/schedulers/pause';
import {MessagesSavedDialogs, SavedDialog, Update} from '../../layer';
import {MyMessage} from '../appManagers/appMessagesManager';
import {AppManager} from '../appManagers/manager';
import getServerMessageId from '../appManagers/utils/messageId/getServerMessageId';
import isMentionUnread from '../appManagers/utils/messages/isMentionUnread';
import getPeerId from '../appManagers/utils/peers/getPeerId';


export type MonoforumDialog = SavedDialog.monoForumDialog;

namespace MonoforumDialogsStorage {
  export type FetchDialogsArgs = {
    parentPeerId: PeerId;
    limit: number;
    offsetDialog?: MonoforumDialog;
  };

  export type FetchDialogsByIdArgs = {
    parentPeerId: PeerId;
    ids: PeerId[];
  };

  export type GetDialogsArgs = {
    parentPeerId: PeerId;
    limit: number;
    offsetIndex?: number;
  };

  export type ProcessGetDialogsResultArgs = {
    parentPeerId: PeerId;
    result: MessagesSavedDialogs;
  };

  export type SaveDialogsArgs = {
    parentPeerId: PeerId;
    dialogs: MonoforumDialog[];
    count?: number;
  };

  export type DialogCollection = {
    items: MonoforumDialog[];
    map: Map<PeerId, MonoforumDialog>;
    count: number; // Total count
  };

  export type UpdateDialogUnreadMarkArgs = {
    parentPeerId: PeerId;
    peerId: PeerId;
    unread: boolean;
  };
}


type ActionOnBatchArgs = {
  parentPeerId: PeerId;
  ids: PeerId[];
};

class BatchQueue {
  private map = new Map<PeerId, PeerId[]>;
  private isProcessing = false;

  constructor(private actionOnBatch: (args: ActionOnBatchArgs) => Promise<void>) {}

  addToQueue(parentPeerId: PeerId, ids: PeerId[]) {
    const items = this.map.get(parentPeerId) || [];
    if(!this.map.has(parentPeerId)) this.map.set(parentPeerId, items);

    items.push(...ids);

    this.processQueue();
  }

  private async processQueue() {
    if(this.isProcessing) return;
    this.isProcessing = true;

    await pause(0);

    let entries: [PeerId, PeerId[]][];

    while((entries = Array.from(this.map.entries())).length) {
      this.map.clear();
      await Promise.all(
        entries.map(([parentPeerId, ids]) => this.actionOnBatch({parentPeerId, ids: filterUnique(ids)}))
      );
    }

    this.isProcessing = false;
  }
}

class MonoforumDialogsStorage extends AppManager {
  private collectionsByPeerId: Record<PeerId, MonoforumDialogsStorage.DialogCollection> = {};
  private fetchByIdBatchQueue = new BatchQueue((args) => this.fetchAndSaveDialogsById(args));

  public clear = () => {
    this.collectionsByPeerId = {};
  }

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateReadMonoForumInbox: this.onUpdateReadMonoforum,
      updateReadMonoForumOutbox: this.onUpdateReadMonoforum
    });
  }

  public async getDialogs({parentPeerId, limit, offsetIndex}: MonoforumDialogsStorage.GetDialogsArgs) {
    const collection = this.getDialogCollection(parentPeerId);
    const isCollectionIncomplete = !collection.count || collection.items.length < collection.count;

    let cachedOffsetPosition = this.getPositionForOffsetIndex(collection.items, offsetIndex);

    const cachedSlice = collection.items.slice(cachedOffsetPosition, cachedOffsetPosition + limit);

    const toFetchOffsetDialog = lastItem(cachedSlice) || lastItem(collection.items);
    const toFetchLimit = limit - cachedSlice.length; // + Number(!!toFetchOffsetDialog);

    if(toFetchLimit > 0 && isCollectionIncomplete) {
      await this.fetchAndSaveDialogs({parentPeerId, limit: toFetchLimit, offsetDialog: toFetchOffsetDialog});
    }

    // Just in case there are duplicates or some reordering stuff
    cachedOffsetPosition = this.getPositionForOffsetIndex(collection.items, offsetIndex);

    const resultingDialogs = collection.items.slice(cachedOffsetPosition, cachedOffsetPosition + limit);

    const isEnd = cachedOffsetPosition + limit >= collection.items.length && collection.items.length === collection.count;

    return {
      dialogs: resultingDialogs,
      count: collection.count,
      isEnd
    };
  }

  public getDialogByParent(parentPeerId: PeerId, peerId: PeerId) {
    const collection = this.getDialogCollection(parentPeerId);
    return collection.map.get(peerId);
  }

  private async fetchAndSaveDialogs({parentPeerId, limit, offsetDialog}: MonoforumDialogsStorage.FetchDialogsArgs) {
    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);

    const offsetPeer = this.appPeersManager.getInputPeerById(offsetDialog?.peerId);
    const offsetDate = offsetDialog ? this.appMessagesManager.getMessageByPeer(parentPeerId, offsetDialog.top_message)?.date : 0;
    const offsetId = getServerMessageId(offsetDialog?.top_message);

    const result = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getSavedDialogs',
      params: {
        hash: '0',
        limit,
        offset_date: offsetDate,
        offset_id: offsetId,
        offset_peer: offsetPeer,
        parent_peer: parentPeer
      }
    });

    return this.processGetDialogsResult({parentPeerId, result});
  }

  private async fetchAndSaveDialogsById({parentPeerId, ids}: MonoforumDialogsStorage.FetchDialogsByIdArgs) {
    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);
    const result = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getSavedDialogsByID',
      params: {
        ids: ids.map(id => this.appPeersManager.getInputPeerById(id)),
        parent_peer: parentPeer
      }
    });

    // MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] by id', parentPeerId, ids, result});

    const {dialogs} = this.processGetDialogsResult({parentPeerId, result});

    const fetchedDialogsSet = new Set(dialogs.map(dialog => dialog.peerId));

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs});

    const deletedDialogs = ids.filter(id => !fetchedDialogsSet.has(id));
    if(!deletedDialogs.length) return;

    this.dropDeletedDialogs(parentPeerId, deletedDialogs);
    this.rootScope.dispatchEvent('monoforum_dialogs_drop', {ids: deletedDialogs});
  };

  private processGetDialogsResult({parentPeerId, result}: MonoforumDialogsStorage.ProcessGetDialogsResultArgs) {
    if(result._ === 'messages.savedDialogsNotModified') return;

    let count = 0;

    if(result._ === 'messages.savedDialogsSlice') count = result.count;
    else count = result.dialogs.length;

    this.appMessagesManager.saveApiResult(result);

    const monoforumDialogs = result.dialogs.filter(dialog => dialog._ === 'monoForumDialog');

    this.saveDialogs({parentPeerId, dialogs: monoforumDialogs, count});

    return {
      count,
      dialogs: monoforumDialogs
    };
  }

  private saveDialogs({dialogs, parentPeerId, count}: MonoforumDialogsStorage.SaveDialogsArgs) {
    dialogs.forEach(dialog => this.setAdditionalProps(parentPeerId, dialog));

    const collection = this.getDialogCollection(parentPeerId);

    const dialogsSet = new Set(dialogs.map(dialog => dialog.peerId));

    collection.items = collection.items.filter(dialog => !dialogsSet.has(dialog.peerId));

    collection.items.push(...dialogs);
    collection.items.sort(this.sortDialogsComparator);
    dialogs.forEach(dialog => collection.map.set(dialog.peerId, dialog));

    collection.count = Math.max(count || 0, collection.count, collection.items.length);
  }

  private sortDialogsComparator = (a: MonoforumDialog, b: MonoforumDialog) => (this.getDialogIndex(b) - this.getDialogIndex(a)) || 0;

  private setAdditionalProps(parentPeerId: PeerId, dialog: MonoforumDialog) {
    dialog.peerId = getPeerId(dialog.peer);
    dialog.parentPeerId = parentPeerId;
    dialog.top_message = this.appMessagesIdsManager.generateMessageId(dialog.top_message, this.appPeersManager.isChannel(parentPeerId) ? parentPeerId.toChatId() : undefined);
    this.updateDialogIndex(dialog);
  }

  public updateDialogIndex(dialog: MonoforumDialog) {
    // if(dialog.draft?._ !== 'draftMessageEmpty' && dialog.draft?.date) {
    //   date = dialog.draft.date;
    // } else {
    const message = this.appMessagesManager.getMessageByPeer(dialog.parentPeerId, dialog.top_message);

    dialog.index_0 = message?.date;
  }

  private getDialogIndex(dialog: MonoforumDialog) {
    return dialog.index_0;
  }

  private getDialogCollection(parentPeerId: PeerId) {
    if(!this.collectionsByPeerId[parentPeerId]) this.collectionsByPeerId[parentPeerId] = {items: [], map: new Map, count: 0};
    return this.collectionsByPeerId[parentPeerId];
  }

  private getPositionForOffsetIndex(dialogs: MonoforumDialog[], offsetIndex: number) {
    let position = 0;

    while(
      position < dialogs.length &&
      this.getDialogIndex(dialogs[position]) >= offsetIndex
    ) position++;

    return position;
  }

  private dropDeletedDialogs(parentPeerId: PeerId, ids: PeerId[]) {
    const deletedSet = new Set(ids);
    const collection = this.getDialogCollection(parentPeerId);
    const wasCollectionComplete = collection.items.length === collection.count;

    collection.items = collection.items.filter(dialog => !deletedSet.has(dialog.peerId));
    ids.forEach(id => collection.map.delete(id));

    if(wasCollectionComplete) collection.count = collection.items.length;
  }

  public checkLastMessageForExistingDialog(message: MyMessage) {
    const parentPeerId = message.peerId;
    const peerId = getPeerId(message.saved_peer_id);

    if(!peerId || !parentPeerId) return;

    const collection = this.collectionsByPeerId[parentPeerId];
    if(!collection) return;

    const dialog = collection.map.get(peerId);
    if(!dialog) {
      this.updateDialogsByPeerId({parentPeerId, ids: [peerId]});
      return;
    }

    const inboxUnread = !message.pFlags.out && message.pFlags.unread;
    if(inboxUnread && message.mid > dialog.top_message) {
      increment(dialog, 'unread_count');
      if(isMentionUnread(message)) increment(dialog, 'unread_reactions_count');
    }

    if(dialog.top_message > message.mid) return;

    dialog.top_message = message.mid;
    this.updateDialogIndex(dialog);

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: [dialog]});
  }

  public async updateDialogsByPeerId({parentPeerId, ids}: MonoforumDialogsStorage.FetchDialogsByIdArgs) {
    this.fetchByIdBatchQueue.addToQueue(parentPeerId, ids);
  }

  public async updateDialogUnreadMark({parentPeerId, peerId, unread}: MonoforumDialogsStorage.UpdateDialogUnreadMarkArgs) {
    const dialog = this.getDialogByParent(parentPeerId, peerId);
    if(!dialog) return;

    if(!unread) {
      delete dialog.pFlags.unread_mark;
    } else {
      dialog.pFlags.unread_mark = true;
    }

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: [dialog]});
  }

  private onUpdateReadMonoforum = (update: Update.updateReadMonoForumInbox | Update.updateReadMonoForumOutbox) => {
    const channelId = update.channel_id;
    const maxId = this.appMessagesIdsManager.generateMessageId(update.read_max_id, channelId);
    const peerId = getPeerId(update.saved_peer_id);
    const parentPeerId = channelId.toPeerId(true);

    const isOut = update._ === 'updateReadMonoForumOutbox' || undefined;

    const storage = this.appMessagesManager.getHistoryMessagesStorage(parentPeerId);
    const history = getObjectKeysAndSort(storage, 'desc');

    const readMaxId = this.appMessagesManager.getReadMaxIdIfUnread(parentPeerId, peerId);

    for(let i = 0, length = history.length; i < length; i++) {
      const mid = history[i];
      if(mid > maxId) {
        continue;
      }

      const message: MyMessage = storage.get(mid);

      if(message.pFlags.out !== isOut) {
        continue;
      }

      const messageMonoforumthreadId = getPeerId(message.saved_peer_id);
      if(peerId !== messageMonoforumthreadId) {
        continue;
      }

      const isUnread = message.pFlags.unread || (readMaxId && readMaxId < mid);

      if(!isUnread) {
        break;
      }

      this.appMessagesManager.modifyMessage(message, (message) => {
        delete message.pFlags.unread;
      }, storage, true);

      this.rootScope.dispatchEvent('notification_cancel', `msg_${this.getAccountNumber()}_${parentPeerId}_${mid}`);
    }

    const historyStorage = this.appMessagesManager.getHistoryStorage(parentPeerId, peerId);

    if(isOut) historyStorage.readOutboxMaxId = maxId;
    else historyStorage.readMaxId = maxId;

    const dialog = this.getDialogByParent(parentPeerId, peerId);
    if(dialog) this.updateDialogsByPeerId({parentPeerId, ids: [peerId]});

    const mainDialog = this.dialogsStorage.getDialogOnly(parentPeerId);
    if(mainDialog) this.appMessagesManager.reloadConversation(parentPeerId);
  }
}

function increment<T extends object>(obj: T, key: keyof T, by = 1) {
  if(!obj) return;
  obj[key] = (((obj[key] as number) + by) || 0) as any;
}

export default MonoforumDialogsStorage;
