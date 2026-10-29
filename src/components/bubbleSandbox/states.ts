/*
 * What the bubble sandbox can put a bubble in, axis by axis: each option makes its part of a message out of the
 * message as it is, and an option left at `as is` leaves that part alone.
 */

import {Message, MessageEntity, MessageMedia, MessageReactions, ReactionCount} from '@layer';
import copy from '@helpers/object/copy';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import wrapMessageEntities from '@lib/richTextProcessor/wrapMessageEntities';

export type MediaKind = 'photo' | 'video' | 'document' | 'webpage';

export type StateContext = {
  /** when the sandbox was opened: an edit made in it was made then */
  now: number,
  /** the message above it in the chat, to reply to */
  previousMid?: number,
  /** Saved Messages: its reactions are tags */
  isSaved: boolean,
  /** the account's own user: what a message is forwarded from */
  myId: PeerId,
  /** the panel's own text */
  customText: string,
  /** a post of a channel: it shows how many have seen it */
  hasViews: boolean,
  /** media of the chat's other messages, to show in this one: made up, it would not load */
  media: Partial<Record<MediaKind, MessageMedia>>,
  /** a custom emoji the app knows (a default status), to react with */
  customEmojiId?: DocId,
  /** a voice message: it can be shown as text */
  isVoice: boolean
};

export type StateOption = {
  id: string,
  label: string,
  /** changes the message into this; none: the message as it is */
  apply?: (message: Message.message, context: StateContext) => void,
  /** not there for this message */
  isDisabled?: (context: StateContext) => boolean,
  /** what a voice message reads as text: it comes by an event of its own, not with the message */
  transcription?: {text: string, pending: boolean}
};

export const DIMENSION_IDS = [
  'text', 'media', 'edited', 'views', 'pinned', 'forward', 'reply', 'buttons', 'reactions', 'voice'
] as const;
export type DimensionId = typeof DIMENSION_IDS[number];

export type Dimension = {
  id: DimensionId,
  label: string,
  /** taken by the shuffle unless the panel says otherwise */
  shuffle: boolean,
  options: StateOption[]
};

export type SandboxState = Record<DimensionId, string>;

const AS_IS: StateOption = {id: 'as-is', label: 'As is'};

/**
 * what a reply that comes late replies to: no message has this id (a message's is whole, a send's is its whole one and
 * a ten-thousandth more), the sandbox makes one up when it comes and takes it away when it is closed
 */
export const LATE_REPLY_MID = 0.5;
/** what that message says */
export const LATE_REPLY_TEXT = 'The message replied to, which came a moment later than the reply';

function setText(message: Message.message, text: string, entities: MessageEntity[] = []) {
  // as the worker does with a message it gets (`appMessagesManager.wrapMessageEntities`)
  const wrapped = wrapMessageEntities(text, entities);
  message.message = wrapped.message;
  message.entities = entities;
  message.totalEntities = wrapped.totalEntities;
}

function setMarkdown(message: Message.message, raw: string) {
  const [text, entities] = parseMarkdown(raw, [], true);
  setText(message, text, entities);
}

const text = (id: string, label: string, value: string): StateOption => ({
  id,
  label,
  apply: (message) => setText(message, value)
});

const QUOTED = 'Two lines of a quote,\nthe second one longer than the first';
const CODE = 'const answer = 42;\nconsole.log(answer);';

const getTextOptions = (): StateOption[] => [
  AS_IS,
  // with media: no caption
  text('none', 'None', ''),
  text('short', 'Short', 'Ok'),
  text('line', 'Line', 'See you at the station at seven'),
  text('wrap', 'Two lines', 'See you at the station at seven: the train leaves at a quarter past, so do not be late'),
  text(
    'paragraph',
    'Paragraph',
    'See you at the station at seven: the train leaves at a quarter past, and the next one is only at nine. ' +
    'Bring the tickets, the charger and something to eat on the way, there is no buffet car on this one. ' +
    'If anything changes, write here and I will wait at the entrance.'
  ),
  text('lines', 'Lines', 'Milk\nBread\nEggs\nCoffee'),
  text('hebrew', 'Hebrew', 'נתראה בתחנה בשבע, אל תאחר'),
  {
    id: 'formatted',
    label: 'Formatted',
    apply: (message) => setMarkdown(message, '**Bold**, __italic__, ~~struck~~, `code`, ||a spoiler|| and telegram.org')
  },
  {
    id: 'quote',
    label: 'Quote',
    apply: (message) => setText(message, QUOTED + '\nand the answer below it', [
      {_: 'messageEntityBlockquote', pFlags: {}, offset: 0, length: QUOTED.length}
    ])
  },
  {
    id: 'code',
    label: 'Code',
    apply: (message) => setText(message, CODE, [
      {_: 'messageEntityPre', offset: 0, length: CODE.length, language: 'ts'}
    ])
  },
  text('emoji', 'Big emoji', '👍🔥'),
  {
    id: 'custom',
    label: 'Own',
    apply: (message, context) => setMarkdown(message, context.customText),
    isDisabled: (context) => !context.customText.trim()
  }
];

