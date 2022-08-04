/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Photo} from '../layer';
import {AppManagers} from '../lib/appManagers/managers';
import ListLoader, {ListLoaderOptions} from './listLoader';

export default class AvatarListLoader<Item extends {photoId: Photo.photo['id']}> extends ListLoader<Item, any> {
  private peerId: PeerId;
  private managers: AppManagers;

  constructor(options: Omit<ListLoaderOptions<Item, any>, 'loadMore'> & {peerId: PeerId, managers: AppManagers}) {
    super({
      ...options,
      loadMore: (anchor, older, loadCount) => {
        if(this.peerId.isAnyChat() || !older) return Promise.resolve({count: 0, items: []}); // ! это значит, что открыло аватар чата, но следующих фотографий нет.

        const maxId = anchor?.photoId;
        return this.managers.appPhotosManager.getUserPhotos(this.peerId, maxId, loadCount).then((value) => {
          const items = value.photos.map((photoId) => {
            return {element: null as HTMLElement, photoId} as any;
          });

          return {count: value.count, items};
        });
      }
    });

    this.loadedAllUp = true;
    this.peerId = options.peerId;
  }
}
