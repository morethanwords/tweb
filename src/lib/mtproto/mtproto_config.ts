import { IDBIndex, IDBStore } from "../idb";

export type UserAuth = number;

export const REPLIES_PEER_ID = 1271266957;

export const App = {
  id: 1025907,
  hash: '452b0359b988148995f22ff0f4229750',
  version: '0.4.0',
  domains: [] as string[],
  baseDcId: 2
};

export const Modes = {
  test: location.search.indexOf('test=1') > 0/*  || true */,
  debug: location.search.indexOf('debug=1') > 0,
  http: false, //location.search.indexOf('http=1') > 0,
  ssl: true, // location.search.indexOf('ssl=1') > 0 || location.protocol == 'https:' && location.search.indexOf('ssl=0') == -1,
  multipleConnections: true
};

export type DatabaseStoreName = 'session' | 'stickerSets';
export type DatabaseStore = Omit<IDBStore, 'name'> & {name: DatabaseStoreName};
export const Database = {
  name: 'tweb' + (Modes.test ? '_test' : ''),
  version: 5,
  stores: [{
    name: 'session'
  }, {
    name: 'stickerSets'
  }] as DatabaseStore[],
};

export const DEBUG = process.env.NODE_ENV !== 'production' || Modes.debug;
export const MOUNT_CLASS_TO: any = DEBUG ? (typeof(window) !== 'undefined' ? window : self) : null;
