/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from "../environment/ctx";
import SuperMessagePort from "../lib/mtproto/superMessagePort";

export default function listenMessagePort(
  messagePort: SuperMessagePort<any, any, any>, 
  onConnect?: (source: MessageEventSource) => void,
  onDisconnect?: (source: MessageEventSource) => void
) {
  const attachPort = (s: any) => {
    messagePort.attachPort(s);
    onConnect && onConnect(s);
  };

  onDisconnect && messagePort.setOnPortDisconnect(onDisconnect);

  if(typeof(SharedWorkerGlobalScope) !== 'undefined') {
    (ctx as any as SharedWorkerGlobalScope).addEventListener('connect', (e) => attachPort(e.source));
  } else {
    attachPort(ctx);
  }
}
