/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from "../../config/app";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import isObject from "../../helpers/object/isObject";
import validateInitObject from "../../helpers/object/validateInitObject";
import I18n from "../langPack";
import fixEmoji from "../richTextProcessor/fixEmoji";
import SearchIndex from "../searchIndex";
import stateStorage from "../stateStorage";
import { AppManager } from "./manager";

type EmojiLangPack = {
  keywords: {
    [keyword: string]: string[],
  },
  version: number,
  langCode: string
};

const EMOJI_LANG_PACK: EmojiLangPack = {
  keywords: {},
  version: 0,
  langCode: App.langPackCode
};

const RECENT_MAX_LENGTH = 36;

export class AppEmojiManager extends AppManager {
  private static POPULAR_EMOJI = ["😂", "😘", "❤️", "😍", "😊", "😁", "👍", "☺️", "😔", "😄", "😭", "💋", "😒", "😳", "😜", "🙈", "😉", "😃", "😢", "😝", "😱", "😡", "😏", "😞", "😅", "😚", "🙊", "😌", "😀", "😋", "😆", "👌", "😐", "😕"];
  private keywordLangPacks: {
    [langCode: string]: EmojiLangPack
  } = {};

  private index: SearchIndex<EmojiLangPack['keywords'][keyof EmojiLangPack['keywords']]>;
  private indexedLangPacks: {[langCode: string]: boolean} = {};

  private getKeywordsPromises: {[langCode: string]: Promise<EmojiLangPack>} = {};

  private recent: string[];
  private getRecentEmojisPromise: Promise<AppEmojiManager['recent']>;

  /* public getPopularEmoji() {
    return stateStorage.get('emojis_popular').then((popEmojis) => {
      var result = []
      if (popEmojis && popEmojis.length) {
        for (var i = 0, len = popEmojis.length; i < len; i++) {
          result.push({code: popEmojis[i][0], rate: popEmojis[i][1]})
        }
        callback(result)
        return
      }

      return stateStorage.get('emojis_recent').then((recentEmojis) => {
        recentEmojis = recentEmojis || popular || []
        var shortcut
        var code
        for (var i = 0, len = recentEmojis.length; i < len; i++) {
          shortcut = recentEmojis[i]
          if (Array.isArray(shortcut)) {
            shortcut = shortcut[0]
          }
          if (shortcut && typeof shortcut === 'string') {
            if (shortcut.charAt(0) == ':') {
              shortcut = shortcut.substr(1, shortcut.length - 2)
            }
            if (code = shortcuts[shortcut]) {
              result.push({code: code, rate: 1})
            }
          }
        }
        callback(result)
      });
    });
  }

  function pushPopularEmoji (code) {
    getPopularEmoji(function (popularEmoji) {
      var exists = false
      var count = popularEmoji.length
      var result = []
      for (var i = 0; i < count; i++) {
        if (popularEmoji[i].code == code) {
          exists = true
          popularEmoji[i].rate++
        }
        result.push([popularEmoji[i].code, popularEmoji[i].rate])
      }
      if (exists) {
        result.sort(function (a, b) {
          return b[1] - a[1]
        })
      } else {
        if (result.length > 41) {
          result = result.slice(0, 41)
        }
        result.push([code, 1])
      }
      ConfigStorage.set({emojis_popular: result})
    })
  } */

  public getEmojiKeywords(langCode: string = App.langPackCode) {
    const promise = this.getKeywordsPromises[langCode];
    if(promise) {
      return promise;
    }

    const storageKey: any = 'emojiKeywords_' + langCode;
    return this.getKeywordsPromises[langCode] = stateStorage.get(storageKey).then((pack: EmojiLangPack) => {
      if(!isObject(pack)) {
        pack = {} as any;
      }

      validateInitObject(EMOJI_LANG_PACK, pack);

      // important
      pack.langCode = langCode;
      this.keywordLangPacks[langCode] = pack;

      return this.apiManager.invokeApi('messages.getEmojiKeywordsDifference', {
        lang_code: pack.langCode,
        from_version: pack.version
      }).then((keywordsDifference) => {
        pack.version = keywordsDifference.version;
        
        const packKeywords = pack.keywords;
        const keywords = keywordsDifference.keywords;
        for(let i = 0, length = keywords.length; i < length; ++i) {
          const {keyword, emoticons} = keywords[i];
          packKeywords[keyword] = emoticons;
        }

        stateStorage.set({
          [storageKey]: pack
        });

        return pack;
      }, () => {
        return pack;
      });
    });
  }

  public getBothEmojiKeywords() {
    const promises: Promise<any>[] = [
      this.getEmojiKeywords()
    ];

    if(I18n.lastRequestedLangCode !== App.langPackCode) {
      promises.push(this.getEmojiKeywords(I18n.lastRequestedLangCode));
    }

    if(!this.recent) {
      promises.push(this.getRecentEmojis());
    }

    return Promise.all(promises);
  }

  private indexEmojis() {
    if(!this.index) {
      this.index = new SearchIndex(undefined, 2);
    }

    for(const langCode in this.keywordLangPacks) {
      if(this.indexedLangPacks[langCode]) {
        continue;
      }

      const pack = this.keywordLangPacks[langCode];
      const keywords = pack.keywords;

      for(const keyword in keywords) {
        const emoticons = keywords[keyword];
        this.index.indexObject(emoticons, keyword);
      }

      this.indexedLangPacks[langCode] = true;
    }
  }

  public searchEmojis(q: string) {
    this.indexEmojis();

    q = q.toLowerCase().replace(/_/g, ' ');
    
    //const perf = performance.now();
    let emojis: Array<string>;
    if(q.trim()) {
      const set = this.index.search(q);
      emojis = Array.from(set).reduce((acc, v) => acc.concat(v), []);
    } else {
      emojis = this.recent.concat(AppEmojiManager.POPULAR_EMOJI).slice(0, RECENT_MAX_LENGTH);
    }

    emojis = Array.from(new Set(emojis));
    //console.log('searchEmojis', q, 'time', performance.now() - perf);

    /* for(let i = 0, length = emojis.length; i < length; ++i) {
      if(emojis[i].includes(zeroWidthJoiner) && !emojis[i].includes('\ufe0f')) {
        emojis[i] += '\ufe0f';
      }
    } */

    return emojis;
  }

  public getRecentEmojis() {
    if(this.getRecentEmojisPromise) return this.getRecentEmojisPromise;
    return this.getRecentEmojisPromise = this.appStateManager.getState().then((state) => {
      return this.recent = Array.isArray(state.recentEmoji) ? state.recentEmoji : [];
    });
  }

  public pushRecentEmoji(emoji: string) {
    emoji = fixEmoji(emoji);
    this.getRecentEmojis().then((recent) => {
      indexOfAndSplice(recent, emoji);
      recent.unshift(emoji);
      if(recent.length > RECENT_MAX_LENGTH) {
        recent.length = RECENT_MAX_LENGTH;
      }

      this.appStateManager.pushToState('recentEmoji', recent);
      this.rootScope.dispatchEvent('emoji_recent', emoji);
    });
  }
}
