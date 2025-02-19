/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findAndSplice from '../../helpers/array/findAndSplice';
import assumeType from '../../helpers/assumeType';
import {BotInlineResult, MessagesSavedGifs, Document} from '../../layer';
import {NULL_PEER_ID} from '../mtproto/mtproto_config';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import {AppManager} from './manager';
import getDocumentInput from './utils/docs/getDocumentInput';

export default class AppGifsManager extends AppManager {
  private gifs: MaybePromise<Document.document[]>;
  // private TEST_REFERENCE = false;

  protected after() {
    this.rootScope.addEventListener('user_auth', () => {
      this.rootScope.addEventListener('app_config', () => this.onGifsUpdated());
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateSavedGifs: () => this.onGifsUpdated()
    });
  }

  private async onGifsUpdated() {
    const gifs = await this.getGifs(true);
    this.rootScope.dispatchEvent('gifs_updated', gifs);
  }

  public getGifs(overwrite?: boolean) {
    if(overwrite && Array.isArray(this.gifs)) {
      this.gifs = undefined;
    }

    return this.gifs ??= this.apiManager.invokeApi('messages.getSavedGifs').then((res) => {
      assumeType<MessagesSavedGifs.messagesSavedGifs>(res);
      const referenceContext: ReferenceContext = {type: 'savedGifs'};
      this.gifs = res.gifs.map((doc) => {
        // if(this.TEST_REFERENCE) {
        //   (doc as Document.document).file_reference[0] = 5;
        // }
        return this.appDocsManager.saveDoc(doc, referenceContext);
      }).filter(Boolean);
      // this.TEST_REFERENCE = false;
      return this.gifs;
    });
  }

  public async searchGifs(query: string, nextOffset?: string) {
    const user = await this.appUsersManager.resolveUsername('gif');
    const gifBotPeerId = user.id.toPeerId(false);
    const {results, next_offset} = await this.appInlineBotsManager.getInlineResults(
      NULL_PEER_ID,
      gifBotPeerId,
      query,
      nextOffset
    );

    const documents = (results as BotInlineResult.botInlineMediaResult[])
    .map((result) => result.document)
    .filter(Boolean) as Document.document[];
    return {documents, nextOffset: next_offset};
  }

  public async saveGif(docId: DocId, unsave?: boolean) {
    const [limit, gifs] = await Promise.all([
      this.apiManager.getLimit('gifs'),
      this.getGifs()
    ]);

    const doc = this.appDocsManager.getDoc(docId);
    findAndSplice(gifs as Document.document[], (_doc) => _doc.id === doc.id);

    if(!unsave) {
      gifs.unshift(doc);
      const spliced = gifs.splice(limit, gifs.length - limit);
    }

    this.rootScope.dispatchEvent('gifs_updated', gifs);
    this.rootScope.dispatchEvent('gif_updated', {saved: !unsave, document: doc});

    return this.apiManager.invokeApi('messages.saveGif', {
      id: getDocumentInput(doc),
      unsave
    }).then(() => {
      if(unsave) {
        this.onGifsUpdated();
      }
    });
  }
}
