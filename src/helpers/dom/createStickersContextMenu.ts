/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import PopupStickers from '../../components/popups/stickers';
import rootScope from '../../lib/rootScope';
import createContextMenu from './createContextMenu';
import findUpClassName from './findUpClassName';
import PopupElement from '../../components/popups';
import {ButtonMenuItemOptionsVerifiable} from '../../components/buttonMenu';
import ChatInput from '../../components/chat/input';
import {copyTextToClipboard} from '../clipboard';
import {getEmojiFromElement} from '../../components/emoticonsDropdown/tabs/emoji';

export default function createStickersContextMenu({
  listenTo,
  chatInput,
  isPack,
  verifyRecent,
  appendTo,
  isEmojis,
  onOpen,
  onClose,
  onSend
}: {
  listenTo: HTMLElement,
  chatInput?: ChatInput,
  isPack?: boolean,
  verifyRecent?: (target: HTMLElement) => boolean,
  appendTo?: HTMLElement,
  isEmojis?: boolean,
  onOpen?: () => any,
  onClose?: () => any,
  onSend?: () => any
}) {
  let target: HTMLElement, doc: MyDocument;
  const verifyFavoriteSticker = async(toAdd: boolean) => {
    const favedStickers = await rootScope.managers.acknowledged.appStickersManager.getFavedStickersStickers();
    if(!favedStickers.cached) {
      return false;
    }

    const found = (await favedStickers.result).some((_doc) => _doc.id === doc.id);
    return toAdd ? !found : found;
  };

  const buttons: ButtonMenuItemOptionsVerifiable[] = isEmojis ? [{
    icon: 'copy',
    text: 'Copy',
    onClick: () => {
      if(doc) {
        copyTextToClipboard(doc.stickerEmojiRaw, target.outerHTML);
      } else {
        copyTextToClipboard(getEmojiFromElement(target).emoji);
      }
    }
  }, {
    icon: 'delete',
    text: 'DeleteFromRecent',
    onClick: () => rootScope.managers.appEmojiManager.deleteRecentEmoji(getEmojiFromElement(target)),
    verify: () => verifyRecent?.(target) ?? false
  }] : [{
    icon: 'stickers',
    text: 'Context.ViewStickerSet',
    onClick: () => PopupElement.createPopup(PopupStickers, doc.stickerSetInput, false, chatInput).show(),
    verify: () => !isPack
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
      return chatInput.emoticonsDropdown.sendDocId({
        document: doc.id,
        clearDraft: false,
        silent: true,
        target
      });
    },
    verify: () => !!(chatInput && chatInput.chat.peerId && chatInput.chat.peerId !== rootScope.myId)
  }, {
    icon: 'schedule',
    text: 'Chat.Send.ScheduledMessage',
    onClick: () => chatInput.scheduleSending(() => chatInput.sendMessageWithDocument({document: doc, target})),
    verify: () => chatInput && !!chatInput.chat.peerId
  }];

  return createContextMenu({
    listenTo: listenTo,
    appendTo,
    findElement: (e) => target = findUpClassName(e.target, 'media-sticker-wrapper') || (isEmojis ? findUpClassName(e.target, 'emoji') : undefined),
    onOpen: async() => {
      doc = await rootScope.managers.appDocsManager.getDoc(target.dataset.docId);
      return onOpen?.();
    },
    onClose,
    buttons
  });
}
