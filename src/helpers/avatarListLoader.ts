import {Photo} from '@layer';
import {AppManagers} from '@lib/managers';
import ListLoader, {ListLoaderOptions} from '@helpers/listLoader';

export default class AvatarListLoader<Item extends {photoId: Photo.photo['id']}> extends ListLoader<Item, any> {
  private peerId: PeerId;
  private managers: AppManagers;
  // The public (fallback) photo, shown as the LAST item (self profile only).
  private fallbackPhotoId: Photo.photo['id'];
  private fallbackAppended: boolean;

  constructor(options: Omit<ListLoaderOptions<Item, any>, 'loadMore'> & {peerId: PeerId, managers: AppManagers, fallbackPhotoId?: Photo.photo['id']}) {
    super({
      ...options,
      loadMore: (anchor, older, loadCount) => {
        if(this.peerId.isAnyChat() || !older) return Promise.resolve({count: 0, items: []}); // ! это значит, что открыло аватар чата, но следующих фотографий нет.

        const maxId = anchor?.photoId;
        // The public (fallback) photo isn't part of the user's photo sequence and
        // is always the LAST item — never page from it. getUserPhotos(max_id) would
        // re-return earlier photos as duplicates, and nothing follows the fallback.
        if(maxId !== undefined && maxId === this.fallbackPhotoId) {
          const count = this.previous.length + (this.current ? 1 : 0) + this.next.length;
          return Promise.resolve({count, items: []});
        }

        return this.managers.appPhotosManager.getUserPhotos(this.peerId, maxId, loadCount).then((value) => {
          const items = value.photos
          .filter((photoId) => photoId !== this.fallbackPhotoId)
          .map((photoId) => {
            return {element: null as HTMLElement, photoId} as any;
          });

          let count = value.count;
          if(this.fallbackPhotoId) {
            // One extra item beyond the real photos.
            if(count !== undefined) count += 1;
            // Append the public photo once, after the last real page.
            if(!this.fallbackAppended && value.photos.length < loadCount) {
              items.push({element: null as HTMLElement, photoId: this.fallbackPhotoId} as any);
              this.fallbackAppended = true;
            }
          }

          return {count, items};
        });
      }
    });

    this.loadedAllUp = true;
    this.peerId = options.peerId;
    this.fallbackPhotoId = options.fallbackPhotoId;
  }
}
