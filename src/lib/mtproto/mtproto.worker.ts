/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// just to include
import '../polyfill';

import apiManager from "./apiManager";
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";
import apiFileManager from './apiFileManager';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';
import { ctx } from '../../helpers/userAgent';
import { socketsProxied } from './dcConfigurator';
import { notifyAll } from '../../helpers/context';

let webpSupported = false;
export const isWebpSupported = () => {
  return webpSupported;
};

networkerFactory.setUpdatesProcessor((obj) => {
  notifyAll({update: obj});
});

networkerFactory.onConnectionStatusChange = (status) => {
  notifyAll({type: 'connectionStatusChange', payload: status});
};

const onMessage = async(e: any) => {
  try {
    const task = e.data;
    const taskId = task.taskId;

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

      notifyAll(responseTask);
      return;
    } else if(task.type === 'webpSupport') {
      webpSupported = task.payload;
      return;
    } else if(task.type === 'socketProxy') {
      const socketTask = task.payload;
      const id = socketTask.id;
      
      const socketProxied = socketsProxied.get(id);
      if(socketTask.type === 'message') {
        socketProxied.dispatchEvent('message', socketTask.payload);
      } else if(socketTask.type === 'open') {
        socketProxied.dispatchEvent('open');
      } else if(socketTask.type === 'close') {
        socketProxied.dispatchEvent('close');
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
          notifyAll({taskId, result});
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
  
          notifyAll({taskId, result});
        } catch(error) {
          notifyAll({taskId, error});
        }

        break;
      }

      case 'getNetworker': {
        // @ts-ignore
        apiManager[task.task].apply(apiManager, task.args).finally(() => {
          notifyAll({taskId, result: null});
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

          //console.log(notifyAll);
  
          notifyAll({taskId, result});
        } catch(error) {
          notifyAll({taskId, error});
        }
  
        //throw new Error('Unknown task: ' + task.task);
        break;
      }
    }
  } catch(err) {

  }
};

//console.log('[WORKER] Will send ready', Date.now() / 1000);
ctx.addEventListener('message', onMessage);
notifyAll('ready');
