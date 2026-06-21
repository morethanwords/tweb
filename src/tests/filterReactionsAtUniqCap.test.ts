import {Reaction, ReactionCount} from '@layer';
import filterReactionsAtUniqCap, {
  DEFAULT_REACTIONS_UNIQ_MAX,
  countDistinctReactions,
  isMessageAtUniqReactionCap
} from '@appManagers/utils/reactions/filterReactionsAtUniqCap';

function emoji(emoticon: string): Reaction.reactionEmoji {
  return {_: 'reactionEmoji', emoticon};
}

function custom(document_id: string): Reaction.reactionCustomEmoji {
  return {_: 'reactionCustomEmoji', document_id};
}

const paid: Reaction.reactionPaid = {_: 'reactionPaid'};

function count(reaction: Reaction, n = 1): ReactionCount {
  return {_: 'reactionCount', count: n, reaction};
}

// Build a message-results array with `n` distinct emoji reactions: 0,1,2,...
function distinctResults(n: number): ReactionCount[] {
  return Array.from({length: n}, (_, i) => count(emoji(String(i))));
}

describe('filterReactionsAtUniqCap', () => {
  test('default uniq max mirrors tdesktop fallback', () => {
    expect(DEFAULT_REACTIONS_UNIQ_MAX).toBe(11);
  });

  test('below the cap returns the offered list unchanged (same reference)', () => {
    const offered = [emoji('a'), emoji('b')];
    const results = distinctResults(DEFAULT_REACTIONS_UNIQ_MAX - 1);
    const out = filterReactionsAtUniqCap(offered, results);
    expect(out).toBe(offered);
  });

  test('at the cap, narrows the picker to reactions already present on the message', () => {
    // message already has distinct '0'..'10' (11 distinct), at the cap
    const results = distinctResults(DEFAULT_REACTIONS_UNIQ_MAX);
    const present = emoji('3'); // already on the message
    const novel = emoji('new'); // would be a 12th distinct kind
    const offered = [novel, present];
    const out = filterReactionsAtUniqCap(offered, results);
    expect(out).toEqual([present]);
  });

  test('reactionPaid is always kept even at the cap', () => {
    const results = distinctResults(DEFAULT_REACTIONS_UNIQ_MAX);
    const offered = [paid, emoji('novel')];
    const out = filterReactionsAtUniqCap(offered, results);
    expect(out).toEqual([paid]);
  });

  test('custom-emoji reactions already present are kept at the cap', () => {
    const presentCustom = custom('111');
    const results = [...distinctResults(DEFAULT_REACTIONS_UNIQ_MAX - 1), count(presentCustom)];
    const offered = [presentCustom, custom('999')];
    const out = filterReactionsAtUniqCap(offered, results);
    expect(out).toEqual([presentCustom]);
  });

  test('respects a custom uniqMax value', () => {
    const results = distinctResults(3);
    const present = emoji('1');
    const offered = [emoji('novel'), present];
    // cap = 3 → at the cap, narrow
    expect(filterReactionsAtUniqCap(offered, results, 3)).toEqual([present]);
    // cap = 4 → below the cap, unchanged
    expect(filterReactionsAtUniqCap(offered, results, 4)).toBe(offered);
  });

  test('no message results → unchanged', () => {
    const offered = [emoji('a')];
    expect(filterReactionsAtUniqCap(offered, undefined)).toBe(offered);
  });

  test('empty offered list → unchanged', () => {
    const offered: Reaction[] = [];
    expect(filterReactionsAtUniqCap(offered, distinctResults(20))).toBe(offered);
  });

  test('over the cap (results > uniqMax) still narrows', () => {
    const results = distinctResults(DEFAULT_REACTIONS_UNIQ_MAX + 5);
    const present = emoji('2');
    const offered = [emoji('novel'), present];
    expect(filterReactionsAtUniqCap(offered, results)).toEqual([present]);
  });

  // reactionPaid (the ⭐ counter) is not a distinct reaction kind, so it must not push
  // the message over the cap — matches Android MessageObject.selectReaction's chosenCount,
  // which skips TL_reactionPaid.
  test('reactionPaid in the results does not count toward the cap', () => {
    // 10 distinct emoji + a paid counter = 11 results, but only 10 distinct kinds
    const results = [...distinctResults(DEFAULT_REACTIONS_UNIQ_MAX - 1), count(paid)];
    const offered = [emoji('novel'), emoji('1')];
    // below the cap (10 < 11) → a new distinct kind is still allowed
    expect(filterReactionsAtUniqCap(offered, results)).toBe(offered);
  });
});

describe('countDistinctReactions', () => {
  test('counts non-paid reactions only', () => {
    expect(countDistinctReactions(undefined)).toBe(0);
    expect(countDistinctReactions([])).toBe(0);
    expect(countDistinctReactions(distinctResults(5))).toBe(5);
    expect(countDistinctReactions([...distinctResults(5), count(paid)])).toBe(5);
    expect(countDistinctReactions([count(custom('1')), count(paid), count(emoji('a'))])).toBe(2);
  });
});

describe('isMessageAtUniqReactionCap', () => {
  test('false below the cap, true at/over it', () => {
    expect(isMessageAtUniqReactionCap(undefined)).toBe(false);
    expect(isMessageAtUniqReactionCap(distinctResults(DEFAULT_REACTIONS_UNIQ_MAX - 1))).toBe(false);
    expect(isMessageAtUniqReactionCap(distinctResults(DEFAULT_REACTIONS_UNIQ_MAX))).toBe(true);
    expect(isMessageAtUniqReactionCap(distinctResults(DEFAULT_REACTIONS_UNIQ_MAX + 3))).toBe(true);
  });

  test('a paid counter does not by itself reach the cap', () => {
    const results = [...distinctResults(DEFAULT_REACTIONS_UNIQ_MAX - 1), count(paid)];
    expect(isMessageAtUniqReactionCap(results)).toBe(false);
  });

  test('respects a custom uniqMax', () => {
    expect(isMessageAtUniqReactionCap(distinctResults(3), 3)).toBe(true);
    expect(isMessageAtUniqReactionCap(distinctResults(3), 4)).toBe(false);
  });
});
