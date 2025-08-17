import {SavedDialog} from '../../layer';
import {AppManager} from '../appManagers/manager';
import getPeerId from '../appManagers/utils/peers/getPeerId';


export type MonoforumDialog = SavedDialog.monoForumDialog;

namespace MonoforumDialogsStorage {
  export type FetchDialogsOptions = {
    parentPeerId: PeerId;
    limit: number;
  };

  export type GetDialogsOptions = {
    parentPeerId: PeerId;
    limit: number;
    offsetIndex?: number;
  };
}

class MonoforumDialogsStorage extends AppManager {
  private dialogsByPeerId: Record<PeerId, MonoforumDialog[]> = {};

  public async getDialogs({parentPeerId, limit, offsetIndex}: MonoforumDialogsStorage.GetDialogsOptions) {
    return this.fetchAndSaveDialogs({parentPeerId, limit});
  }

  private async fetchAndSaveDialogs({parentPeerId, limit}: MonoforumDialogsStorage.GetDialogsOptions) {
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
    monoforumDialogs.forEach(dialog => {
      dialog.peerId = getPeerId(dialog.peer);
      dialog.parentPeerId = parentPeerId;
      this.setDialogIndex(dialog);
    });

    if(!this.dialogsByPeerId[parentPeerId]) this.dialogsByPeerId[parentPeerId] = [];

    return {
      result,
      count,
      dialogs: monoforumDialogs,
      // TODO: here
      isEnd: false
    };
  }

  private setDialogIndex(dialog: MonoforumDialog) {
    const message = this.appMessagesManager.getMessageByPeer(dialog.peerId || getPeerId(dialog.peer), dialog.top_message);
    dialog.index_0 = message?.date;
  }
}

export default MonoforumDialogsStorage;
