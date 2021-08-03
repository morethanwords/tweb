/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Database } from '.';

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
  }, {
    name: 'messages'
  }]
};

export default DATABASE_STATE;
