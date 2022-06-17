/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from "../environment/ctx";
import SuperMessagePort from "../lib/mtproto/superMessagePort";

export default function listenMessagePort(messagePort: SuperMessagePort<any, any, any>, onConnect?: (source: MessageEventSource) => void) {
  if(typeof SharedWorkerGlobalScope !== 'undefined') {
    (self as any as SharedWorkerGlobalScope).addEventListener('connect', (e) => {
      const source = e.source;
      messagePort.attachPort(source);
      onConnect && onConnect(source);
    });
  } else {
    messagePort.attachPort(ctx);
    onConnect && onConnect(ctx);
  }
}
