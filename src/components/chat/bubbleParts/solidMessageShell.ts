import copy from '@helpers/object/copy';
import {Message} from '@layer';

/**
 * Legacy-shell fields that must remain compatible while a Solid message body is updated in place.
 * Identity, time, text/rich content, translation metadata and read-delivery flags are reconciled
 * separately; everything left here requires a shell render until the complete bubble is Solid.
 */
export function getSolidMessageBodyStructure(message: Message.message) {
  const bigEmoji = getBigEmojiShellSignature(message);
  // A streamed draft always owns a body host, even before its first grapheme arrives.
  // Keep that host structurally compatible with the first non-empty/final revision.
  const hasBodyContent = !!message.pFlags.currentlyTyping || !!message.message || !!message.rich_message;
  const {
    flags: _flags,
    flags2: _flags2,
    id: _id,
    mid: _mid,
    peerId: _peerId,
    fromId: _fromId,
    date: _date,
    random_id: _randomId,
    message: _message,
    entities: _entities,
    totalEntities: _totalEntities,
    rich_message: _richMessage,
    summary_from_language: _summaryFromLanguage,
    edit_date: _editDate,
    pFlags,
    ...structure
  } = message;
  const {
    currentlyTyping: _currentlyTyping,
    edit_hide: _editHide,
    unread: _unread,
    mentioned: _mentioned,
    media_unread: _mediaUnread,
    silent: _silent,
    offline: _offline,
    ...structuralFlags
  } = pFlags;
  return copy({...structure, pFlags: structuralFlags, bigEmoji, hasBodyContent});
}

function getBigEmojiShellSignature(message: Message.message) {
  if(message.pFlags.currentlyTyping || message.media || message.factcheck || !message.message) return;

  const entities = message.totalEntities || message.entities;
  if(!entities?.length) return;

  let count = 0;
  let textLength = 0;
  for(let index = 0; index < entities.length; ++index) {
    const entity = entities[index];
    if(entity._ === 'messageEntityCustomEmoji') {
      // The parsed list also contains the underlying emoji entity for a custom emoji.
      ++index;
    } else if(entity._ !== 'messageEntityEmoji') {
      continue;
    }

    ++count;
    textLength += entity.length;
  }

  return count && textLength === message.message.replace(/\s/g, '').length ? count : undefined;
}

export function hasMessageTextSpoilers(message: Message.message) {
  return !!(message.totalEntities || message.entities)?.some((entity) => entity._ === 'messageEntitySpoiler');
}
