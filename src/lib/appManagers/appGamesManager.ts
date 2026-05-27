import {Game, Photo, Document, MessagesHighScores} from '@layer';
import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import type {ReferenceContext} from '@lib/storages/references';

export default class AppGamesManager extends AppManager {
  public saveGame(game: Game, mediaContext?: ReferenceContext): Game {
    if(!game || game._ !== 'game') return game;
    if(game.photo) {
      game.photo = this.appPhotosManager.savePhoto(game.photo as Photo, mediaContext) || game.photo;
    }
    if(game.document) {
      game.document = this.appDocsManager.saveDoc(game.document as Document, mediaContext) || game.document;
    }
    return game;
  }

  public setGameScore({peerId, mid, userId, score, editMessage, force}: {
    peerId: PeerId,
    mid: number,
    userId: UserId,
    score: number,
    editMessage?: boolean,
    force?: boolean
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.setGameScore',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: getServerMessageId(mid),
        user_id: this.appUsersManager.getUserInput(userId),
        score,
        edit_message: editMessage,
        force
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
        return true;
      }
    });
  }

  public getGameHighScores(peerId: PeerId, mid: number, userId: UserId): Promise<MessagesHighScores> {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getGameHighScores',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: getServerMessageId(mid),
        user_id: this.appUsersManager.getUserInput(userId)
      },
      processResult: (highScores) => {
        this.appPeersManager.saveApiPeers(highScores);
        return highScores;
      }
    });
  }
}
