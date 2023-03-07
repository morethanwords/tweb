/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import PopupStickers from '../../components/popups/stickers';
import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import createContextMenu from './createContextMenu';
import findUpClassName from './findUpClassName';
import {EmoticonsDropdown} from '../../components/emoticonsDropdown';
import PopupElement from '../../components/popups';

export default function createStickersContextMenu(options: {
  listenTo: HTMLElement,
  isStickerPack?: boolean,
  verifyRecent?: (target: HTMLElement) => boolean,
  appendTo?: HTMLElement,
  onOpen?: () => any,
  onClose?: () => any,
  onSend?: () => any
}) {
  const {listenTo, isStickerPack, verifyRecent, appendTo, onOpen, onClose, onSend} = options;
  let target: HTMLElement, doc: MyDocument;
  const verifyFavoriteSticker = async(toAdd: boolean) => {
    const favedStickers = await rootScope.managers.acknowledged.appStickersManager.getFavedStickersStickers();
    if(!favedStickers.cached) {
      return false;
    }

    const found = (await favedStickers.result).some((_doc) => _doc.id === doc.id);
    return toAdd ? !found : found;
  };

  return createContextMenu({
    listenTo: listenTo,
    appendTo,
    findElement: (e) => target = findUpClassName(e.target, 'media-sticker-wrapper'),
    onOpen: async() => {
      doc = await rootScope.managers.appDocsManager.getDoc(target.dataset.docId);
      return onOpen?.();
    },
    onClose,
    buttons: [{
      icon: 'stickers',
      text: 'Context.ViewStickerSet',
      onClick: () => PopupElement.createPopup(PopupStickers, doc.stickerSetInput).show(),
      verify: () => !isStickerPack
    }, {
      icon: 'favourites',
      text: 'AddToFavorites',
      onClick: () => rootScope.managers.appStickersManager.faveSticker(doc.id, false),
      verify: () => verifyFavoriteSticker(true)
    }, {
      icon: 'favourites',
      text: 'DeleteFromFavorites',
      onClick: () => rootScope.managers.appStickersManager.faveSticker(doc.id, true),
      verify: () => verifyFavoriteSticker(false)
    }, {
      icon: 'delete',
      text: 'DeleteFromRecent',
      onClick: () => rootScope.managers.appStickersManager.saveRecentSticker(doc.id, true),
      verify: () => verifyRecent?.(target) ?? false
    }, {
      icon: 'mute',
      text: 'Chat.Send.WithoutSound',
      onClick: () => {
        onSend?.();
        return EmoticonsDropdown.sendDocId(doc.id, false, true);
      },
      verify: () => !!(appImManager.chat.peerId && appImManager.chat.peerId !== rootScope.myId)
    }, {
      icon: 'schedule',
      text: 'Chat.Send.ScheduledMessage',
      onClick: () => appImManager.chat.input.scheduleSending(() => appImManager.chat.input.sendMessageWithDocument(doc)),
      verify: () => !!appImManager.chat.peerId
    }]
  });
}
