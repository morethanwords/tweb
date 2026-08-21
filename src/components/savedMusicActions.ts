import {Message, MessageMedia} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import canSaveMessageMedia from '@appManagers/utils/messages/canSaveMessageMedia';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import type {AppSidebarRight} from '@components/sidebarRight';
import AppSavedMusicTab from '@components/sidebarRight/tabs/savedMusic';

/**
 * The playlist tab is one of a kind. Both places that open it — the profile row and the topbar
 * plate — stay reachable while it is up, so opening it again has to bring back the one already
 * there rather than stack another copy on the slider; for a different peer the old one goes once
 * the new has slid in.
 *
 * The slider comes in as an argument because the profile takes its own from the hot-reload guard.
 */
export function openSavedMusicTab(appSidebarRight: AppSidebarRight, peerId: PeerId) {
  const prevTab = appSidebarRight.getTab(AppSavedMusicTab);
  if(prevTab?.peerId === peerId) {
    appSidebarRight.toggleSidebar(true);
    return;
  }

  const tab = appSidebarRight.createTab(AppSavedMusicTab);
  tab.peerId = peerId;
  tab.open();
  appSidebarRight.toggleSidebar(true);
  if(prevTab) {
    setTimeout(() => prevTab.close(), 300);
  }
}

/**
 * The document behind a message when it can go into the profile playlist — a plain song, matching
 * `DocumentData::isMusicForProfile` (tdesktop). Voice notes, round videos and non-audio documents
 * are not eligible, and neither is media the sender protected from saving.
 */
export function getSavedMusicDocument(message: MyMessage, noForwards?: boolean): MyDocument | undefined {
  if(!message || message._ !== 'message' || !canSaveMessageMedia(message, noForwards)) {
    return;
  }

  const media = (message as Message.message).media as MessageMedia.messageMediaDocument;
  if(media?._ !== 'messageMediaDocument') {
    return;
  }

  const doc = getMediaFromMessage(message, true) as MyDocument;
  return doc?._ === 'document' && doc.type === 'audio' ? doc : undefined;
}

export async function addToProfileMusic(docId: DocId) {
  // The manager answers false when it can't resolve the document — don't claim a save that the
  // profile won't actually show.
  if(await rootScope.managers.appSavedMusicManager.saveMusic(docId)) {
    toastNew({langPackKey: 'SavedMusic.Added'});
  }
}

export function confirmRemoveFromProfileMusic() {
  return confirmationPopup({
    titleLangKey: 'SavedMusic.RemoveFromProfile',
    descriptionLangKey: 'SavedMusic.RemoveConfirm',
    button: {
      langKey: 'Remove',
      isDanger: true
    }
  }).then(() => true, () => false);
}

export async function removeFromProfileMusic(docId: DocId) {
  if(await rootScope.managers.appSavedMusicManager.removeMusic(docId)) {
    toastNew({langPackKey: 'SavedMusic.Removed'});
  }
}
