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
  asServiceWorker: !!import.meta.env.VITE_MTPROTO_SW,
  transport: 'websocket' as TransportType,
  noSharedWorker: location.search.indexOf('noSharedWorker=1') > 0,
  multipleTransports: !!(import.meta.env.VITE_MTPROTO_AUTO && import.meta.env.VITE_MTPROTO_HAS_HTTP && import.meta.env.VITE_MTPROTO_HAS_WS)
};

if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
  const httpOnly = Modes.http = location.search.indexOf('http=1') > 0;
  if(httpOnly) {
    Modes.multipleTransports = false;
  }
}

// * start with HTTP first
if(Modes.multipleTransports) {
  Modes.http = true;
}

if(Modes.http) {
  Modes.transport = 'https';
}

export default Modes;
