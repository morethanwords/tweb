/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Database} from '.';
import type {IDBIndex} from '../../lib/files/idb';

const DATABASE_STATE: Database<'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs'> = {
  name: 'tweb',
  version: 7,
  stores: [{
    name: 'session'
  }, {
    name: 'stickerSets'
  }, {
    name: 'users'
  }, {
    name: 'chats'
  }, {
    name: 'dialogs'
    // indexes: [
    //   ...(new Array(20 + 2).fill(0)).map((_, idx) => {
    //     const name = `index_${idx}`;
    //     const index: IDBIndex = {
    //       indexName: name,
    //       keyPath: name,
    //       objectParameters: {}
    //     };

    //     return index
    //   })
    // ]
  }, {
    name: 'messages'
  }]
};

export default DATABASE_STATE;
