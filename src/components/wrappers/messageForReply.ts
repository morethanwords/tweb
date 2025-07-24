/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import partition from '../../helpers/array/partition';
import assumeType from '../../helpers/assumeType';
import {formatDate} from '../../helpers/date';
import htmlToDocumentFragment from '../../helpers/dom/htmlToDocumentFragment';
import {getRestrictionReason} from '../../helpers/restrictions';
import escapeRegExp from '../../helpers/string/escapeRegExp';
import limitSymbols from '../../helpers/string/limitSymbols';
import {Message, DocumentAttribute, DraftMessage} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {MyDraftMessage} from '../../lib/appManagers/appDraftsManager';
import {MyMessage} from '../../lib/appManagers/appMessagesManager';
import isMessageRestricted from '../../lib/appManagers/utils/messages/isMessageRestricted';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import I18n, {LangPackKey, i18n, UNSUPPORTED_LANG_PACK_KEY, FormatterArguments} from '../../lib/langPack';
import {SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '../../lib/mtproto/mtproto_config';
import parseEntities from '../../lib/richTextProcessor/parseEntities';
import sortEntities from '../../lib/richTextProcessor/sortEntities';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapPlainText from '../../lib/richTextProcessor/wrapPlainText';
import wrapRichText, {WrapRichTextOptions} from '../../lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '../../lib/richTextProcessor/wrapTextWithEntities';
import rootScope from '../../lib/rootScope';
import {Modify} from '../../types';
import Icon from '../icon';
import TranslatableMessage from '../translatableMessage';
import wrapMessageActionTextNew, {WrapMessageActionTextOptions} from './messageActionTextNew';
import {wrapMessageGiveawayResults} from './messageActionTextNewUnsafe';
import wrapPeerTitle from './peerTitle';

export type WrapMessageForReplyOptions = Modify<WrapMessageActionTextOptions, {
  message: MyMessage | MyDraftMessage
}> & {
  text?: string,
  usingMids?: number[],
  highlightWord?: string,
  withoutMediaType?: boolean,
  canTranslate?: boolean
};

export default async function wrapMessageForReply<T extends WrapMessageForReplyOptions>(
  options: T
): Promise<T['plain'] extends true ? string : DocumentFragment> {
  options.text ??= (options.message as Message.message).message;
  if(!options.plain && options.highlightWord) {
    options.highlightWord = options.highlightWord.trim();
  }

  const {message, usingMids, plain, highlightWord, withoutMediaType} = options;

  const parts: (Node | string)[] = [];

  let hasGroupedKey = false;
  const addPart = (langKey: LangPackKey, part?: string | HTMLElement | DocumentFragment, args?: FormatterArguments) => {
    if(langKey) {
      if(part === undefined && hasGroupedKey) {
        return;
      }

      part = plain ? I18n.format(langKey, true, args) : i18n(langKey, args);
    }

    if(plain) {
      parts.push(part);
    } else {
      const el = document.createElement('span');
      if(typeof(part) === 'string') el.innerHTML = part;
      else el.append(part);
      parts.push(el);
    }
  };

  const managers = options.managers || rootScope.managers;
  const appMessagesManager = managers.appMessagesManager;

  const getMyId = () => options.managers ? options.managers.rootScope.getMyId() : rootScope.myId;

  const isRestricted = isMessageRestricted(message as any);

  const someRichTextOptions: WrapRichTextOptions = {
    ...options,
    noLinebreaks: true,
    noLinks: true,
    noTextFormat: true
  };

  let entities = (message as Message.message).totalEntities ?? (message as DraftMessage.draftMessage).entities;
  if((message as Message.message).media && !isRestricted) {
    assumeType<Message.message>(message);
    let usingFullGrouepd = true;
    if(message.grouped_id) {
      if(usingMids) {
        const mids = await appMessagesManager.getMidsByMessage(message);
        if(usingMids.length === mids.length) {
          for(const mid of mids) {
            if(!usingMids.includes(mid)) {
              usingFullGrouepd = false;
              break;
            }
          }
        } else {
          usingFullGrouepd = false;
        }
      }

      if(usingFullGrouepd) {
        const groupedText = await appMessagesManager.getGroupedText(message.grouped_id);
        options.text = groupedText?.message || '';
        entities = groupedText?.totalEntities || [];

        if(!withoutMediaType) {
          addPart('AttachAlbum');
          hasGroupedKey = true;
        }
      }
    } else {
      usingFullGrouepd = false;
    }

    let i = 1;
    if((!usingFullGrouepd && !withoutMediaType) || !options.text) {
      const media = message.media;
      switch(media?._) {
        case 'messageMediaPhoto':
          addPart('AttachPhoto');
          break;
        case 'messageMediaDice':
          addPart(undefined, plain ? media.emoticon : wrapEmojiText(media.emoticon));
          break;
        case 'messageMediaVenue': {
          options.text = media.title;
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
          const pre = '📊' + ' ';
          if(plain) {
            const f = pre + media.poll.question.text;
            addPart(undefined, f);
          } else {
            const textWithEntities = wrapTextWithEntities(media.poll.question);
            const fragment = wrapRichText(textWithEntities.text, {...someRichTextOptions, entities: textWithEntities.entities});
            fragment.prepend(wrapEmojiText(pre));
            addPart(undefined, fragment);
          }
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
            if(plain) parts.push((p[0] as string) + (p[1] ? p[1] as string : ''));
            else {
              const span = window.document.createElement('span');
              span.append(...p);
              parts.push(span);
            }

            options.text = '';
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
          if(media.extended_media?._ === 'messageExtendedMediaPreview') {
            addPart(undefined, plain ? media.description : wrapEmojiText(media.description));
          } else {
            addPart(undefined, plain ? media.title : wrapEmojiText(media.title));
          }

          break;
        }

        case 'messageMediaUnsupported': {
          addPart(UNSUPPORTED_LANG_PACK_KEY);
          break;
        }

        case 'messageMediaStory': {
          if(media.pFlags.via_mention) {
            const storyPeerId = getPeerId(media.peer);
            const isMyStory = storyPeerId === await getMyId();
            addPart(
              isMyStory ? 'StoryMentionYou' : 'StoryMention',
              undefined,
              [await wrapPeerTitle({peerId: isMyStory ? message.peerId : storyPeerId, plainText: plain})]
            )
          } else {
            addPart('Story');
          }

          break;
        }

        // @ts-ignore
        case 'inputMediaWebPage':
        case 'messageMediaPhotoExternal':
        case 'messageMediaDocumentExternal':
        case 'messageMediaWebPage': {
          break;
        }

        case 'messageMediaGiveaway': {
          const date = formatDate(new Date(media.until_date * 1000));
          addPart('Giveaway.ToBeSelectedFull', undefined, [i18n('Giveaway.ToBeSelected', [media.quantity, plain ? date.textContent : date])]);
          break;
        }

        case 'messageMediaGiveawayResults': {
          const {langPackKey, args} = wrapMessageGiveawayResults(media, plain);
          addPart(langPackKey, undefined, args);
          break;
        }

        case 'messageMediaPaidMedia': {
          const extendedMedia = media.extended_media;
          const [photos, videos] = partition(extendedMedia, (media) => {
            if(media._ === 'messageExtendedMediaPreview') {
              return media.video_duration === undefined;
            }

            return media.media._ === 'messageMediaPhoto';
          });

          if(!plain) {
            i += 2;
            addPart(undefined, Icon('star', 'xtr-icon'));
            addPart(undefined, ' ');
          }

          const length = photos.length + videos.length;
          if(length < 2) {
            addPart(photos.length ? 'AttachPhoto' : 'AttachVideo');
            break;
          }

          addPart(
            photos.length && videos.length ? 'Media' : photos.length ? 'Photos' : 'Videos', undefined,
            [length]
          );
          break;
        }

        case 'messageMediaToDo': {
          addPart(undefined, plain ? media.todo.title.text : wrapEmojiText(media.todo.title.text, false, media.todo.title.entities));
          break;
        }

        default:
          addPart(UNSUPPORTED_LANG_PACK_KEY);
          options.text = '';
          // messageText += media._;
          // /////appMessagesManager.log.warn('Got unknown media type!', message);
          break;
      }
    }

    const length = parts.length;
    for(; i < length; i += 2) {
      parts.splice(i, 0, ', ');
    }

    if(options.text && length) {
      parts.push(', ');
    }
  }

  if((message as Message.messageService).action) {
    const actionWrapped = await wrapMessageActionTextNew({
      ...(options as Modify<typeof options, {message: Message.messageService}>),
      noLinks: true,
      noTextFormat: true
    });

    if(actionWrapped) {
      addPart(undefined, actionWrapped);
    }
  }

  if(isRestricted) {
    options.text = getRestrictionReason((message as Message.message).restriction_reason).text;
    entities = [];
  }

  if(options.text) {
    options.text = limitSymbols(options.text, 100);

    entities ??= parseEntities(options.text);

    if(plain) {
      parts.push(wrapPlainText(options.text, entities));
    } else {
      // let entities = parseEntities(text.replace(/\n/g, ' '));

      if(highlightWord) {
        let found = false;
        let match: any;
        const regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
        entities = entities.slice(); // fix leaving highlight entity
        while((match = regExp.exec(options.text)) !== null) {
          entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
          found = true;
        }

        if(found) {
          sortEntities(entities);
        }
      }

      const messagePeerId = (message as Message.message).peerId;
      const shouldHideCode = [SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID].includes(messagePeerId);
      const codeRegex = messagePeerId === SERVICE_PEER_ID ? /[\d\-]{5,7}/ : /[\d\-]{3,8}/;

      if(shouldHideCode &&
        (message as Message.message).fromId === (message as Message.message).peerId) {
        const match = options.text.match(codeRegex);
        if(match) {
          entities = entities.slice();
          entities.push({
            _: 'messageEntitySpoiler',
            offset: match.index,
            length: match[0].length
          });

          sortEntities(entities);
        }
      }

      let what: DocumentFragment | HTMLElement;
      if(options.canTranslate) {
        what = TranslatableMessage({
          peerId: (message as Message.message).peerId,
          message: message as Message.message,
          richTextOptions: someRichTextOptions,
          middleware: options.middleware,
          onTextWithEntities: (textWithEntities) => {
            return {
              ...textWithEntities,
              text: limitSymbols(textWithEntities.text, 100)
            };
          }
        });
      } else {
        what = wrapRichText(options.text, {
          ...someRichTextOptions,
          entities
        });

        what = htmlToDocumentFragment(what);
      }

      parts.push(what);
    }
  }

  if(plain) {
    return parts.join('') as any;
  } else {
    const fragment = document.createDocumentFragment();
    fragment.append(...parts);
    return fragment as any;
  }
}
