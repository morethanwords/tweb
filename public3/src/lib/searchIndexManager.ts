import Config from './config';

class SearchIndexManager {
  public static badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<]+/g;
  public static trimRe = /^\s+|\s$/g;

  public createIndex() {
    return {
      shortIndexes: {},
      fullTexts: {}
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

  public indexObject(id: number, searchText: string, searchIndex: any) {
    if(searchIndex.fullTexts[id] !== undefined) {
      return false;
    }

    searchText = this.cleanSearchText(searchText);

    if(!searchText.length) {
      return false;
    }

    const shortIndexes = searchIndex.shortIndexes;

    searchIndex.fullTexts[id] = searchText;

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
    });
  }

  public search(query: string, searchIndex: any) {
    const shortIndexes = searchIndex.shortIndexes;
    const fullTexts = searchIndex.fullTexts;

    query = this.cleanSearchText(query);

    const queryWords = query.split(' ');
    let foundObjs: any = false,
      newFoundObjs: any, i: number;
    let j: number, searchText: string;
    let found: boolean;

    for(i = 0; i < queryWords.length; i++) {
      newFoundObjs = shortIndexes[queryWords[i].substr(0, 3)];
      if(!newFoundObjs) {
        foundObjs = [];
        break;
      }
      
      if(foundObjs === false || foundObjs.length > newFoundObjs.length) {
        foundObjs = newFoundObjs;
      }
    }

    newFoundObjs = {};

    for(j = 0; j < foundObjs.length; j++) {
      found = true;
      searchText = fullTexts[foundObjs[j]];
      for(i = 0; i < queryWords.length; i++) {
        if(searchText.indexOf(queryWords[i]) == -1) {
          found = false;
          break;
        }
      }

      if(found) {
        newFoundObjs[foundObjs[j]] = true;
      }
    }

    return newFoundObjs;
  }
}

export default new SearchIndexManager();