/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../appDocsManager';
import type {MyInputMessagesFilter, MyMessage} from '../../appMessagesManager';
import {Message, MessageMedia, MessageEntity, MessageAction, Reaction} from '../../../../layer';
import matchUrl from '../../../richTextProcessor/matchUrl';
import reactionsEqual from '../reactions/reactionsEqual';

export default function filterMessagesByInputFilter({
  inputFilter,
  messages,
  limit,
  savedReaction
}: {
  inputFilter: MyInputMessagesFilter,
  messages: Array<Message.message | Message.messageService>,
  limit: number,
  savedReaction?: (Reaction.reactionEmoji | Reaction.reactionCustomEmoji)[]
}) {
  if(inputFilter === 'inputMessagesFilterEmpty' && !savedReaction) {
    return messages.slice(0, limit);
  }

  const foundMsgs: MyMessage[] = [];
  if(!messages.length) {
    return foundMsgs;
  }

  let filtering = true;
  const neededContents: Partial<{
    [messageMediaType in MessageMedia['_']]: boolean
  }> & Partial<{
    avatar: boolean,
    url: boolean
  }> = {},
    neededDocTypes: MyDocument['type'][] = [],
    // excludeDocTypes: MyDocument['type'][] = [],
    neededFlags: (keyof Message.message['pFlags'])[] = [];

  switch(inputFilter) {
    case 'inputMessagesFilterPhotos':
      neededContents['messageMediaPhoto'] = true;
      break;

    case 'inputMessagesFilterPhotoVideo':
      neededContents['messageMediaPhoto'] = true;
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('video');
      break;

    case 'inputMessagesFilterVideo':
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('video');
      break;

    case 'inputMessagesFilterDocument':
      neededContents['messageMediaDocument'] = true;
      // excludeDocTypes.push('video');
      neededDocTypes.push(undefined, 'photo', 'pdf');
      break;

    case 'inputMessagesFilterVoice':
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('voice');
      break;

    case 'inputMessagesFilterRoundVoice':
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('round', 'voice');
      break;

    case 'inputMessagesFilterRoundVideo':
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('round');
      break;

    case 'inputMessagesFilterMusic':
      neededContents['messageMediaDocument'] = true;
      neededDocTypes.push('audio');
      break;

    case 'inputMessagesFilterUrl':
      neededContents['url'] = true;
      break;

    case 'inputMessagesFilterChatPhotos':
      neededContents['avatar'] = true;
      break;

    case 'inputMessagesFilterPinned':
      neededFlags.push('pinned');
      break;

      /* case 'inputMessagesFilterMyMentions':
      neededContents['mentioned'] = true;
      break; */

    default:
      filtering = false;
      break;
      /* return Promise.resolve({
        count: 0,
        next_rate: 0,
        history: [] as number[]
      }); */
  }

  if(!filtering && !savedReaction?.length) {
    return foundMsgs;
  }

  for(let i = 0, length = messages.length; i < length; ++i) {
    const message: Message.message | Message.messageService = messages[i];
    if(!message) continue;

    // || (neededContents['mentioned'] && message.totalEntities.find((e: any) => e._ === 'messageEntityMention'));

    let found = !filtering;
    if(neededFlags?.some((flag) => (message as any as Message.message).pFlags[flag])) {
      found = true;
    } else if(message._ === 'message') {
      if(message.media && neededContents[message.media._]/*  && !message.fwd_from */) {
        const doc = (message.media as MessageMedia.messageMediaDocument).document as MyDocument;
        if(doc &&
          (
            (neededDocTypes.length && !neededDocTypes.includes(doc.type))/*  ||
            excludeDocTypes.includes(doc.type) */
          )
        ) {
          continue;
        }

        found = true;
      } else if(neededContents['url'] && message.message) {
        const goodEntities = ['messageEntityTextUrl', 'messageEntityUrl'];
        if((message.totalEntities as MessageEntity[]).find((e) => goodEntities.includes(e._)) || matchUrl(message.message)) {
          found = true;
        }
      }

      if(found && savedReaction) {
        const results = message.reactions?.results;
        found = results ? savedReaction.every((reaction) => {
          return results.some((reactionCount) => reactionsEqual(reactionCount.reaction, reaction));
        }) : false;
      }
    } else if(
      neededContents['avatar'] &&
      message.action &&
      ([
        'messageActionChannelEditPhoto' as const,
        'messageActionChatEditPhoto' as const,
        'messageActionChannelEditVideo' as const,
        'messageActionChatEditVideo' as const
      ] as MessageAction['_'][]).includes(message.action._)
    ) {
      found = true;
    }

    if(found && foundMsgs.push(message) >= limit) {
      break;
    }
  }

  return foundMsgs;
}
