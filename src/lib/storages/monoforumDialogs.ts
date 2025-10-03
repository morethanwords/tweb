import filterUnique from '../../helpers/array/filterUnique';
import lastItem from '../../helpers/array/lastItem';
import getObjectKeysAndSort from '../../helpers/object/getObjectKeysAndSort';
import tsNow from '../../helpers/tsNow';
import {DraftMessage, MessagesGetSavedDialogs, MessagesSavedDialogs, SavedDialog, Update} from '../../layer';
import {Pair} from '../../types';
import {MyMessage, SUGGESTED_POST_MIN_THRESHOLD_SECONDS} from '../appManagers/appMessagesManager';
import {AppManager} from '../appManagers/manager';
import getServerMessageId from '../appManagers/utils/messageId/getServerMessageId';
import isMentionUnread from '../appManagers/utils/messages/isMentionUnread';
import getPeerId from '../appManagers/utils/peers/getPeerId';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';


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
    /**
     * The items ordered based on the draft's date (if it's not empty) or on the top_message's date
     */
    items: MonoforumDialog[];

    /**
     * The items that we know for sure that are in the right order of the top_message with NO gaps
     *
     * This avoids the case when the top_message gets deleted and replaced with another very old message,
     * the dialog then being thrown at the end of the list. Then if we use that last dialog as offset we
     * might end up with a lot of missing dialogs. That last dialog must be kicked outta here
     *
     * These dialogs are sorted by the date of the top_message, NOT by the date of the draft,
     * making sure the ordering based on the draft's date doesn't make us use the wrong offset
     */
    stable: MonoforumDialog[];

    map: Map<PeerId, MonoforumDialog>;
    count: number; // Total count
  };

  export type UpdateDialogUnreadMarkArgs = {
    parentPeerId: PeerId;
    peerId: PeerId;
    unread: boolean;
  };

  export type ToggleSuggestedPostApprovalArgs = {
    parentPeerId: PeerId;
    messageId: number;
    reject?: boolean;
    rejectComment?: string;
    scheduleTimestamp?: number;
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

    if(this.isProcessing) return;

    this.isProcessing = true;
    queueMicrotask(() => {
      this.processQueue();
    });
  }

  private async processQueue() {
    let entries: Pair<PeerId, PeerId[]>[];

    while((entries = Array.from(this.map.entries())).length) {
      this.map.clear();
      await Promise.all(
        entries.map(([parentPeerId, ids]) => this.actionOnBatch({parentPeerId, ids: filterUnique(ids)}))
      );
    }

    this.isProcessing = false;
  }
}

const DEBUG = false;

class MonoforumDialogsStorage extends AppManager {
  private collectionsByPeerId: Record<PeerId, MonoforumDialogsStorage.DialogCollection> = {};
  private fetchByIdBatchQueue = new BatchQueue((args) => this.fetchAndSaveDialogsById(args));

  private queuedDraftDialogs: Record<PeerId, PeerId[]> = {};

