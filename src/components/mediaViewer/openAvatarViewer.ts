import isObject from '@helpers/object/isObject';
import {Photo, MessageAction, Message, UserFull} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import AppMediaViewer from '@components/mediaViewer';
import AppMediaViewerAvatar from '@components/mediaViewer/avatar';

export default async function openAvatarViewer(
  target: HTMLElement,
  peerId: PeerId,
  middleware: () => boolean,
  message?: Message.messageService,
  prevTargets?: {element: HTMLElement, item: Photo.photo['id'] | Message.messageService}[],
  nextTargets?: typeof prevTargets
) {
  let photo = await rootScope.managers.appProfileManager.getFullPhoto(peerId);
  if(!middleware() || !photo) {
    return;
  }

  const getTarget = () => {
    const good = Array.from(target.querySelectorAll('img')).find((img) => !img.classList.contains('emoji'));
    return good ? target : null;
  };

  if(peerId.isAnyChat()) {
    const hadMessage = !!message;
    const inputFilter = 'inputMessagesFilterChatPhotos';
    if(!message) {
      message = await rootScope.managers.appMessagesManager.getHistory({
        peerId,
        inputFilter: {_: inputFilter},
        offsetId: 0,
        limit: 1
      }).then((value) => {
        const mid = value.history[0];
        return apiManagerProxy.getMessageByPeer(peerId, mid) as Message.messageService;
      });

      if(!middleware()) {
        return;
      }
    }

    if(message) {
      // ! гений в деле, костылируем (но это гениально)
      const messagePhoto = (message.action as MessageAction.messageActionChannelEditPhoto).photo;
      if(messagePhoto.id !== photo.id) {
        if(!hadMessage) {
          message = await rootScope.managers.appMessagesManager.generateFakeAvatarMessage(peerId, photo);
        } else {

        }
      }

      const f = (arr: typeof prevTargets) => arr.map((el) => ({
        element: el.element,
        mid: (el.item as Message.messageService).mid,
        peerId: (el.item as Message.messageService).peerId
      }));

      new AppMediaViewer()
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
    if(!isObject(message) && message) {
      photo = await rootScope.managers.appPhotosManager.getPhoto(message);
    }

    // The public (fallback) photo is shown as the LAST item on the user's own
    // profile; pass its id so the viewer's loader keeps it last and never paginates
    // from it. Self only — fallback_photo isn't sent for other users.
    let fallbackPhotoId: Photo.photo['id'];
    if(peerId === rootScope.myId) {
      const userFull = await rootScope.managers.appProfileManager.getProfile(peerId.toUserId());
      const fallback = (userFull as UserFull.userFull)?.fallback_photo as Photo.photo;
      if(fallback?._ === 'photo') fallbackPhotoId = fallback.id;
      if(!middleware()) return;
    }

    const f = (arr: typeof prevTargets) => arr.map((el) => ({
      element: el.element,
      photoId: el.item as string
    }));

    new AppMediaViewerAvatar(peerId, fallbackPhotoId).openMedia({
      photoId: photo.id,
      target: getTarget(),
      prevTargets: prevTargets ? f(prevTargets) : undefined,
      nextTargets: nextTargets ? f(nextTargets) : undefined
    });
  }
}
