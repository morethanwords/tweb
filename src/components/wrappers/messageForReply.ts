/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import assumeType from "../../helpers/assumeType";
import htmlToDocumentFragment from "../../helpers/dom/htmlToDocumentFragment";
import { getRestrictionReason } from "../../helpers/restrictions";
import escapeRegExp from "../../helpers/string/escapeRegExp";
import limitSymbols from "../../helpers/string/limitSymbols";
import { Message, DocumentAttribute } from "../../layer";
import { MyDocument } from "../../lib/appManagers/appDocsManager";
import { MyDraftMessage } from "../../lib/appManagers/appDraftsManager";
import { MyMessage } from "../../lib/appManagers/appMessagesManager";
import isMessageRestricted from "../../lib/appManagers/utils/messages/isMessageRestricted";
import I18n, { LangPackKey, i18n, UNSUPPORTED_LANG_PACK_KEY } from "../../lib/langPack";
import sortEntities from "../../lib/richTextProcessor/sortEntities";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";
import wrapPlainText from "../../lib/richTextProcessor/wrapPlainText";
import wrapRichText from "../../lib/richTextProcessor/wrapRichText";
import rootScope from "../../lib/rootScope";
import wrapMessageActionTextNew from "./messageActionTextNew";

export default async function wrapMessageForReply(message: MyMessage | MyDraftMessage, text: string, usingMids: number[], plain: true, highlightWord?: string, withoutMediaType?: boolean): Promise<string>;
export default async function wrapMessageForReply(message: MyMessage | MyDraftMessage, text?: string, usingMids?: number[], plain?: false, highlightWord?: string, withoutMediaType?: boolean): Promise<DocumentFragment>;
export default async function wrapMessageForReply(message: MyMessage | MyDraftMessage, text: string = (message as Message.message).message, usingMids?: number[], plain?: boolean, highlightWord?: string, withoutMediaType?: boolean): Promise<DocumentFragment | string> {
  const parts: (Node | string)[] = [];

  let hasAlbumKey = false;
  const addPart = (langKey: LangPackKey, part?: string | HTMLElement | DocumentFragment) => {
    if(langKey) {
      if(part === undefined && hasAlbumKey) {
        return;
      }
      
      part = plain ? I18n.format(langKey, true) : i18n(langKey);
    }
    
    if(plain) {
      parts.push(part);
    } else {
      const el = document.createElement('i');
      if(typeof(part) === 'string') el.innerHTML = part;
      else el.append(part);
      parts.push(el);
    }
  };

  const managers = rootScope.managers;
  const appMessagesManager = managers.appMessagesManager;

  const isRestricted = isMessageRestricted(message as any);

  let entities = (message as Message.message).totalEntities;
  if((message as Message.message).media && !isRestricted) {
    assumeType<Message.message>(message);
    let usingFullAlbum = true;
    if(message.grouped_id) {
      if(usingMids) {
        const mids = await appMessagesManager.getMidsByMessage(message);
        if(usingMids.length === mids.length) {
          for(const mid of mids) {
            if(!usingMids.includes(mid)) {
              usingFullAlbum = false;
              break;
            }
          }
        } else {
          usingFullAlbum = false;
        }
      }

      if(usingFullAlbum) {
        const albumText = await appMessagesManager.getAlbumText(message.grouped_id);
        text = albumText.message;
        entities = albumText.totalEntities;

        if(!withoutMediaType) {
          addPart('AttachAlbum');
          hasAlbumKey = true;
        }
      }
    } else {
      usingFullAlbum = false;
    }

    if((!usingFullAlbum && !withoutMediaType) || !text) {
      const media = message.media;
      switch(media._) {
        case 'messageMediaPhoto':
          addPart('AttachPhoto');
          break;
        case 'messageMediaDice':
          addPart(undefined, plain ? media.emoticon : wrapEmojiText(media.emoticon));
          break;
        case 'messageMediaVenue': {
          text = media.title;
          addPart('AttachLocation');
          break;
        }
        case 'messageMediaGeo':
          addPart('AttachLocation');
          break;
        case 'messageMediaGeoLive':
          addPart('AttachLiveLocation');
          break;
        case 'messageMediaPoll':
          const f = '📊' + ' ' + (media.poll.question || 'poll');
          addPart(undefined, plain ? f : wrapEmojiText(f));
          break;
        case 'messageMediaContact':
          addPart('AttachContact');
          break;
        case 'messageMediaGame': {
          const f = '🎮' + ' ' + media.game.title;
          addPart(undefined, plain ? f : wrapEmojiText(f));
          break;
        }
        case 'messageMediaDocument': {
          const document = media.document as MyDocument;

          if(document.type === 'video') {
            addPart('AttachVideo');
          } else if(document.type === 'voice') {
            addPart('AttachAudio');
          } else if(document.type === 'gif') {
            addPart('AttachGif');
          } else if(document.type === 'round') {
            addPart('AttachRound');
          } else if(document.type === 'sticker') {
            const i = parts.length;
            if(document.stickerEmojiRaw) {
              const f = document.stickerEmojiRaw + ' ';
              addPart(undefined, plain ? f : wrapEmojiText(f));
            }
            
            addPart('AttachSticker');

            // will combine two parts into one
            const p = parts.splice(i, 2);
            if(plain) parts.push((p[0] as string) + (p[1] as string));
            else {
              const span = window.document.createElement('span');
              span.append(...p);
              parts.push(span);
            }

            text = '';
          } else if(document.type === 'audio') {
            const attribute = document.attributes.find((attribute) => attribute._ === 'documentAttributeAudio' && (attribute.title || attribute.performer)) as DocumentAttribute.documentAttributeAudio;
            const f = '🎵' + ' ' + (attribute ? [attribute.title, attribute.performer].filter(Boolean).join(' - ') : document.file_name);
            addPart(undefined, plain ? f : wrapEmojiText(f));
          } else {
            addPart(undefined, plain ? document.file_name : wrapEmojiText(document.file_name));
          }

          break;
        }

        case 'messageMediaInvoice': {
          addPart(undefined, plain ? media.title : wrapEmojiText(media.title));
          break;
        }

        case 'messageMediaUnsupported': {
          addPart(UNSUPPORTED_LANG_PACK_KEY);
          break;
        }

        default:
          //messageText += media._;
          ///////appMessagesManager.log.warn('Got unknown media type!', message);
          break;
      }
    }

    const length = parts.length;
    for(let i = 1; i < length; i += 2) {
      parts.splice(i, 0, ', ');
    }

    if(text && length) {
      parts.push(', ');
    }
  }

  if((message as Message.messageService).action) {
    const actionWrapped = await wrapMessageActionTextNew((message as Message.messageService), plain);
    if(actionWrapped) {
      addPart(undefined, actionWrapped);
    }
  }

  if(isRestricted) {
    text = getRestrictionReason((message as Message.message).restriction_reason).text;
    entities = [];
  }

  if(text) {
    text = limitSymbols(text, 100);

    if(!entities) {
      entities = [];
    }

    if(plain) {
      parts.push(wrapPlainText(text, entities));
    } else {
      // let entities = parseEntities(text.replace(/\n/g, ' '));

      if(highlightWord) {
        highlightWord = highlightWord.trim();
        let found = false;
        let match: any;
        let regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
        entities = entities.slice(); // fix leaving highlight entity
        while((match = regExp.exec(text)) !== null) {
          entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
          found = true;
        }
    
        if(found) {
          sortEntities(entities);
        }
      }

      const messageWrapped = wrapRichText(text, {
        noLinebreaks: true, 
        entities, 
        noLinks: true,
        noTextFormat: true
      });

      parts.push(htmlToDocumentFragment(messageWrapped));
    }
  }

  if(plain) {
    return parts.join('');
  } else {
    const fragment = document.createDocumentFragment();
    fragment.append(...parts);
    return fragment;
  }
}
