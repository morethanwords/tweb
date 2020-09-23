// just to include
import {secureRandom} from '../polyfill';
secureRandom;

import apiManager from "./apiManager";
import AppStorage from '../storage';
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";
import apiFileManager from './apiFileManager';
import { logger, LogLevels } from '../logger';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';

const log = logger('DW', LogLevels.error);

const ctx = self as any as DedicatedWorkerGlobalScope;

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

networkerFactory.setUpdatesProcessor((obj, bool) => {
  respond({update: {obj, bool}});
});

ctx.addEventListener('message', async(e) => {
  try {
    const task = e.data;
    const taskID = task.taskID;

    log.debug('got message:', taskID, task);

    //debugger;
  
    if(task.useLs) {
      AppStorage.finishTask(task.taskID, task.args);
      return;
    } else if(task.type == 'convertWebp') {
      const {fileName, bytes} = task.payload;
      const deferred = apiFileManager.webpConvertPromises[fileName];
      if(deferred) {
        deferred.resolve(bytes);
        delete apiFileManager.webpConvertPromises[fileName];
      }

      return;
    } else if((task as ServiceWorkerTask).type == 'requestFilePart') {
      const task = e.data as ServiceWorkerTask;
      const responseTask: ServiceWorkerTaskResponse = {
        type: task.type,
        id: task.id,
        payload: null
      };

      try {
        const res = await apiFileManager.requestFilePart(...task.payload);
        responseTask.payload = res;
      } catch(err) {

      }

      respond(responseTask);
      return;
    }
  
    switch(task.task) {
      case 'computeSRP':
      case 'gzipUncompress':
        // @ts-ignore
        return cryptoWorker[task.task].apply(cryptoWorker, task.args).then(result => {
          respond({taskID: taskID, result: result});
        });
  
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
  
          respond({taskID: taskID, result: result});
        } catch(err) {
          respond({taskID: taskID, error: err});
        }
      }
  
      default: {
        try {
          // @ts-ignore
          let result = apiManager[task.task].apply(apiManager, task.args);
  
          if(result instanceof Promise) {
            result = await result;
          }
  
          respond({taskID: taskID, result: result});
        } catch(err) {
          respond({taskID: taskID, error: err});
        }
  
        //throw new Error('Unknown task: ' + task.task);
      }
    }
  } catch(err) {

  }
});

ctx.postMessage('ready');
