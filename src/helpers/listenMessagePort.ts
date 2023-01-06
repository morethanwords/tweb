/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type SuperMessagePort from '../lib/mtproto/superMessagePort';
import ctx from '../environment/ctx';

export default function listenMessagePort(
  messagePort: SuperMessagePort<any, any, any>,
  onConnect?: (source: MessageEventSource) => void,
  onDisconnect?: (source: MessageEventSource) => void
) {
  const attachPort = (listenPort: any, sendPort: any) => {
    messagePort.attachListenPort(listenPort);
    sendPort && messagePort.attachSendPort(sendPort);
    onConnect?.(listenPort);
  };

  messagePort.setOnPortDisconnect(onDisconnect);

  if(typeof(SharedWorkerGlobalScope) !== 'undefined') {
    (ctx as any as SharedWorkerGlobalScope).addEventListener('connect', (e) => attachPort(e.source, e.source));
  } else if(typeof(ServiceWorkerGlobalScope) !== 'undefined') {
    attachPort(ctx, null);
  } else {
    attachPort(ctx, ctx);
  }
}
