/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {TransportType} from '../lib/mtproto/dcConfigurator';

const Modes = {
  test: location.search.indexOf('test=1') > 0/*  || true */,
  debug: location.search.indexOf('debug=1') > 0,
  http: false,
  ssl: true, // location.search.indexOf('ssl=1') > 0 || location.protocol === 'https:' && location.search.indexOf('ssl=0') === -1,
  multipleConnections: true,
  asServiceWorker: false,
  transport: 'websocket' as TransportType,
  noSharedWorker: location.search.indexOf('noSharedWorker=1') > 0
};

if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
  Modes.http = location.search.indexOf('http=1') > 0;
}

if(import.meta.env.VITE_MTPROTO_HAS_HTTP || !import.meta.env.VITE_MTPROTO_HAS_WS) {
  Modes.http = true;
}

if(Modes.http) {
  Modes.transport = 'https';
}

if(import.meta.env.VITE_MTPROTO_SW) {
  Modes.asServiceWorker = true;
}

export default Modes;
