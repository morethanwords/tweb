import {getWindowClients} from '../../helpers/context';
import {IS_BETA} from '../../config/debug';

import {logger, LogTypes} from '../logger';


const logMtprotoBug = logger('SW-mtproto-bug', LogTypes.None);

type Args = {
  connectedWindows: Map<string, WindowClient>;
  onWindowConnected: (source: WindowClient) => void;
};

export function watchMtprotoOnDev({connectedWindows, onWindowConnected}: Args) {
  if(IS_BETA) setInterval(() => {
    logMtprotoBug.debug('checking');

    if(!connectedWindows.size) {
      getWindowClients().then((windowClients) => {
        logMtprotoBug.debug(`got ${windowClients.length} windows`);

        windowClients.forEach((windowClient) => {
          onWindowConnected(windowClient);
        });
      });
    } else {
      logMtprotoBug.debug('has-windows');
    }

    // const timeout = self.setTimeout(() => {
    //   if(!connectedWindows.size) return;

    //   logMtprotoBug.debug('triggered');

    //   if(_mtprotoMessagePort) serviceMessagePort.detachPort(_mtprotoMessagePort);
    //   else serviceMessagePort.cancelAllTasks();
    //   logMtprotoBug.debug('cleared port ', _mtprotoMessagePort ? 'attached' : 'all');

    //   const it = connectedWindows.values().next();
    //   if(!it.done) {
    //     sendMessagePort(it.value);
    //     logMtprotoBug.debug('updated port');
    //   }
    // }, 0.5e3);

  // serviceMessagePort.invoke('pingMtProtoWorker', undefined).catch(noop).finally(() => {
  //   self.clearTimeout(timeout);
  // });
  }, 2e3);
}
