import { EmoticonsDropdown, EmoticonsTab, EMOTICONSSTICKERGROUP } from "..";
import GifsMasonry from "../../gifsMasonry";
import Scrollable from "../../scrollable_new";
import { putPreloader } from "../../misc";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import { MTDocument } from "../../../types";
import appDocsManager from "../../../lib/appManagers/appDocsManager";

export default class GifsTab implements EmoticonsTab {
  public content: HTMLElement;

  init() {
    this.content = document.getElementById('content-gifs');
    const gifsContainer = this.content.firstElementChild as HTMLDivElement;
    gifsContainer.addEventListener('click', EmoticonsDropdown.onMediaClick);

    const masonry = new GifsMasonry(gifsContainer);
    const scroll = new Scrollable(this.content, 'y', 'GIFS', null);
    const preloader = putPreloader(this.content, true);

    apiManager.invokeApi('messages.getSavedGifs', {hash: 0}).then((_res) => {
      let res = _res as {
        _: 'messages.savedGifs',
        gifs: MTDocument[],
        hash: number
      };
      //console.log('getSavedGifs res:', res);

      //let line: MTDocument[] = [];

      preloader.remove();
      res.gifs.forEach((doc, idx) => {
        res.gifs[idx] = appDocsManager.saveDoc(doc);
        masonry.add(res.gifs[idx], EMOTICONSSTICKERGROUP, EmoticonsDropdown.lazyLoadQueue);
      });
    });

    this.init = null;
  }

  onClose() {

  }
}