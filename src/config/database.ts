/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IDBStore } from "../lib/idb";
import Modes from "./modes";

export type DatabaseStoreName = 'session' | 'stickerSets' | 'users' | 'chats' | 'messages' | 'dialogs';
export type DatabaseStore = Omit<IDBStore, 'name'> & {name: DatabaseStoreName};
const Database = {
  name: 'tweb' + (Modes.test ? '_test' : ''),
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
  }] as DatabaseStore[],
};

export default Database;
