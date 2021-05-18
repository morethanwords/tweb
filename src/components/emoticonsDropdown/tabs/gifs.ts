/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, { EmoticonsDropdown, EmoticonsTab, EMOTICONSSTICKERGROUP } from "..";
import GifsMasonry from "../../gifsMasonry";
import Scrollable from "../../scrollable";
import { putPreloader } from "../../misc";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import appDocsManager, {MyDocument} from "../../../lib/appManagers/appDocsManager";

export default class GifsTab implements EmoticonsTab {
  private content: HTMLElement;

  init() {
    this.content = document.getElementById('content-gifs');
    const gifsContainer = this.content.firstElementChild as HTMLDivElement;
    gifsContainer.addEventListener('click', EmoticonsDropdown.onMediaClick);

    const scroll = new Scrollable(this.content, 'GIFS');
    const masonry = new GifsMasonry(gifsContainer, EMOTICONSSTICKERGROUP, scroll);
    const preloader = putPreloader(this.content, true);

    apiManager.invokeApi('messages.getSavedGifs', {hash: 0}).then((res) => {
      //console.log('getSavedGifs res:', res);

      if(res._ === 'messages.savedGifs') {
        res.gifs.forEach((doc, idx) => {
          res.gifs[idx] = doc = appDocsManager.saveDoc(doc);
          //if(doc._ === 'documentEmpty') return;
          masonry.add(doc as MyDocument);
        });
      }

      preloader.remove();
    });

    emoticonsDropdown.addLazyLoadQueueRepeat(masonry.lazyLoadQueue, masonry.processInvisibleDiv);

    this.init = null;
  }

  onClose() {

  }
}
