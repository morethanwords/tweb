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
    count: number; // Total count
  };
}


class MonoforumDialogsStorage extends AppManager {
  private dialogsByPeerId: Record<PeerId, MonoforumDialogsStorage.DialogCollection> = {};

  public clear = () => {
    this.dialogsByPeerId = {};
  }

  public async getDialogs({parentPeerId, limit, offsetIndex}: MonoforumDialogsStorage.GetDialogsArgs) {
    const collection = this.getDialogCollection(parentPeerId);
    const cachedDialogs = collection.items;

    let cachedOffsetIdx = 0;

    while(
      cachedOffsetIdx < cachedDialogs.length &&
      this.getDialogIndex(cachedDialogs[cachedOffsetIdx]) > offsetIndex
    ) cachedOffsetIdx++;

    const cachedSlice = cachedDialogs.slice(cachedOffsetIdx, cachedOffsetIdx + limit);

    const toFetchLimit = limit - cachedSlice.length;
    const toFetchOffsetDialog = lastItem(cachedSlice) || lastItem(cachedDialogs);
    const toFetchOffsetPeer = this.appPeersManager.getInputPeerById(toFetchOffsetDialog?.peerId);

    const fetchedSlice = [];

    if(toFetchLimit) {
      const fetchResult = await this.fetchAndSaveDialogs({parentPeerId, limit: toFetchLimit, offsetPeer: toFetchOffsetPeer});
      fetchedSlice.push(...fetchResult.dialogs);
    }

    const resultingDialogs = [...cachedSlice, ...fetchedSlice];
    resultingDialogs.sort(this.sortDialogsComparator);

    const isEnd = collection.items.length === collection.count;

    return {
      dialogs: resultingDialogs,
      count: collection.count,
      isEnd
    };
  }

  private async fetchAndSaveDialogs({parentPeerId, limit}: MonoforumDialogsStorage.FetchDialogsArgs) {
    const parentPeer = this.appPeersManager.getInputPeerById(parentPeerId);
    const result = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getSavedDialogs',
      params: {
        hash: '0',
        limit,
        offset_date: 0,
        offset_id: 0,
        offset_peer: {_: 'inputPeerEmpty'},
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

    collection.items.push(...dialogs);
    collection.items.sort(this.sortDialogsComparator);

    collection.count = Math.max(count || 0, collection.count, collection.items.length);
  }

  // TODO: Undefined index_0 case
  private sortDialogsComparator = (a: MonoforumDialog, b: MonoforumDialog) => (this.getDialogIndex(b) - this.getDialogIndex(a)) || 0;

  private setAdditionalProps(parentPeerId: PeerId, dialog: MonoforumDialog) {
    dialog.peerId = getPeerId(dialog.peer);
    dialog.parentPeerId = parentPeerId;
    this.setDialogIndex(dialog);
  }

  private setDialogIndex(dialog: MonoforumDialog) {
    const message = this.appMessagesManager.getMessageByPeer(dialog.peerId || getPeerId(dialog.peer), dialog.top_message);
    dialog.index_0 = message?.date;
  }

  private getDialogIndex(dialog: MonoforumDialog) {
    return dialog.index_0;
  }

  private getDialogCollection(parentPeerId: PeerId) {
    if(!this.dialogsByPeerId[parentPeerId]) this.dialogsByPeerId[parentPeerId] = {items: [], count: 0};
    return this.dialogsByPeerId[parentPeerId];
  }
}

export default MonoforumDialogsStorage;
