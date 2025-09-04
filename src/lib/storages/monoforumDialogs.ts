import lastItem from '../../helpers/array/lastItem';
import {InputPeer, MessagesSavedDialogs, SavedDialog} from '../../layer';
import {MyMessage} from '../appManagers/appMessagesManager';
import {AppManager} from '../appManagers/manager';
import getPeerId from '../appManagers/utils/peers/getPeerId';


export type MonoforumDialog = SavedDialog.monoForumDialog;

namespace MonoforumDialogsStorage {
  export type FetchDialogsArgs = {
    parentPeerId: PeerId;
    limit: number;
    offsetPeer?: InputPeer;
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
}


class MonoforumDialogsStorage extends AppManager {
  private collectionsByPeerId: Record<PeerId, MonoforumDialogsStorage.DialogCollection> = {};

  public clear = () => {
    this.collectionsByPeerId = {};
  }

  public async getDialogs({parentPeerId, limit, offsetIndex}: MonoforumDialogsStorage.GetDialogsArgs) {
    const collection = this.getDialogCollection(parentPeerId);
    const isCollectionIncomplete = !collection.count || collection.items.length < collection.count;

    let cachedOffsetPosition = this.getPositionForOffsetIndex(collection.items, offsetIndex);

    const cachedSlice = collection.items.slice(cachedOffsetPosition, cachedOffsetPosition + limit);

    const toFetchLimit = cachedOffsetPosition + limit - cachedSlice.length;
    const toFetchOffsetDialog = lastItem(cachedSlice) || lastItem(collection.items);
    const toFetchOffsetPeer = this.appPeersManager.getInputPeerById(toFetchOffsetDialog?.peerId);

    if(toFetchLimit > 0 && isCollectionIncomplete) {
      await this.fetchAndSaveDialogs({parentPeerId, limit: toFetchLimit, offsetPeer: toFetchOffsetPeer});
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

  private async fetchAndSaveDialogs({parentPeerId, limit, offsetPeer}: MonoforumDialogsStorage.FetchDialogsArgs) {
    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);
    const result = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getSavedDialogs',
      params: {
        hash: '0',
        limit,
        offset_date: 0,
        offset_id: 0,
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

    const {dialogs} = this.processGetDialogsResult({parentPeerId, result});

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs});
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
    this.setDialogIndex(dialog);
  }

  private setDialogIndex(dialog: MonoforumDialog) {
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

  public checkLastMessageForExistingDialog(message: MyMessage) {
    const parentPeerId = message.peerId;
    const peerId = getPeerId(message.saved_peer_id);

    if(!peerId) return;

    const collection = this.collectionsByPeerId[parentPeerId];
    if(!collection) return;

    const dialog = collection.map.get(peerId);
    if(!dialog) {
      // TODO: Batch those things if more updates at once?
      this.fetchAndSaveDialogsById({parentPeerId, ids: [peerId]});
      return;
    }

    if(dialog.top_message > message.mid) return;

    dialog.top_message = message.mid;

    this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: [dialog]});
  }
}

export default MonoforumDialogsStorage;
