import Config from './config';

export type SearchIndex = {
  fullTexts: {
    [peerId: string]: string
  }/* ,
  shortIndexes: {
    [shortStr: string]: number[]
  } */
};

class SearchIndexManager {
  public static badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<]+/g;
  public static trimRe = /^\s+|\s$/g;

  public createIndex(): SearchIndex {
    return {
      fullTexts: {}/* ,
      shortIndexes: {} */
    };
  }

  public cleanSearchText(text: string, latinize = true) {
    const hasTag = text.charAt(0) == '%';
    text = text.replace(SearchIndexManager['badCharsRe'], '').replace(SearchIndexManager['trimRe'], '');
    if(latinize) {
      text = text.replace(/[^A-Za-z0-9]/g, (ch) => {
        const latinizeCh = Config.LatinizeMap[ch];
        return latinizeCh !== undefined ? latinizeCh : ch;
      });
    }
    
    text = text.toLowerCase();
    if(hasTag) {
      text = '%' + text;
    }

    return text;
  }

  public cleanUsername(username: string) {
    return username && username.toLowerCase() || '';
  }

  public indexObject(id: number, searchText: string, searchIndex: SearchIndex) {
    if(searchIndex.fullTexts.hasOwnProperty(id)) {
      return false;
    }

    searchText = this.cleanSearchText(searchText);
    if(!searchText.length) {
      return false;
    }

    searchIndex.fullTexts[id] = searchText;
    
    /* const shortIndexes = searchIndex.shortIndexes;
    searchText.split(' ').forEach((searchWord) => {
      let len = Math.min(searchWord.length, 3),
        wordPart, i;
      for(i = 1; i <= len; i++) {
        wordPart = searchWord.substr(0, i);
        if(shortIndexes[wordPart] === undefined) {
          shortIndexes[wordPart] = [id];
        } else {
          shortIndexes[wordPart].push(id);
        }
      }
    }); */
  }

  public search(query: string, searchIndex: SearchIndex) {
    const fullTexts = searchIndex.fullTexts;
    //const shortIndexes = searchIndex.shortIndexes;

    query = this.cleanSearchText(query);

    const newFoundObjs: {[peerId: string]: true} = {};
    const queryWords = query.split(' ');
    for(const peerId in fullTexts) {
      const fullText = fullTexts[peerId];

      let found = true;
      for(const word of queryWords) {
        if(fullText.indexOf(word) === -1) {
          found = false;
          break;
        }
      }

      if(found) {
        newFoundObjs[peerId] = true;
      }
    }
    

    /* const queryWords = query.split(' ');
    let foundArr: number[];
    for(let i = 0; i < queryWords.length; i++) {
      const newFound = shortIndexes[queryWords[i].substr(0, 3)];
      if(!newFound) {
        foundArr = [];
        break;
      }
      
      if(foundArr === undefined || foundArr.length > newFound.length) {
        foundArr = newFound;
      }
    }

    for(let j = 0; j < foundArr.length; j++) {
      let found = true;
      let searchText = fullTexts[foundArr[j]];
      for(let i = 0; i < queryWords.length; i++) {
        if(searchText.indexOf(queryWords[i]) == -1) {
          found = false;
          break;
        }
      }

      if(found) {
        newFoundObjs[foundArr[j]] = true;
      }
    } */

    return newFoundObjs;
  }
}

export default new SearchIndexManager();