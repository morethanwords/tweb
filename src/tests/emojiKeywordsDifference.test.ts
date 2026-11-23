import {describe, expect, it, vi} from 'vitest';
import {AppEmojiManager} from '@appManagers/appEmojiManager';

function createEmojiManager(stored: any, difference: any) {
  const set = vi.fn();
  const invokeApi = vi.fn().mockResolvedValue(difference);
  const manager = new AppEmojiManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appStateManager: {storage: {get: vi.fn().mockResolvedValue(stored), set}}
  });

  return {manager, invokeApi, set};
}

const difference = (keywords: any[], from_version = 5, version = 6) => ({
  _: 'emojiKeywordsDifference',
  lang_code: 'en',
  from_version,
  version,
  keywords
});

// * the keywords of a language are kept and brought up to date by differences (messages.getEmojiKeywordsDifference):
// * an `emojiKeyword` adds its emoji to the keyword, an `emojiKeywordDeleted` takes its emoji out of it (tdesktop's
// * ApplyDifference)
describe('the emoji keywords: a difference', () => {
  it('adds emoji to a keyword and takes others out, keeping the rest of each', async() => {
    const {manager, invokeApi, set} = createEmojiManager({
      langCode: 'en',
      version: 5,
      format: 2,
      keywords: {cat: ['😺', '🐈'], dog: ['🐶']}
    }, difference([
      {_: 'emojiKeywordDeleted', keyword: 'cat', emoticons: ['🐈']},
      {_: 'emojiKeyword', keyword: 'dog', emoticons: ['🐕']}
    ]));

    const pack = await manager.getEmojiKeywords('en');

    expect(invokeApi).toHaveBeenCalledWith('messages.getEmojiKeywordsDifference', {lang_code: 'en', from_version: 5});
    expect(pack.version).toBe(6);
    expect(pack.keywords).toEqual({cat: ['😺'], dog: ['🐶', '🐕']});
    // * kept as it is now, for the next difference to start from
    expect(set).toHaveBeenCalledWith({emojiKeywords_en: pack});
  });

  it('drops a keyword left with no emoji, and adds an emoji it has already only once', async() => {
    const {manager} = createEmojiManager({
      langCode: 'en',
      version: 5,
      format: 2,
      keywords: {cat: ['🐈'], dog: ['🐶']}
    }, difference([
      {_: 'emojiKeywordDeleted', keyword: 'cat', emoticons: ['🐈']},
      {_: 'emojiKeywordDeleted', keyword: 'bird', emoticons: ['🐦']},
      {_: 'emojiKeyword', keyword: 'dog', emoticons: ['🐶', '🐕']}
    ]));

    const pack = await manager.getEmojiKeywords('en');

    expect(pack.keywords).toEqual({dog: ['🐶', '🐕']});
  });

  it('the first one, from version 0, gives every keyword its emoji', async() => {
    const {manager} = createEmojiManager(undefined, difference([
      {_: 'emojiKeyword', keyword: 'cat', emoticons: ['😺', '🐈']},
      {_: 'emojiKeyword', keyword: 'dog', emoticons: ['🐶']}
    ], 0, 3));

    const pack = await manager.getEmojiKeywords('en');

    expect(pack.version).toBe(3);
    expect(pack.keywords).toEqual({cat: ['😺', '🐈'], dog: ['🐶']});
  });

  it('a keyword that is a name an object has already is a keyword like any other', async() => {
    const {manager} = createEmojiManager({
      langCode: 'en',
      version: 5,
      format: 2,
      keywords: {}
    }, difference([
      {_: 'emojiKeyword', keyword: 'constructor', emoticons: ['👷']},
      {_: 'emojiKeywordDeleted', keyword: 'toString', emoticons: ['🧵']}
    ]));

    const pack = await manager.getEmojiKeywords('en');

    expect(pack.version).toBe(6);
    expect(Object.keys(pack.keywords)).toEqual(['constructor']);
    expect(pack.keywords.constructor).toEqual(['👷']);
  });

  it('a pack kept before differences were applied this way is fetched whole once more', async() => {
    // * one a difference may have left with the emoji it meant to take out
    const {manager, invokeApi} = createEmojiManager({
      langCode: 'en',
      version: 5,
      keywords: {cat: ['🐈']}
    }, difference([{_: 'emojiKeyword', keyword: 'cat', emoticons: ['😺']}], 0, 6));

    const pack = await manager.getEmojiKeywords('en');

    expect(invokeApi).toHaveBeenCalledWith('messages.getEmojiKeywordsDifference', {lang_code: 'en', from_version: 0});
    expect(pack.keywords).toEqual({cat: ['😺']});
    expect(pack.format).toBe(2);
  });

  it('the pack of an older format stays in use if fetching it whole fails', async() => {
    const {manager, set} = createEmojiManager({
      langCode: 'en',
      version: 5,
      keywords: {cat: ['😺']}
    }, undefined);
    (manager as any).apiManager.invokeApi = vi.fn().mockRejectedValue({type: 'FLOOD_WAIT_100'});

    const pack = await manager.getEmojiKeywords('en');

    expect(pack.keywords).toEqual({cat: ['😺']});
    expect((manager as any).keywordLangPacks.en).toBe(pack);
    // * not saved: the next start tries to fetch it whole again
    expect(set).not.toHaveBeenCalled();
  });
});
