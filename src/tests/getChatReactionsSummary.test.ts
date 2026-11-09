import getChatReactionsSummary from '@appManagers/utils/reactions/getChatReactionsSummary';
import {ChatReactions} from '@layer';
import {custom as c, emoji as e, some} from '@/tests/helpers/reactions';

const active = ['👍', '🔥', '❤'];

describe('getChatReactionsSummary', () => {
  test('All is All whatever allow_custom is', () => {
    for(const allow_custom of [true, undefined]) {
      const reactions: ChatReactions = {_: 'chatReactionsAll', pFlags: allow_custom ? {allow_custom} : {}};
      expect(getChatReactionsSummary({reactions, isBroadcast: false, activeEmoticons: active})).toEqual({type: 'all'});
      expect(getChatReactionsSummary({reactions, isBroadcast: true, paidEnabled: true, activeEmoticons: active})).toEqual({type: 'all'});
    }
  });

  test('None is off, or 1 in a channel with Stars', () => {
    const reactions: ChatReactions = {_: 'chatReactionsNone'};
    expect(getChatReactionsSummary({reactions, isBroadcast: false, activeEmoticons: active})).toEqual({type: 'off'});
    expect(getChatReactionsSummary({reactions: undefined, isBroadcast: true, activeEmoticons: active})).toEqual({type: 'off'});
    expect(getChatReactionsSummary({reactions, isBroadcast: true, paidEnabled: true, activeEmoticons: active})).toEqual({type: 'count', count: 1});
    expect(getChatReactionsSummary({reactions, isBroadcast: false, paidEnabled: true, activeEmoticons: active})).toEqual({type: 'off'});
  });

  test('Some in a channel counts active standard + custom + Stars', () => {
    const reactions = some(e('👍'), e('🗑'), c('1'), c('2'));
    expect(getChatReactionsSummary({reactions, isBroadcast: true, activeEmoticons: active})).toEqual({type: 'count', count: 3});
    expect(getChatReactionsSummary({reactions, isBroadcast: true, paidEnabled: true, activeEmoticons: active})).toEqual({type: 'count', count: 4});
  });

  test('Some in a group is selected active / active catalog, never All by length', () => {
    expect(getChatReactionsSummary({reactions: some(e('👍'), e('🔥')), isBroadcast: false, activeEmoticons: active}))
    .toEqual({type: 'fraction', selected: 2, total: 3});
    // three entries, but one is not in the catalog: not all
    expect(getChatReactionsSummary({reactions: some(e('👍'), e('🔥'), e('🗑')), isBroadcast: false, activeEmoticons: active}))
    .toEqual({type: 'fraction', selected: 2, total: 3});
    expect(getChatReactionsSummary({reactions: some(e('👍'), e('🔥'), e('❤')), isBroadcast: false, activeEmoticons: active}))
    .toEqual({type: 'fraction', selected: 3, total: 3});
  });
});
