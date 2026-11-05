import forgetFailedRequest from '@helpers/forgetFailedRequest';
import assumeType from '@helpers/assumeType';
import {BotInlineResult, MessagesSavedGifs, Document} from '@layer';
import {NULL_PEER_ID} from '@appManagers/constants';
import {ReferenceContext} from '@lib/storages/references';
import {AppManager} from '@appManagers/manager';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import OptimisticListChanges from '@appManagers/utils/optimisticListChanges';

// * used only until help.getConfig arrives with the real one
const GIF_SEARCH_USERNAME = 'gif';

export default class AppGifsManager extends AppManager {
  private gifs: MaybePromise<Document.document[]>;
  // * the changes of the list made here that the server has yet to answer
  private gifsChanges = new OptimisticListChanges<Document.document>();
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
    this.rootScope.dispatchEvent('gifs_updated', {gifs});
  }

  public getGifs(overwrite?: boolean) {
    if(overwrite && Array.isArray(this.gifs)) {
      this.gifs = undefined;
    }

    return this.gifs ??= forgetFailedRequest(this.apiManager.invokeApi('messages.getSavedGifs').then((res) => {
      return this.gifs = this.saveGifs(res);
    }), () => this.gifs, () => this.gifs = undefined);
  }

  /**
   * The saved GIFs read from the server for the fresh file references of their documents alone (the references
   * storage's refresh): the list kept here stays as it is. It may hold a change the server has yet to take - one gone
   * back for a fresh reference among them - which the server's list put in its place would drop.
   */
  public refreshGifsReferences() {
    return this.apiManager.invokeApiSingle('messages.getSavedGifs', {hash: 0}).then((res) => {
      this.saveGifs(res);
    });
  }

  private saveGifs(res: MessagesSavedGifs) {
    assumeType<MessagesSavedGifs.messagesSavedGifs>(res);
    const referenceContext: ReferenceContext = {type: 'savedGifs'};
    const gifs = res.gifs.map((doc) => {
      // if(this.TEST_REFERENCE) {
      //   (doc as Document.document).file_reference[0] = 5;
      // }
      return this.appDocsManager.saveDoc(doc, referenceContext);
    }).filter(Boolean);
    // this.TEST_REFERENCE = false;
    return gifs;
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
    const {change, limitReached} = this.gifsChanges.make(gifs, doc, unsave, limit);

    this.rootScope.dispatchEvent('gifs_updated', {gifs});
    return {doc, change, limitReached};
  }

  /**
   * Using a gif puts it back at the front of the saved ones, exactly like tdesktop's
   * Stickers::addSavedGif, Android's MediaDataController.addRecentGif and iOS' ApplyUpdateMessage
   * do for a gif that was just sent. Like them it stays local and asks for nothing: the server
   * reorders the list on its own and `updateSavedGifs` brings the result over.
   */
  public async addRecentGif(docId: DocId) {
    await this.getGifs();
    if(!this.appDocsManager.getDoc(docId)) {
      return;
    }

    // * nothing to answer, it is made again when a save made before it is taken out: so even when the gif is first
    // already, as a save on its way may have put it
    const {change} = await this.unshiftGif(docId);
    this.gifsChanges.answer(change);
  }

  public async saveGif(docId: DocId, unsave?: boolean) {
    const {doc, change, limitReached} = await this.unshiftGif(docId, unsave);
    this.rootScope.dispatchEvent('gif_updated', {saved: !unsave, document: doc, limitReached});

    return this.apiFileManager.invokeApiWithReference({
      context: doc,
      change: true,
      key: 'savedGifs:' + doc.id,
      callback: () => this.apiManager.invokeApi('messages.saveGif', {
        id: getDocumentInput(doc),
        unsave
      })
    }).then(() => {
      this.gifsChanges.answer(change);
      if(unsave) {
        this.onGifsUpdated();
      }
    }, (err) => {
      // * one the server did not take is taken out, and the panel is told so with no toast
      const gifs = this.gifsChanges.revert(change, this.gifs);
      if(gifs) {
        this.rootScope.dispatchEvent('gifs_updated', {gifs, reverted: true});
      }

      throw err;
    });
  }
}