const reaction = (emoticon: string, count: number, chosenOrder?: number): ReactionCount => ({
  _: 'reactionCount',
  reaction: {_: 'reactionEmoji', emoticon},
  count,
  chosen_order: chosenOrder
});

const reactions = (
  id: string,
  label: string,
  results: (context: StateContext) => ReactionCount[],
  isDisabled?: StateOption['isDisabled']
): StateOption => ({
  id,
  label,
  apply: (message, context) => {
    const value: MessageReactions = {
      _: 'messageReactions',
      // in Saved Messages they are tags: one each, all the user's own
      pFlags: context.isSaved ? {reactions_as_tags: true} : {},
      results: context.isSaved ?
        results(context).map((result, index) => ({...result, count: 1, chosen_order: index})) :
        results(context)
    };
    message.reactions = value;
  },
  isDisabled
});

const transcription = (id: string, label: string, text: string, pending = false): StateOption => ({
  id,
  label,
  transcription: {text, pending},
  isDisabled: (context) => !context.isVoice
});

/**
 * Made anew for each panel rather than kept as a table: a table the module keeps is made once per page, and an edit of
 * it would reload the page instead of showing in the panel at once (`hot-module-transform`)
 */
const views = (id: string, label: string, count: number): StateOption => ({
  id,
  label,
  apply: (message) => void (message.views = count),
  // a channel's post shows them: one made up somewhere else would not be laid out as it is
  isDisabled: (context) => !context.hasViews
});

// buttons that copy their text when clicked: nothing to send anywhere
const buttons = (id: string, label: string, rows: string[][]): StateOption => ({
  id,
  label,
  apply: (message) => void (message.reply_markup = {
    _: 'replyInlineMarkup',
    pFlags: {},
    rows: rows.map((texts) => ({
      _: 'keyboardInlineButtonRow',
      buttons: texts.map((text) => ({
        _: 'keyboardInlineButton',
        text,
        type: {_: 'inlineButtonTypeCopy', copy_text: text}
      }))
    }))
  })
});

const media = (kind: MediaKind, label: string): StateOption => ({
  id: kind,
  label,
  apply: (message, context) => void (message.media = copy(context.media[kind])),
  isDisabled: (context) => !context.media[kind]
});

