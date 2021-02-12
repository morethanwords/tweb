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
  ssl: true, // location.search.indexOf('ssl=1') > 0 || location.protocol === 'https:' && location.search.indexOf('ssl=0') === -1,
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

export const superDebug = (object: any, key: string) => {
  var d = object[key];
  var beforeStr = '', afterStr = '';
  for(var r of d) {
    beforeStr += r.before.hex + '\n';
    afterStr += r.after.hex + '\n';
  }

  beforeStr = beforeStr.trim();
  afterStr = afterStr.trim();
  //var beforeStr = d.map(r => r.before.hex).join('\n');
  //var afterStr = d.map(r => r.after.hex).join('\n');

  var dada = (name: string, str: string) => {
    var a = document.createElement('a');
    a.target = '_blank';
    a.download = name + '.txt';
    a.href = URL.createObjectURL(new Blob([str], {
      type: 'text/plain'
    }));
    document.body.append(a);
    a.click();
  };

  dada(key + '_' + 'before', beforeStr);
  dada(key + '_' + 'after', afterStr);
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.superDebug = superDebug);
