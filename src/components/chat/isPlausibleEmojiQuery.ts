/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * The emoji-keyword index requires at least this many matched chars to return a hit
// * (SearchIndex minChars=2 in appEmojiManager.searchEmojis). A shorter bare-word query
// * can never produce a result, so searching it is a wasted SharedWorker round-trip.
const EMOJI_QUERY_MIN_CHARS = 2;

// * Should the emoji autocomplete actually run a SharedWorker emoji search for this query?
// *
// * - A `:`-prefixed query (firstChar === ':') is an explicit emoji query — always search,
// *   exactly as before (the user is deliberately typing `:foo`, suggestions appear as they
// *   type even at one char).
// * - A bare-word query (any other firstChar, e.g. typing prose) is searched as an emoji
// *   keyword too — but only once it has enough chars to possibly match the index. A 1-char
// *   bare token (every keystroke of normal prose: "h", "w", ...) can NEVER yield a result
// *   (minChars=2), so we skip the round-trip; the helper ends up hidden either way.
//
// * `query` here is the trailing token extracted by AUTO_COMPLETE_REG_EXP, with only leading
// * whitespace removed by the caller (`query.replace(/^\s*/, '')`). A leading `:`, if any, is
// * NOT stripped — it stays in both `query` and `firstChar` (= query[0]) — so we treat the raw
// * length and special-case `firstChar === ':'` above.
export default function isPlausibleEmojiQuery(query: string, firstChar: string): boolean {
  if(!query) {
    return false;
  }

  // * explicit `:emoji` query — preserve the original always-search behavior
  if(firstChar === ':') {
    return true;
  }

  // * bare-word query — only worth a search once it can match the index
  return query.length >= EMOJI_QUERY_MIN_CHARS;
}
