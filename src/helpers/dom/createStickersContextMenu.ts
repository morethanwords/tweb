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
import tsNow from '../tsNow';
import {toastNew} from '../../components/toast';
import {DocumentAttribute, EmojiStatus, InputStickerSet} from '../../layer';

export default function createStickersContextMenu({
  listenTo,
  chatInput,
  isPack,
  verifyRecent,
  appendTo,
  isEmojis,
  isGif,
  canHaveEmojiTimer,
  canViewPack,
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
  isGif?: boolean,
  canHaveEmojiTimer?: boolean,
  canViewPack?: boolean,
  onOpen?: () => any,
  onClose?: () => any,
  onSend?: () => any
}) {
  let target: HTMLElement, doc: MyDocument;
  const verifyFavoriteSticker = async(toAdd: boolean) => {
    const favedStickers = await (isGif ? rootScope.managers.acknowledged.appGifsManager.getGifs() : rootScope.managers.acknowledged.appStickersManager.getFavedStickersStickers());
    if(!favedStickers.cached) {
      return false;
    }

    const found = (await favedStickers.result).some((_doc) => _doc.id === doc.id);
    return toAdd ? !found : found;
  };

  const updateEmojiStatus = (emojiStatus: EmojiStatus) => {
    rootScope.managers.appUsersManager.updateEmojiStatus(emojiStatus).then(() => {
      toastNew({langPackKey: 'SetAsEmojiStatusInfo'});
    });
  };

  const updateEmojiStatusUntil = async(duration: number) => {
    updateEmojiStatus({
      _: 'emojiStatus',
      document_id: doc.id,
      until: tsNow(true) + duration
    });
  };

  let buttons: ButtonMenuItemOptionsVerifiable[] = isEmojis ? [{
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
    icon: 'stickers_face',
    text: 'ViewPackPreview',
    onClick: () => {
      const attribute = doc.attributes.find((attr) => attr._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
      const inputStickerSet = attribute.stickerset as InputStickerSet.inputStickerSetID;
      PopupElement.createPopup(
        PopupStickers,
        inputStickerSet,
        true,
        chatInput
      ).show();
    },
    verify: () => canViewPack
  }, {
    icon: 'smile',
    text: 'SetAsEmojiStatus',
    onClick: () => {
      updateEmojiStatus({
        _: 'emojiStatus',
        document_id: doc.id
      });
    },
    verify: () => !!(rootScope.premium && doc)
  }, {
    icon: 'delete',
    text: 'DeleteFromRecent',
    onClick: () => rootScope.managers.appEmojiManager.deleteRecentEmoji(getEmojiFromElement(target)),
    verify: () => verifyRecent?.(target) ?? false
  }] : [{
    icon: 'stickers',
    text: 'Context.ViewStickerSet',
    onClick: () => PopupElement.createPopup(PopupStickers, doc.stickerSetInput, false, chatInput).show(),
    verify: () => !isPack && !isGif
  }, {
    icon: isGif ? 'gifs' : 'favourites',
    text: isGif ? 'SaveToGIFs' : 'AddToFavorites',
    onClick: () => isGif ? rootScope.managers.appGifsManager.saveGif(doc.id, false) : rootScope.managers.appStickersManager.faveSticker(doc.id, false),
    verify: () => verifyFavoriteSticker(true)
  }, {
    icon: isGif ? 'crossgif' : 'crossstar',
    text: isGif ? 'Message.Context.RemoveGif' : 'DeleteFromFavorites',
    onClick: () => isGif ? rootScope.managers.appGifsManager.saveGif(doc.id, true) : rootScope.managers.appStickersManager.faveSticker(doc.id, true),
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
    verify: () => chatInput && !!chatInput.chat.peerId && !chatInput.chat.starsAmount
  }];

  if(canHaveEmojiTimer) buttons = [{
    text: 'SetEmojiStatusUntil1Hour',
    onClick: () => updateEmojiStatusUntil(3600),
    verify: () => canHaveEmojiTimer
  }, {
    text: 'SetEmojiStatusUntil2Hours',
    onClick: () => updateEmojiStatusUntil(3600 * 2),
    verify: () => canHaveEmojiTimer
  }, {
    text: 'SetEmojiStatusUntil8Hours',
    onClick: () => updateEmojiStatusUntil(3600 * 8),
    verify: () => canHaveEmojiTimer
  }, {
    text: 'SetEmojiStatusUntil2Days',
    onClick: () => updateEmojiStatusUntil(3600 * 24 * 2),
    verify: () => canHaveEmojiTimer
  }];

  return createContextMenu({
    listenTo: listenTo,
    appendTo,
    findElement: (e) => {
      target = e.target as HTMLElement;
      if(isEmojis) {
        const superEmoji = findUpClassName(target, 'super-emoji');
        if(superEmoji) {
          target = superEmoji.firstElementChild as HTMLElement;
        } else {
          target = findUpClassName(target, 'emoji') || findUpClassName(target, 'custom-emoji');
        }
      } else if(isGif) {
        target = findUpClassName(e.target, 'gif');
      } else {
        target = findUpClassName(e.target, 'media-sticker-wrapper');
      }

      return target;
    },
    onOpen: async() => {
      doc = await rootScope.managers.appDocsManager.getDoc(target.dataset.docId);
      return onOpen?.();
    },
    onClose,
    buttons
  });
}
