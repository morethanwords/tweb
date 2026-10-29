import copy from '@helpers/object/copy';
import {Message} from '@layer';
import {hasRichMessageSpoilers} from '@lib/richMessage';

/**
 * Legacy-shell fields that must remain compatible while a Solid message body is updated in place.
 * Identity, time, text/rich content, translation metadata and read-delivery flags are reconciled
 * separately; everything left here requires a shell render until the complete bubble is Solid.
 * So are the counters that change on their own and have a way of their own into the bubble: the
 * reactions (`messages_reactions`), the views and shares (in the time, made anew with every edit)
 * and the comments' count (`replies_updated`) - as part of the shell, an edit made after any of them
 * changed would render the whole bubble anew. A pin shows in the time too (`peer_pinned_messages`).
 * Whether there are views at all is the shell's still: a post that has them is made as one.
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
    reactions: _reactions,
    views,
    forwards: _forwards,
    replies,
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
    pinned: _pinned,
    ...structuralFlags
  } = pFlags;
  return copy({
    ...structure,
    pFlags: structuralFlags,
    bigEmoji,
    hasBodyContent,
    hasViews: !!views,
    replies: replies && getRepliesShellSignature(replies)
  });
}

// what kind of a thread the message opens, not how much is in it
function getRepliesShellSignature({pFlags, channel_id}: Message.message['replies']) {
  return {pFlags, channel_id};
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
  return !!(message.totalEntities || message.entities)?.some((entity) => entity._ === 'messageEntitySpoiler') ||
    hasRichMessageSpoilers(message.rich_message);
}
