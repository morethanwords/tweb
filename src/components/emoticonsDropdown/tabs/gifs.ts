import { EmoticonsDropdown, EmoticonsTab, EMOTICONSSTICKERGROUP } from "..";
import GifsMasonry from "../../gifsMasonry";
import Scrollable from "../../scrollable_new";
import { putPreloader } from "../../misc";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appDocsManager, {MyDocument} from "../../../lib/appManagers/appDocsManager";

export default class GifsTab implements EmoticonsTab {
  public content: HTMLElement;

  init() {
    this.content = document.getElementById('content-gifs');
    const gifsContainer = this.content.firstElementChild as HTMLDivElement;
    gifsContainer.addEventListener('click', EmoticonsDropdown.onMediaClick);

    const scroll = new Scrollable(this.content, 'y', 'GIFS', null);
    const masonry = new GifsMasonry(gifsContainer, EMOTICONSSTICKERGROUP, scroll);
    const preloader = putPreloader(this.content, true);

    apiManager.invokeApi('messages.getSavedGifs', {hash: 0}).then((res) => {
      //console.log('getSavedGifs res:', res);

      if(res._ == 'messages.savedGifs') {
        res.gifs.forEach((doc, idx) => {
          res.gifs[idx] = doc = appDocsManager.saveDoc(doc);
          //if(doc._ == 'documentEmpty') return;
          //masonry.add(doc as MyDocument);
        });
      }

      //let line: MTDocument[] = [];

      preloader.remove();
    });

    this.init = null;
  }

  onClose() {

  }
}