export const getDimensions = (): Dimension[] => [{
  id: 'text',
  label: 'Text',
  shuffle: true,
  options: getTextOptions()
}, {
  id: 'media',
  label: 'Media',
  shuffle: false,
  options: [
    AS_IS,
    {id: 'none', label: 'None', apply: (message) => void delete message.media},
    media('photo', 'Photo'),
    media('video', 'Video'),
    media('document', 'File'),
    media('webpage', 'Link preview')
  ]
}, {
  id: 'edited',
  label: 'Edited',
  shuffle: true,
  options: [AS_IS, {
    id: 'no',
    label: 'No',
    apply: (message) => {
      delete message.edit_date;
      delete message.pFlags.edit_hide;
    }
  }, {
    id: 'yes',
    label: 'Yes',
    apply: (message, context) => {
      message.edit_date ??= Math.max(message.date, context.now);
      delete message.pFlags.edit_hide;
    }
  }]
}, {
  id: 'views',
  label: 'Views',
  shuffle: false,
  options: [
    AS_IS,
    views('few', 'Few', 12),
    views('more', 'More', 1234),
    views('many', 'Many', 98765)
  ]
}, {
  id: 'pinned',
  label: 'Pinned',
  shuffle: false,
  options: [
    AS_IS,
    {id: 'no', label: 'No', apply: (message) => void delete message.pFlags.pinned},
    {id: 'yes', label: 'Yes', apply: (message) => void (message.pFlags.pinned = true)}
  ]
}, {
  id: 'forward',
  label: 'Forwarded',
  shuffle: false,
  options: [AS_IS, {
    id: 'none',
    label: 'No',
    apply: (message) => {
      delete message.fwd_from;
      delete message.fwdFromId;
    }
  }, {
    id: 'mine',
    label: 'From me',
    apply: (message, context) => {
      message.fwd_from = {
        _: 'messageFwdHeader',
        pFlags: {},
        from_id: {_: 'peerUser', user_id: context.myId.toUserId()},
        date: message.date - 3600
      };
      message.fwdFromId = context.myId;
    }
  }]
}, {
  id: 'reply',
  label: 'Reply',
  shuffle: false,
  options: [AS_IS, {
    id: 'none',
    label: 'None',
    apply: (message) => {
      delete message.reply_to;
      delete message.reply_to_mid;
    }
  }, {
    id: 'previous',
    label: 'To the one above',
    apply: (message, context) => {
      // a stored message names what it replies to by the client's id (`appMessagesManager.saveMessage`)
      message.reply_to = {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: context.previousMid};
      message.reply_to_mid = context.previousMid;
    },
    isDisabled: (context) => !context.previousMid
  }, {
    // a part of it quoted: its quote has a mark at its end
    id: 'quote',
    label: 'Quoting it',
    apply: (message, context) => {
      message.reply_to = {
        _: 'messageReplyHeader',
        pFlags: {quote: true},
        reply_to_msg_id: context.previousMid,
        quote_text: 'A part of it'
      };
      message.reply_to_mid = context.previousMid;
    },
    isDisabled: (context) => !context.previousMid
  }, {
    // a message that is not loaded: the quote reads "Loading" till it comes (`LATE_REPLY`, a moment later)
    id: 'late',
    label: 'To one that comes late',
    apply: (message) => {
      message.reply_to = {_: 'messageReplyHeader', pFlags: {}, reply_to_msg_id: LATE_REPLY_MID};
      message.reply_to_mid = LATE_REPLY_MID;
    }
  }]
}, {
  id: 'buttons',
  label: 'Buttons',
  shuffle: false,
  options: [
    AS_IS,
    {id: 'none', label: 'None', apply: (message) => void delete message.reply_markup},
    buttons('one', 'One', [['Copy']]),
    buttons('rows', 'Two rows', [['Copy', 'Copy too'], ['A longer button below']])
  ]
}, {
  id: 'reactions',
  label: 'Reactions',
  shuffle: false,
  options: [
    AS_IS,
    {id: 'none', label: 'None', apply: (message) => void delete message.reactions},
    reactions('one', 'One', () => [reaction('👍', 1)]),
    reactions('mine', 'Mine', () => [reaction('👍', 1, 0)]),
    reactions('several', 'Several', () => [reaction('👍', 3), reaction('❤', 2, 0), reaction('🔥', 1)]),
    // one more of the first: its count changes
    reactions('more', 'One more', () => [reaction('👍', 4), reaction('❤', 2, 0), reaction('🔥', 1)]),
    reactions('many', 'Many', () => [reaction('👍', 1234), reaction('❤', 2, 0), reaction('🔥', 1)]),
    // drawn by a canvas of the row, over the reaction
    reactions('custom', 'Custom emoji', (context) => [
      {_: 'reactionCount', reaction: {_: 'reactionCustomEmoji', document_id: context.customEmojiId}, count: 2},
      reaction('👍', 3)
    ], (context) => !context.customEmojiId),
    // stars: a reaction of its own look, where chats have them
    reactions('paid', 'Stars', () => [
      {_: 'reactionCount', reaction: {_: 'reactionPaid'}, count: 5},
      reaction('👍', 3)
    ], (context) => context.isSaved)
  ]
}, {
  id: 'voice',
  label: 'Voice as text',
  shuffle: false,
  // what is shown stays till the chat is opened again: nothing takes it back
  options: [
    AS_IS,
    transcription('pending', 'Coming', 'The first words of it', true),
    transcription('short', 'Short', 'Call me when you get there'),
    transcription(
      'long',
      'Long',
      'Call me when you get there: I will be at the entrance with the tickets, and if the train is late, we can ' +
      'still catch the next one at nine'
    )
  ]
}];

export const ORIGINAL_STATE = Object.fromEntries(DIMENSION_IDS.map((id) => [id, 'as-is'])) as SandboxState;

export function getOption(dimension: Dimension, id: string) {
  return dimension.options.find((option) => option.id === id) ?? AS_IS;
}

/** the message as it is, in this state */
export function buildMessage(
  dimensions: Dimension[],
  message: Message.message,
  state: SandboxState,
  context: StateContext
) {
  const built = copy(message);
  for(const dimension of dimensions) {
    const option = getOption(dimension, state[dimension.id]);
    if(option.isDisabled?.(context)) continue;
    option.apply?.(built, context);
  }

  return built;
}
