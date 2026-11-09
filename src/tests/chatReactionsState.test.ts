import {describe, expect, test} from 'vitest';
import type {ChatReactions} from '@layer';
import {
  isReactionTyping,
  buildChannelPayload,
  buildGroupPayload,
  editChannelField,
  fieldTokenToReaction,
  PAID_PLAIN_EMOJI,
  getChannelFieldReactions,
  getRequiredBoostLevel,
  initChannelDraft,
  initGroupDraft,
  insertChannelReaction,
  pickedEmojiToReaction,
  reactionToDocId,
  removeChannelReaction,
  removeChannelReactionAt,
  savePayloadsEqual,
  setChannelEnabled,
  setChannelLimit,
  setChannelPaid,
  setGroupMode,
  toggleGroupReaction
} from '@components/sidebarRight/tabs/chatReactionsState';
import {PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';

import {custom, emoji, paid, some} from '@/tests/helpers/reactions';

const none: ChatReactions.chatReactionsNone = {_: 'chatReactionsNone'};

const ACTIVE = ['👍', '👎', '❤', '🔥'];
const base = () => initChannelDraft({available: some(emoji('👍'), custom('7')), paid: false, limit: 11, activeEmoticons: ACTIVE});

describe('group reactions', () => {
  test('a loaded list keeps custom emoji and their order', () => {
    const draft = initGroupDraft(some(custom('10'), emoji('👍'), custom('20')));
    expect(draft.mode).toBe('some');
    expect(draft.reactions).toEqual([custom('10'), emoji('👍'), custom('20')]);

    const toggled = toggleGroupReaction(draft, emoji('❤'), true);
    expect(buildGroupPayload(toggled).reactions).toEqual(some(custom('10'), emoji('👍'), custom('20'), emoji('❤')));

    const unchecked = toggleGroupReaction(toggled, emoji('👍'), false);
    expect(buildGroupPayload(unchecked).reactions).toEqual(some(custom('10'), custom('20'), emoji('❤')));
  });

  test('All keeps the flag it was opened with, a switch to All allows the standard ones only', () => {
    const opened = initGroupDraft({_: 'chatReactionsAll', pFlags: {allow_custom: true}});
    expect(buildGroupPayload(opened).reactions).toEqual({_: 'chatReactionsAll', pFlags: {allow_custom: true}});

    const away = setGroupMode(opened, 'none', ACTIVE);
    const back = setGroupMode(away, 'all', ACTIVE);
    expect(buildGroupPayload(back).reactions).toEqual({_: 'chatReactionsAll', pFlags: {}});

    const fromNone = setGroupMode(initGroupDraft(none), 'all', ACTIVE);
    expect(buildGroupPayload(fromNone).reactions).toEqual({_: 'chatReactionsAll', pFlags: {}});
  });

  test('Some with nothing picked starts with the thumbs, else the first two active', () => {
    expect(setGroupMode(initGroupDraft(none), 'some', ACTIVE).reactions).toEqual([emoji('👍'), emoji('👎')]);
    expect(setGroupMode(initGroupDraft(undefined), 'some', ['😁', '👎', '🔥']).reactions).toEqual([emoji('👎')]);
    expect(setGroupMode(initGroupDraft(none), 'some', ['😁', '🔥', '🎉']).reactions).toEqual([emoji('😁'), emoji('🔥')]);
  });

  test('Some keeps its earlier list across another mode', () => {
    const draft = initGroupDraft(some(emoji('🔥')));
    const back = setGroupMode(setGroupMode(draft, 'all', ACTIVE), 'some', ACTIVE);
    expect(back.reactions).toEqual([emoji('🔥')]);
  });

  test('taking off the last one turns reactions off', () => {
    const draft = toggleGroupReaction(initGroupDraft(some(emoji('🔥'))), emoji('🔥'), false);
    expect(draft.mode).toBe('none');
    expect(buildGroupPayload(draft)).toEqual({reactions: none, options: {}});
    // * and Some seeds again afterwards
    expect(setGroupMode(draft, 'some', ACTIVE).reactions).toEqual([emoji('👍'), emoji('👎')]);
  });

  test('a group sends no maximum and no Stars', () => {
    expect(buildGroupPayload(initGroupDraft(some(emoji('👍')))).options).toEqual({});
  });
});

describe('channel reactions: opening', () => {
  test('All opens on, with the active standard reactions in the catalog order', () => {
    const draft = initChannelDraft({available: {_: 'chatReactionsAll', pFlags: {}}, paid: false, limit: 11, activeEmoticons: ACTIVE});
    expect(draft.enabled).toBe(true);
    expect(draft.reactions).toEqual(ACTIVE.map(emoji));
  });

  test('Some opens on with its list; Stars never in the free list', () => {
    const draft = initChannelDraft({available: some(custom('1'), emoji('🔥'), paid), paid: true, limit: 5, activeEmoticons: ACTIVE});
    expect(draft.enabled).toBe(true);
    expect(draft.reactions).toEqual([custom('1'), emoji('🔥')]);
    expect(draft.paid).toBe(true);
    expect(draft.limit).toBe(5);
  });

  test('None opens off, unless Stars are on', () => {
    expect(initChannelDraft({available: none, paid: false, limit: 11, activeEmoticons: ACTIVE}).enabled).toBe(false);
    expect(initChannelDraft({available: undefined, paid: false, limit: 11, activeEmoticons: ACTIVE}).enabled).toBe(false);

    const starsOnly = initChannelDraft({available: none, paid: true, limit: 11, activeEmoticons: ACTIVE});
    expect(starsOnly.enabled).toBe(true);
    expect(starsOnly.reactions).toEqual([]);
  });
});

describe('channel reactions: editing', () => {
  test('off keeps the list; on with an empty list takes the standard ones', () => {
    const off = setChannelEnabled(base(), false, ACTIVE);
    expect(off.reactions).toEqual([emoji('👍'), custom('7')]);
    expect(setChannelEnabled(off, true, ACTIVE).reactions).toEqual([emoji('👍'), custom('7')]);

    const empty = setChannelEnabled(initChannelDraft({available: none, paid: false, limit: 11, activeEmoticons: ACTIVE}), true, ACTIVE);
    expect(empty.enabled).toBe(true);
    expect(empty.reactions).toEqual(ACTIVE.map(emoji));
  });

  test('inserts at the place asked, never twice, never past the ceiling', () => {
    const inserted = insertChannelReaction(base(), custom('9'), 1, 100);
    expect(inserted.refused).toBeUndefined();
    expect(inserted.draft.reactions).toEqual([emoji('👍'), custom('9'), custom('7')]);

    expect(insertChannelReaction(base(), emoji('👍'), 0, 100).refused).toBe('duplicate');
    const full = insertChannelReaction(base(), emoji('🔥'), 2, 2);
    expect(full.refused).toBe('limit');
    expect(full.draft.reactions).toEqual([emoji('👍'), custom('7')]);

    // * past the end lands at the end
    expect(insertChannelReaction(base(), emoji('🔥'), 99, 100).draft.reactions).toEqual([emoji('👍'), custom('7'), emoji('🔥')]);
  });

  test('Stars go through the paid switch, not the list', () => {
    const withStars = insertChannelReaction(base(), paid, 0, 2).draft;
    expect(withStars.paid).toBe(true);
    expect(withStars.reactions).toEqual([emoji('👍'), custom('7')]);
    expect(removeChannelReaction(withStars, paid).paid).toBe(false);
  });

  test('removes by place and by reaction', () => {
    expect(removeChannelReactionAt(base(), 0).reactions).toEqual([custom('7')]);
    expect(removeChannelReactionAt(base(), 5).reactions).toEqual([emoji('👍'), custom('7')]);
    expect(removeChannelReaction(base(), custom('7')).reactions).toEqual([emoji('👍')]);
  });

  test('every custom emoji needs a level, while reactions are on', () => {
    const draft = insertChannelReaction(base(), custom('8'), 0, 100).draft;
    expect(getRequiredBoostLevel(draft)).toBe(2);
    expect(getRequiredBoostLevel(setChannelEnabled(draft, false, ACTIVE))).toBe(0);
  });
});

describe('channel reactions: what is sent', () => {
  const opts = {activeEmoticons: ACTIVE, paidShown: true};

  test('off sends None, Stars off and no maximum', () => {
    const draft = setChannelEnabled(initChannelDraft({available: some(emoji('👍')), paid: true, limit: 4, activeEmoticons: ACTIVE}), false, ACTIVE);
    expect(buildChannelPayload(draft, opts)).toEqual({reactions: none, options: {paidEnabled: false}});
    expect(buildChannelPayload(draft, {...opts, paidShown: false})).toEqual({reactions: none, options: {}});
  });

  test('an empty free list is None, Stars only', () => {
    const draft = initChannelDraft({available: none, paid: true, limit: 11, activeEmoticons: ACTIVE});
    expect(buildChannelPayload(draft, opts)).toEqual({reactions: none, options: {reactionsLimit: 11, paidEnabled: true}});
  });

  test('exactly the active standard catalog, in any order, is All without custom', () => {
    const draft = initChannelDraft({available: some(emoji('🔥'), emoji('👍'), emoji('❤'), emoji('👎')), paid: false, limit: 11, activeEmoticons: ACTIVE});
    expect(buildChannelPayload(draft, opts)).toEqual({
      reactions: {_: 'chatReactionsAll', pFlags: {}},
      options: {reactionsLimit: 11, paidEnabled: false}
    });
  });

  test('anything else is Some in the draft order, with the maximum always sent', () => {
    const draft = setChannelLimit(initChannelDraft({available: some(custom('5'), emoji('🔥')), paid: false, limit: 11, activeEmoticons: ACTIVE}), 3);
    expect(buildChannelPayload(draft, {activeEmoticons: ACTIVE, paidShown: false})).toEqual({
      reactions: some(custom('5'), emoji('🔥')),
      options: {reactionsLimit: 3}
    });

    const catalogAndCustom = initChannelDraft({available: some(...ACTIVE.map(emoji), custom('5')), paid: false, limit: 11, activeEmoticons: ACTIVE});
    expect(buildChannelPayload(catalogAndCustom, opts).reactions).toEqual(some(...ACTIVE.map(emoji), custom('5')));
  });

  test('order, the slider and Stars make a change; seeding and taking back do not', () => {
    const initial = initChannelDraft({available: some(emoji('👍'), emoji('🔥')), paid: false, limit: 11, activeEmoticons: ACTIVE});
    const same = (draft: typeof initial) => savePayloadsEqual(buildChannelPayload(initial, opts), buildChannelPayload(draft, opts));

    expect(same(initial)).toBe(true);
    const reordered = insertChannelReaction(removeChannelReactionAt(initial, 0), emoji('👍'), 1, 100).draft;
    expect(same(reordered)).toBe(false);
    expect(same(setChannelLimit(initial, 10))).toBe(false);
    expect(same(setChannelPaid(initial, true))).toBe(false);
    expect(same(setChannelPaid(setChannelPaid(initial, true), false))).toBe(true);

    const closed = initChannelDraft({available: none, paid: false, limit: 11, activeEmoticons: ACTIVE});
    const toggled = setChannelEnabled(setChannelEnabled(closed, true, ACTIVE), false, ACTIVE);
    expect(savePayloadsEqual(buildChannelPayload(closed, opts), buildChannelPayload(toggled, opts))).toBe(true);
  });
});

describe('the emoji picker', () => {
  const catalog = [{emoticon: '👍', docId: '100'}, {emoticon: '🔥', docId: '200'}];

  test('a standard reaction\'s animation is the standard reaction, a custom emoji is custom', () => {
    expect(pickedEmojiToReaction({docId: '200', emoji: '🔥'}, catalog)).toEqual(emoji('🔥'));
    expect(pickedEmojiToReaction({emoji: '👍'}, catalog)).toEqual(emoji('👍'));
    expect(pickedEmojiToReaction({emoji: '❤️'}, [{emoticon: '❤'}])).toEqual(emoji('❤'));
    expect(pickedEmojiToReaction({docId: '555', emoji: '🔥'}, catalog)).toEqual(custom('555'));
    expect(pickedEmojiToReaction({docId: PAID_REACTION_EMOJI_DOCID}, catalog)).toEqual(paid);
    expect(pickedEmojiToReaction({emoji: '🍌'}, catalog)).toBeUndefined();
  });

  test('a reaction is drawn as its document', () => {
    expect(reactionToDocId(emoji('👍'), catalog)).toBe('100');
    expect(reactionToDocId(custom('555'), catalog)).toBe('555');
    expect(reactionToDocId(paid, catalog)).toBe(PAID_REACTION_EMOJI_DOCID);
    expect(reactionToDocId(emoji('🍌'), catalog)).toBeUndefined();
  });
});

describe('typing in the field', () => {
  const options = {catalog: [{emoticon: '👍', docId: '1'}, {emoticon: '❤', docId: '2'}, {emoticon: '🎾', docId: '3'}], activeEmoticons: ['👍', '❤'], paidShown: false};

  test('only text that would become a reaction is typed', () => {
    expect(isReactionTyping('👍', options)).toBe(true);
    expect(isReactionTyping('❤️', options)).toBe(true);
    expect(isReactionTyping('🎾', options)).toBe(false);
    expect(isReactionTyping('🍌', options)).toBe(false);
    expect(isReactionTyping('👍🎾', options)).toBe(false);
    expect(isReactionTyping('a', options)).toBe(false);
    expect(isReactionTyping(' ', options)).toBe(false);
    expect(isReactionTyping('', options)).toBe(false);
    expect(isReactionTyping(null, options)).toBe(false);
  });
});

describe('the field as text', () => {
  const catalog = [{emoticon: '👍', docId: '100'}, {emoticon: '🔥', docId: '200'}, {emoticon: '❤', docId: '300'}, {emoticon: '🍌', docId: '400'}];
  const options = {catalog, activeEmoticons: ['👍', '🔥', '❤'], paidShown: true, max: 100};
  const text = (value: string) => [...value].map((char) => ({emoji: char}));
  // * the tokens the field draws for a list
  const tokensOf = (draft: ReturnType<typeof base>) => getChannelFieldReactions(draft).map((reaction) => {
    if(reaction._ === 'reactionPaid') return {docId: PAID_REACTION_EMOJI_DOCID};
    if(reaction._ === 'reactionCustomEmoji') return {docId: reaction.document_id, emoji: '🙂'};
    return {emoji: (reaction as {emoticon: string}).emoticon};
  });

  test('the plain character Stars are copied as is Stars again, only while their switch is shown', () => {
    expect(fieldTokenToReaction({emoji: PAID_PLAIN_EMOJI}, options)).toEqual({_: 'reactionPaid'});
    expect(fieldTokenToReaction({emoji: PAID_PLAIN_EMOJI}, {...options, paidShown: false})).toBeUndefined();
    const withStandard = {...options, catalog: [...catalog, {emoticon: PAID_PLAIN_EMOJI, docId: '500'}], activeEmoticons: [...options.activeEmoticons, PAID_PLAIN_EMOJI]};
    expect(fieldTokenToReaction({emoji: PAID_PLAIN_EMOJI}, withStandard)).toEqual(emoji(PAID_PLAIN_EMOJI));
  });

  test('a new token is an active standard reaction, a custom emoji or Stars while shown, else nothing', () => {
    expect(fieldTokenToReaction({emoji: '❤️'}, options)).toEqual(emoji('❤'));
    expect(fieldTokenToReaction({emoji: '🍌'}, options)).toBeUndefined();
    expect(fieldTokenToReaction({emoji: 'a'}, options)).toBeUndefined();
    expect(fieldTokenToReaction({}, options)).toBeUndefined();
    expect(fieldTokenToReaction({docId: '200', emoji: '🔥'}, options)).toEqual(emoji('🔥'));
    expect(fieldTokenToReaction({docId: '400', emoji: '🍌'}, options)).toBeUndefined();
    expect(fieldTokenToReaction({docId: '9', emoji: '🙂'}, options)).toEqual(custom('9'));
    expect(fieldTokenToReaction({docId: PAID_REACTION_EMOJI_DOCID}, options)).toEqual(paid);
    expect(fieldTokenToReaction({docId: PAID_REACTION_EMOJI_DOCID}, {...options, paidShown: false})).toBeUndefined();
  });

  test('a paste keeps only new reactions, once, where it went in', () => {
    const draft = base();
    // * 👍abc🔥❤️ pasted between 👍 and the custom one: 👍 is there already, the letters are nothing
    const tokens = [...tokensOf(draft).slice(0, 1), ...text('👍abc🔥'), {emoji: '❤️'}, ...tokensOf(draft).slice(1)];
    const result = editChannelField(draft, tokens, 7, options);
    expect(result.draft.reactions).toEqual([emoji('👍'), emoji('🔥'), emoji('❤'), custom('7')]);
    expect(result.caret).toBe(3);
    expect(result.refused).toBeUndefined();
  });

  test('a copy of what is there pasted anywhere changes nothing', () => {
    const draft = base();
    const own = tokensOf(draft);
    expect(editChannelField(draft, [...own, ...own], 4, options).draft).toBe(draft);
    expect(editChannelField(draft, [...own, ...own], 4, options).caret).toBe(2);
    expect(editChannelField(draft, [own[0], ...own, own[1]], 2, options).draft).toBe(draft);
  });

  test('deleting, typing letters and moving keep what stands', () => {
    const draft = {...base(), reactions: [emoji('👍'), custom('7'), emoji('🔥')]};
    const own = tokensOf(draft);
    // * Backspace on a selection of two
    expect(editChannelField(draft, [own[0]], 1, options).draft.reactions).toEqual([emoji('👍')]);
    // * a letter typed goes
    const typed = editChannelField(draft, [own[0], {emoji: 'x'}, own[1], own[2]], 2, options);
    expect(typed.draft).toBe(draft);
    expect(typed.caret).toBe(1);
    // * a reaction dragged to the end
    expect(editChannelField(draft, [own[1], own[2], own[0]], 3, options).draft.reactions).toEqual([custom('7'), emoji('🔥'), emoji('👍')]);
  });

  test('an inactive emoji that stood there stays; a new one does not come in', () => {
    const draft = {...base(), reactions: [emoji('🍌')]};
    expect(editChannelField(draft, [...tokensOf(draft), {emoji: '🔥'}], 2, options).draft.reactions).toEqual([emoji('🍌'), emoji('🔥')]);
    expect(editChannelField(base(), [...tokensOf(base()), {emoji: '🍌'}], 3, options).draft).toEqual(base());
  });

  test('Stars are the paid switch and stand first', () => {
    const draft = base();
    const own = tokensOf(draft);
    const result = editChannelField(draft, [own[0], {docId: PAID_REACTION_EMOJI_DOCID}, own[1]], 2, options);
    expect(result.draft.paid).toBe(true);
    expect(result.draft.reactions).toEqual(draft.reactions);
    // * the caret stays after 👍, which is now second
    expect(result.caret).toBe(2);

    expect(editChannelField(draft, [...own, {docId: PAID_REACTION_EMOJI_DOCID}], 3, {...options, paidShown: false}).draft).toBe(draft);

    // * Stars deleted turn them off
    const withStars = setChannelPaid(draft, true);
    const off = editChannelField(withStars, tokensOf(withStars).slice(1), 0, options);
    expect(off.draft.paid).toBe(false);
    expect(off.draft.reactions).toEqual(draft.reactions);
  });

  test('no more than the ceiling comes in', () => {
    const draft = base();
    const result = editChannelField(draft, [...tokensOf(draft), ...text('🔥❤')], 4, {...options, max: 3});
    expect(result.refused).toBe('limit');
    expect(result.draft.reactions).toEqual([emoji('👍'), custom('7'), emoji('🔥')]);
    expect(result.caret).toBe(3);
  });
});
