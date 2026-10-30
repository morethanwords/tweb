import type {Chat, ChatPhoto, Photo, UserProfilePhoto} from '@layer';
import type {AppManagers} from '@lib/managers';
import type {LangPackKey} from '@lib/langPack';
import {SERVICE_PEER_ID} from '@appManagers/constants';
import getPeerPhoto from '@appManagers/utils/peers/getPeerPhoto';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {showProfilePhotoReport} from '@components/popups/reportAd';

type PhotoOwner = 'user' | 'group' | 'channel';

const REPORT_TITLES: {[owner in PhotoOwner]: LangPackKey} = {
  user: 'ReportProfilePhotoTitle',
  group: 'ReportGroupPhotoTitle',
  channel: 'ReportChannelPhotoTitle'
};

const SET_MAIN_HINTS: {[owner in PhotoOwner]: LangPackKey} = {
  user: 'MainProfilePhotoSetHint',
  group: 'MainGroupProfilePhotoSetHint',
  channel: 'MainChannelProfilePhotoSetHint'
};

function getPhotoOwner(peerId: PeerId): PhotoOwner {
  if(peerId.isUser()) {
    return 'user';
  }

  return (apiManagerProxy.getPeer(peerId) as Chat.channel)?.pFlags?.broadcast ? 'channel' : 'group';
}

/**
 * What tdesktop's viewer offers for a profile or chat photo besides saving and deleting it:
 * - "Set as Main": one's own photo that is not the main one (nor the public one, which is set apart), or a
 *   chat's earlier photo where its info may be changed;
 * - "Report": anyone else's — not Telegram's notifications, not the personal photo one gave a contact, not a
 *   chat whose info one may change.
 */
export function getProfilePhotoActions(options: {
  peerId: PeerId,
  photoId: Photo.photo['id'],
  myId: PeerId,
  /** the photo the peer wears now */
  currentPhoto?: UserProfilePhoto | ChatPhoto,
  /** a chat: whether its info may be changed */
  canChangeInfo?: boolean,
  /** one's own public photo */
  fallbackPhotoId?: Photo.photo['id']
}) {
  const {peerId, photoId, currentPhoto} = options;
  const isCurrent = (currentPhoto as UserProfilePhoto.userProfilePhoto)?.photo_id === photoId;
  if(peerId.isUser()) {
    if(peerId === options.myId) {
      return {canSetMain: !isCurrent && photoId !== options.fallbackPhotoId, canReport: false};
    }

    const isPersonal = isCurrent && !!(currentPhoto as UserProfilePhoto.userProfilePhoto).pFlags?.personal;
    return {canSetMain: false, canReport: peerId !== SERVICE_PEER_ID && !isPersonal};
  }

  const canChangeInfo = !!options.canChangeInfo;
  return {canSetMain: canChangeInfo && !isCurrent, canReport: !canChangeInfo};
}

/** `getProfilePhotoActions` for a peer as the mirrors know it */
export function getPeerProfilePhotoActions(options: Omit<Parameters<typeof getProfilePhotoActions>[0], 'myId' | 'currentPhoto'>) {
  return getProfilePhotoActions({
    ...options,
    myId: rootScope.myId,
    currentPhoto: getPeerPhoto(apiManagerProxy.getPeer(options.peerId))
  });
}

/**
 * Makes the photo the peer's main one; says so, or that it failed — but for an account left meanwhile, whose
 * session-bound managers drop the answer (`MIDDLEWARE`): that says nothing. Resolves to whether it did
 */
export async function setMainProfilePhoto(managers: AppManagers, peerId: PeerId, photoId: Photo.photo['id']) {
  try {
    if(peerId.isUser()) {
      await managers.appProfileManager.updateProfilePhoto(photoId);
    } else {
      await managers.appChatsManager.setExistingPhoto(peerId.toChatId(), photoId);
    }
  } catch(err) {
    if((err as ApiError)?.type !== 'MIDDLEWARE') {
      console.error('set main photo error', err);
      toastNew({langPackKey: 'Error.AnError'});
    }

    return false;
  }

  toastNew({langPackKey: SET_MAIN_HINTS[getPhotoOwner(peerId)]});
  return true;
}

export function reportProfilePhoto(peerId: PeerId, photoId: Photo.photo['id']) {
  showProfilePhotoReport(peerId, photoId, REPORT_TITLES[getPhotoOwner(peerId)]);
}
