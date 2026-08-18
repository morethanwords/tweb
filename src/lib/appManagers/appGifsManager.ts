import findAndSplice from '@helpers/array/findAndSplice';
import assumeType from '@helpers/assumeType';
import {BotInlineResult, MessagesSavedGifs, Document} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import {ReferenceContext} from '@lib/storages/references';
import {AppManager} from '@appManagers/manager';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';

// * used only until help.getConfig arrives with the real one
const GIF_SEARCH_USERNAME = 'gif';

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
    // * the bot that answers GIF search is named by the server config, it is not always @gif
    const config = await this.apiManager.getConfig();
    const user = await this.appUsersManager.resolveUsername(config.gif_search_username || GIF_SEARCH_USERNAME);
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

  /**
   * Moves the gif to the front of the saved ones — adding it when it is not among them — and
   * caps the list at the limit, reporting whether that pushed one out.
   */
  private async unshiftGif(docId: DocId, unsave?: boolean) {
    const [limit, gifs] = await Promise.all([
      this.apiManager.getLimit('gifs'),
      this.getGifs()
    ]);

    // resolved after the list, which is what saves the documents it is made of
    const doc = this.appDocsManager.getDoc(docId);
    findAndSplice(gifs as Document.document[], (_doc) => _doc.id === doc.id);

    let limitReached = false;
    if(!unsave) {
      gifs.unshift(doc);
      const spliced = gifs.splice(limit, gifs.length - limit);
      limitReached = spliced.length > 0;
    }

    this.rootScope.dispatchEvent('gifs_updated', gifs);
    return {doc, limitReached};
  }

  /**
   * Using a gif puts it back at the front of the saved ones, exactly like tdesktop's
   * Stickers::addSavedGif, Android's MediaDataController.addRecentGif and iOS' ApplyUpdateMessage
   * do for a gif that was just sent. Like them it stays local and asks for nothing: the server
   * reorders the list on its own and `updateSavedGifs` brings the result over.
   */
  public async addRecentGif(docId: DocId) {
    const gifs = await this.getGifs();
    const doc = this.appDocsManager.getDoc(docId);
    if(!doc || gifs[0]?.id === doc.id) {
      return;
    }

    await this.unshiftGif(docId);
  }

  public async saveGif(docId: DocId, unsave?: boolean) {
    const {doc, limitReached} = await this.unshiftGif(docId, unsave);
    this.rootScope.dispatchEvent('gif_updated', {saved: !unsave, document: doc, limitReached});

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
