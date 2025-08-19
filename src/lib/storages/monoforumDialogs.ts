import lastItem from '../../helpers/array/lastItem';
import {InputPeer, SavedDialog} from '../../layer';
import {AppManager} from '../appManagers/manager';
import getPeerId from '../appManagers/utils/peers/getPeerId';


export type MonoforumDialog = SavedDialog.monoForumDialog;

namespace MonoforumDialogsStorage {
  export type FetchDialogsArgs = {
    parentPeerId: PeerId;
    limit: number;
    offsetPeer?: InputPeer;
  };

  export type GetDialogsArgs = {
    parentPeerId: PeerId;
    limit: number;
    offsetIndex?: number;
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
    const cachedDialogs = collection.items;
    const isCollectionIncomplete = !collection.count || collection.items.length < collection.count;

    let cachedOffsetPosition = this.getPositionFromOffsetIndex(cachedDialogs, offsetIndex);

    const cachedSlice = cachedDialogs.slice(cachedOffsetPosition, cachedOffsetPosition + limit);

    const toFetchLimit = limit - cachedSlice.length;
    const toFetchOffsetDialog = lastItem(cachedSlice) || lastItem(cachedDialogs);
    const toFetchOffsetPeer = this.appPeersManager.getInputPeerById(toFetchOffsetDialog?.peerId);

    const fetchedSlice = [];

    if(toFetchLimit && isCollectionIncomplete) {
      const fetchResult = await this.fetchAndSaveDialogs({parentPeerId, limit: toFetchLimit, offsetPeer: toFetchOffsetPeer});
      fetchedSlice.push(...fetchResult.dialogs);
    }

    // Just in case there are duplicates or some reordering stuff
    cachedOffsetPosition = this.getPositionFromOffsetIndex(collection.items, offsetIndex);

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

    dialogs = dialogs.filter(dialog => !collection.map.has(dialog.peerId));

    collection.items.push(...dialogs);
    collection.items.sort(this.sortDialogsComparator);

    dialogs.forEach(dialog => collection.map.set(dialog.peerId, dialog));

    collection.count = Math.max(count || 0, collection.count, collection.items.length);
  }

  // TODO: Undefined index_0 case
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

  private getPositionFromOffsetIndex(dialogs: MonoforumDialog[], offsetIndex: number) {
    let position = 0;

    while(
      position < dialogs.length &&
      this.getDialogIndex(dialogs[position]) > offsetIndex
    ) position++;

    return position;
  }
}

export default MonoforumDialogsStorage;
