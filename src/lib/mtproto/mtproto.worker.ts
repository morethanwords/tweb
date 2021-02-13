// just to include
import '../polyfill';

import apiManager from "./apiManager";
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";
import apiFileManager from './apiFileManager';
//import { logger, LogLevels } from '../logger';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';
import { ctx } from '../../helpers/userAgent';
import { socketsProxied } from './dcConfigurator';

//const log = logger('DW', LogLevels.error);

//console.error('INCLUDE !!!', new Error().stack);

/* function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
} */

/* function fillTransfer(transfer: any, obj: any) {
  if(!obj) return;
  
  if(obj instanceof ArrayBuffer) {
    transfer.add(obj);
  } else if(obj.buffer && obj.buffer instanceof ArrayBuffer) {
    transfer.add(obj.buffer);
  } else if(isObject(obj)) {
    for(var i in obj) {
      fillTransfer(transfer, obj[i]);
    }
  } else if(Array.isArray(obj)) {
    obj.forEach(value => {
      fillTransfer(transfer, value);
    });
  }
} */

function respond(...args: any[]) {
  // отключил для всего потому что не успел пофиксить transfer detached
  //if(isSafari(self)/*  || true */) {
    // @ts-ignore
    ctx.postMessage(...args);
  /* } else {
    var transfer = new Set();
    fillTransfer(transfer, arguments);
    
    //console.log('reply', transfer, [...transfer]);
    ctx.postMessage(...arguments, [...transfer]);
    //console.log('reply', transfer, [...transfer]);
  } */
}

let webpSupported = false;
export const isWebpSupported = () => {
  return webpSupported;
};

networkerFactory.setUpdatesProcessor((obj) => {
  respond({update: obj});
});

networkerFactory.onConnectionStatusChange = (status) => {
  respond({type: 'connectionStatusChange', payload: status});
};

/* ctx.onerror = (error) => {
  console.error('error:', error);
};

ctx.onunhandledrejection = (error) => {
  console.error('onunhandledrejection:', error);
}; */

const onMessage = async(e: any) => {
  try {
    const task = e.data;
    const taskId = task.taskId;

    //log.debug('got message:', taskId, task);

    //debugger;
  
    if(task.type === 'convertWebp') {
      const {fileName, bytes} = task.payload;
      const deferred = apiFileManager.webpConvertPromises[fileName];
      if(deferred) {
        deferred.resolve(bytes);
        delete apiFileManager.webpConvertPromises[fileName];
      }

      return;
    } else if((task as ServiceWorkerTask).type === 'requestFilePart') {
      const task = e.data as ServiceWorkerTask;
      const responseTask: ServiceWorkerTaskResponse = {
        type: task.type,
        id: task.id
      };

      try {
        const res = await apiFileManager.requestFilePart(...task.payload);
        responseTask.payload = res;
      } catch(err) {
        responseTask.originalPayload = task.payload;
        responseTask.error = err;
      }

      respond(responseTask);
      return;
    } else if(task.type === 'webpSupport') {
      webpSupported = task.payload;
      return;
    } else if(task.type === 'socketProxy') {
      const socketTask = task.payload;
      const id = socketTask.id;
      
      const socketProxied = socketsProxied.get(id);
      if(socketTask.type === 'message') {
        socketProxied.setListenerResult('message', socketTask.payload);
      } else if(socketTask.type === 'open') {
        socketProxied.setListenerResult('open');
      } else if(socketTask.type === 'close') {
        socketProxied.setListenerResult('close');
        socketsProxied.delete(id);
      }
    }

    if(!task.task) {
      return;
    }
  
    switch(task.task) {
      case 'computeSRP':
      case 'gzipUncompress':
        // @ts-ignore
        return cryptoWorker[task.task].apply(cryptoWorker, task.args).then(result => {
          respond({taskId, result});
        });
  
      case 'setQueueId':
      case 'cancelDownload':
      case 'uploadFile':
      case 'downloadFile': {
        try {
          // @ts-ignore
          let result = apiFileManager[task.task].apply(apiFileManager, task.args);
  
          if(result instanceof Promise) {
            /* (result as ReturnType<ApiFileManager['downloadFile']>).notify = (progress: {done: number, total: number, offset: number}) => {
              notify({progress: {fileName, ...progress}});
            }; */
            result = await result;
          }
  
          respond({taskId, result});
        } catch(error) {
          respond({taskId, error});
        }

        break;
      }

      case 'getNetworker': {
        // @ts-ignore
        apiManager[task.task].apply(apiManager, task.args).finally(() => {
          respond({taskId, result: null});
        });
        
        break;
      }
  
      default: {
        try {
          // @ts-ignore
          let result = apiManager[task.task].apply(apiManager, task.args);
  
          if(result instanceof Promise) {
            result = await result;
          }
  
          respond({taskId, result});
        } catch(error) {
          respond({taskId, error});
        }
  
        //throw new Error('Unknown task: ' + task.task);
        break;
      }
    }
  } catch(err) {

  }
};

ctx.addEventListener('message', onMessage);

//console.log('[WORKER] Will send ready', Date.now() / 1000);
ctx.postMessage('ready');
