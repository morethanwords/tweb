/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import emoticonsDropdown, {EmoticonsDropdown, EmoticonsTab, EMOTICONSSTICKERGROUP} from '..';
import GifsMasonry from '../../gifsMasonry';
import Scrollable from '../../scrollable';
import {putPreloader} from '../../putPreloader';
import {AppManagers} from '../../../lib/appManagers/managers';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';

export default class GifsTab implements EmoticonsTab {
  public content: HTMLElement;
  public scrollable: Scrollable;
  public tabId: number;

  constructor(private managers: AppManagers) {

  }

  init() {
    this.content = document.getElementById('content-gifs');
    const gifsContainer = this.content.firstElementChild as HTMLDivElement;
    attachClickEvent(gifsContainer, EmoticonsDropdown.onMediaClick);

    const scroll = this.scrollable = new Scrollable(this.content, 'GIFS');
    const masonry = new GifsMasonry(gifsContainer, EMOTICONSSTICKERGROUP, scroll);
    const preloader = putPreloader(this.content, true);

    this.managers.appDocsManager.getGifs().then((docs) => {
      docs.forEach((doc) => {
        masonry.add(doc);
      });

      preloader.remove();
    });

    emoticonsDropdown.addLazyLoadQueueRepeat(masonry.lazyLoadQueue, masonry.processInvisibleDiv);

    this.init = null;
  }

  onClose() {

  }
}
