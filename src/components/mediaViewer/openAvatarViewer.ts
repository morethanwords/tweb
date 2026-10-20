import isObject from '@helpers/object/isObject';
import {Photo, MessageAction, Message} from '@layer';
import rootScope from '@lib/rootScope';
import AppMediaViewerAvatar from '@components/mediaViewer/avatar';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

type AvatarViewerItem = Photo.photo['id'] | Message.messageService;

export default async function openAvatarViewer(
  target: HTMLElement,
  peerId: PeerId,
  middleware: () => boolean,
  item?: AvatarViewerItem,
  prevTargets?: {element: HTMLElement, item: AvatarViewerItem}[],
  nextTargets?: typeof prevTargets,
  cachedPhoto?: Photo.photo,
  fallbackPhotoId?: Photo.photo['id']
) {
  const managers = bindManagersToSession(rootScope.managers);
  let photo = cachedPhoto || await managers.appProfileManager.getFullPhoto(peerId);
  if(!middleware() || photo?._ !== 'photo') {
    return;
  }

  const getTarget = () => {
    const good = Array.from(target.querySelectorAll('img')).find((img) => !img.classList.contains('emoji'));
    return good ? target : null;
  };

  if(peerId.isAnyChat()) {
    const inputFilter = 'inputMessagesFilterChatPhotos';
    let message = isObject(item) ? item as Message.messageService : undefined;
    if(!message) {
      message = await managers.appMessagesManager.generateFakeAvatarMessage(peerId, photo);
      if(!middleware()) return;
    }

    if(message) {
      // ! гений в деле, костылируем (но это гениально)
      const messagePhoto = (message.action as MessageAction.messageActionChannelEditPhoto).photo;
      if(messagePhoto.id !== photo.id) {
        message = await managers.appMessagesManager.generateFakeAvatarMessage(peerId, photo);
        if(!middleware()) return;
      }

      const f = (arr: typeof prevTargets) => arr.map((el) => ({
        element: el.element,
        mid: (el.item as Message.messageService).mid,
        peerId: (el.item as Message.messageService).peerId
      }));

      new hotReloadGuard.AppMediaViewer()
      .setSearchContext({
        peerId,
        inputFilter: {_: inputFilter}
      })
      .openMedia({
        message,
        target: getTarget(),
        prevTargets: prevTargets ? f(prevTargets) : undefined,
        nextTargets: nextTargets ? f(nextTargets) : undefined
      });

      return;
    }
  }

  if(photo) {
    if(!isObject(item) && item && photo.id !== item) {
      photo = await managers.appPhotosManager.getPhoto(item);
    }

    const f = (arr: typeof prevTargets) => arr.map((el) => ({
      element: el.element,
      photoId: el.item as string
    }));

    new AppMediaViewerAvatar(peerId, fallbackPhotoId).openMedia({
      photoId: photo.id,
      photo,
      target: getTarget(),
      prevTargets: prevTargets ? f(prevTargets) : undefined,
      nextTargets: nextTargets ? f(nextTargets) : undefined
    });
  }
}