  public clear = () => {
    this.collectionsByPeerId = {};
  }

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateMonoForumNoPaidException: this.onUpdateMonoForumNoPaidException
    });
  }

  public async getDialogs({parentPeerId, limit, offsetIndex}: MonoforumDialogsStorage.GetDialogsArgs) {
    const collection = this.getDialogCollection(parentPeerId);
    const checkIsCollectionIncomplete = () => !collection.count || collection.items.length < collection.count;

    let cachedOffsetPosition = this.getPositionForOffsetIndex(collection.items, offsetIndex);

    // This is just a guard in case something wrong happens while fetching the dialogs
    // If we notice no dialogs were added, the loop will break
    let previousStableLength = -1;

    // Fetch while we have enough dialogs, note that we might get the same dialogs the second time if there were drafts for them
    while(
      cachedOffsetPosition + limit > collection.stable.length && // check if we have enough stable dialogs already
      checkIsCollectionIncomplete() && // stop when the collection is full
      previousStableLength !== collection.stable.length // guard in case the request doesn't add new dialogs
    ) {
      previousStableLength = collection.stable.length;
      const toFetchOffsetDialog = lastItem(collection.stable);

      await this.fetchAndSaveDialogs({parentPeerId, limit, offsetDialog: toFetchOffsetDialog});
    }

    let promise: Promise<any>;

    promise = this.appDraftsManager.addMissedDialogsOrVoid();
    if(promise) await promise;

    promise = this.fetchQueuedDraftDialogs(parentPeerId);
    if(promise) await promise;

    // Just in case there are duplicates or some reordering stuff
    cachedOffsetPosition = this.getPositionForOffsetIndex(collection.items, offsetIndex);

    const resultingDialogs = collection.items.slice(cachedOffsetPosition, cachedOffsetPosition + limit);

    const isEnd = cachedOffsetPosition + limit >= collection.items.length && collection.items.length === collection.count;

    if(DEBUG) MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] getDialogs', parentPeerId, limit, offsetIndex, resultingDialogs, isEnd, count: collection.count});

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

  public enqueDraftDialog(parentPeerId: PeerId, peerId: PeerId) {
    (this.queuedDraftDialogs[parentPeerId] ??= []).push(peerId);
  }

  public checkPreloadedDraft(parentPeerId: PeerId, draft: DraftMessage.draftMessage) {
    if(draft?.reply_to?._ !== 'inputReplyToMessage' && draft?.reply_to?._ !== 'inputReplyToMonoForum') return;
    const peerId = getPeerId(draft.reply_to.monoforum_peer_id);
    if(!peerId) return;

    if(DEBUG) MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] enqueing draft', parentPeerId, peerId, draft});
    this.enqueDraftDialog(parentPeerId, peerId);
  }

  private fetchQueuedDraftDialogs(parentPeerId: PeerId) {
    let toFetch = this.queuedDraftDialogs[parentPeerId];
    delete this.queuedDraftDialogs[parentPeerId];
    if(!toFetch?.length) return;

    const collection = this.getDialogCollection(parentPeerId);
    toFetch = toFetch.filter(peerId => !collection.map.has(peerId));
    if(!toFetch.length) return;

    if(DEBUG) MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] fetching enqued draft dialogs', parentPeerId, toFetch});
    return this.fetchAndSaveDialogsById({parentPeerId, ids: filterUnique(toFetch)});
  }

  private async fetchAndSaveDialogs({parentPeerId, limit, offsetDialog}: MonoforumDialogsStorage.FetchDialogsArgs) {
    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);

    const offsetPeer = this.appPeersManager.getInputPeerById(offsetDialog?.peerId);
    const offsetDate = offsetDialog ? this.appMessagesManager.getMessageByPeer(parentPeerId, offsetDialog.top_message)?.date : 0;
    const offsetId = getServerMessageId(offsetDialog?.top_message);

    let p: MessagesGetSavedDialogs;
    const result = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getSavedDialogs',
      params: p = {
        hash: '0',
        limit,
        offset_date: offsetDate,
        offset_id: offsetId,
        offset_peer: offsetPeer,
        parent_peer: parentPeer
      }
    });

    if(DEBUG) MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] fetching dialogs', parentPeerId, p, result});

    const processedResult = this.processGetDialogsResult({parentPeerId, result});
    const {dialogs} = processedResult;

    const newStableIds = new Set(dialogs.map(dialog => dialog.peerId));

    const collection = this.getDialogCollection(parentPeerId);

    collection.stable = collection.stable.filter(dialog => !newStableIds.has(dialog.peerId));

    collection.stable.push(...dialogs);
    collection.stable.sort(this.sortStableDialogsComparator); // Theoretically this is useless, but let it be

    return processedResult;
  }

  private async fetchAndSaveDialogsById({parentPeerId, ids}: MonoforumDialogsStorage.FetchDialogsByIdArgs) {
    const collection = this.getDialogCollection(parentPeerId);
    const isCollectionEmpty = !collection.count;

    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);
    const [result] = await Promise.all([
      this.apiManager.invokeApiSingleProcess({
        method: 'messages.getSavedDialogsByID',
        params: {
          ids: ids.map(id => this.appPeersManager.getInputPeerById(id)),
          parent_peer: parentPeer
        }
      }),
      isCollectionEmpty && this.fetchAndSaveDialogs({parentPeerId, limit: 1}) // make sure we have the correct count as the by id request doesn't return it
    ]);

    if(DEBUG) MTProtoMessagePort.getInstance<false>().invoke('log', {m: '[my-debug] by id', parentPeerId, ids, result});

    const {dialogs} = this.processGetDialogsResult({parentPeerId, result});

    const lastStableDialogIndex = lastItem(collection.stable)?.stableIndex || Infinity;

    const fetchedDialogsSet = new Set(dialogs.map(dialog => dialog.peerId));

    collection.stable = collection.stable.filter(dialog => !fetchedDialogsSet.has(dialog.peerId));

    collection.stable.push(...dialogs.filter(dialog => dialog.stableIndex >= lastStableDialogIndex));
    collection.stable.sort(this.sortStableDialogsComparator);

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs});

    const deletedDialogs = ids.filter(id => !fetchedDialogsSet.has(id));
    if(!deletedDialogs.length) return;

    this.dropDeletedDialogs(parentPeerId, deletedDialogs);
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

  private sortStableDialogsComparator = (a: MonoforumDialog, b: MonoforumDialog) => (this.getStableDialogIndex(b) - this.getStableDialogIndex(a)) || 0;

  private setAdditionalProps(parentPeerId: PeerId, dialog: MonoforumDialog) {
    dialog.peerId = getPeerId(dialog.peer);
    dialog.parentPeerId = parentPeerId;
    dialog.top_message = this.appMessagesIdsManager.generateMessageId(dialog.top_message, this.appPeersManager.isChannel(parentPeerId) ? parentPeerId.toChatId() : undefined);
    this.updateDialogIndex(dialog, false);
  }

  public updateDialogIndex(dialog: MonoforumDialog, resort = true) {
    const message = this.appMessagesManager.getMessageByPeer(dialog.parentPeerId, dialog.top_message);

    let sortDate: number;
    if(dialog.draft?._ !== 'draftMessageEmpty' && dialog.draft?.date) {
      sortDate = dialog.draft.date;
    } else {
      sortDate = message?.date;
    }

    dialog.index_0 = sortDate;
    dialog.stableIndex = message?.date;

    if(!resort || this.isResortingQueued) return;

    this.isResortingQueued = true;
    queueMicrotask(() => {
      this.isResortingQueued = false;
      this.resortDialogs(dialog.parentPeerId);
    });
  }

  private isResortingQueued = false;
  /**
   * Resorting the dialogs when only a few items changed their index will be almost instant even for tens of thousands of dialogs.
   */
  private resortDialogs(parentPeerId: PeerId) {
    const collection = this.getDialogCollection(parentPeerId);
    collection.items.sort(this.sortDialogsComparator);
    collection.stable.sort(this.sortStableDialogsComparator);
  }

  private getDialogIndex(dialog: MonoforumDialog) {
    return dialog.index_0;
  }

  private getStableDialogIndex(dialog: MonoforumDialog) {
    return dialog.stableIndex;
  }

  private getDialogCollection(parentPeerId: PeerId): MonoforumDialogsStorage.DialogCollection {
    return this.collectionsByPeerId[parentPeerId] ??= {
      items: [],
      stable: [],
      map: new Map,
      count: 0
    };
  }

  private getPositionForOffsetIndex(dialogs: MonoforumDialog[], offsetIndex: number) {
    let position = 0;

    while(
      position < dialogs.length &&
      this.getDialogIndex(dialogs[position]) >= offsetIndex
    ) position++;

    return position;
  }

  public dropDeletedDialogs(parentPeerId: PeerId, ids: PeerId[]) {
    const deletedSet = new Set(ids);
    const collection = this.getDialogCollection(parentPeerId);
    const wasCollectionComplete = collection.items.length === collection.count;

    collection.items = collection.items.filter(dialog => !deletedSet.has(dialog.peerId));
    collection.stable = collection.stable.filter(dialog => !deletedSet.has(dialog.peerId));

    ids.forEach(id => collection.map.delete(id));

    if(wasCollectionComplete) collection.count = collection.items.length;

    this.rootScope.dispatchEvent('monoforum_dialogs_drop', {parentPeerId, ids});
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

  public updateDialogsByPeerId({parentPeerId, ids}: MonoforumDialogsStorage.FetchDialogsByIdArgs) {
    this.fetchByIdBatchQueue.addToQueue(parentPeerId, ids);
  }

  public updateDialogIfExists(parentPeerId: PeerId, peerId: PeerId) {
    const dialog = this.getDialogByParent(parentPeerId, peerId);
    if(!dialog) return;

    this.updateDialogsByPeerId({parentPeerId, ids: [peerId]});
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

  public async toggleSuggestedPostApproval({parentPeerId, messageId, reject, rejectComment, scheduleTimestamp}: MonoforumDialogsStorage.ToggleSuggestedPostApprovalArgs) {
    const updates = await this.apiManager.invokeApi('messages.toggleSuggestedPostApproval', {
      peer: this.appPeersManager.getInputPeerById(parentPeerId),
      msg_id: getServerMessageId(messageId),
      reject,
      reject_comment: rejectComment,
      schedule_date: scheduleTimestamp && scheduleTimestamp >= tsNow(true) + SUGGESTED_POST_MIN_THRESHOLD_SECONDS ?
        scheduleTimestamp :
        undefined
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  private onUpdateMonoForumNoPaidException = (update: Update.updateMonoForumNoPaidException) => {
    const parentPeerId = update.channel_id.toPeerId(true);
    const peerId = getPeerId(update.saved_peer_id);

    const dialog = this.getDialogByParent(parentPeerId, peerId);
    if(!dialog) return;

    if(!dialog.pFlags) dialog.pFlags = {};

    if(update.pFlags?.exception) {
      dialog.pFlags.nopaid_messages_exception = true;
    } else {
      delete dialog.pFlags.nopaid_messages_exception;
    }

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: [dialog]});
  }
}

export function increment<T extends object>(obj: T, key: keyof T, by = 1) {
  if(!obj) return;
  obj[key] = Math.max(((obj[key] as number) + by) || 0, 0) as any;
}

export default MonoforumDialogsStorage;
