// just to include
import {secureRandom} from '../polyfill';
secureRandom;

import apiManager from "./apiManager";
import AppStorage from '../storage';
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";

//const ctx: Worker = self as any;
const ctx = self;

//console.error('INCLUDE !!!', new Error().stack);

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 *
 * @private
 * @param scope {WindowOrWorkerGlobalScope} Since this function is used both on the main thread and WebWorker context,
 *      let the calling scope pass in the global scope object.
 * @returns {boolean}
 */
var _isSafari = null;
function isSafari(scope) {
  if(_isSafari == null) {
    var userAgent = scope.navigator ? scope.navigator.userAgent : null;
    _isSafari = !!scope.safari ||
    !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
  }
  return _isSafari;
}

function isObject(object) {
  return typeof(object) === 'object' && object !== null;
}

function fillTransfer(transfer, obj) {
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
}

function reply() {
  // отключил для всего потому что не успел пофиксить transfer detached
  //if(isSafari(self)/*  || true */) {
    ctx.postMessage(...arguments);
  /* } else {
    var transfer = new Set();
    fillTransfer(transfer, arguments);
    
    //console.log('reply', transfer, [...transfer]);
    ctx.postMessage(...arguments, [...transfer]);
    //console.log('reply', transfer, [...transfer]);
  } */
}

networkerFactory.setUpdatesProcessor((obj, bool) => {
  //ctx.postMessage({update: {obj, bool}});
  reply({update: {obj, bool}});
});

ctx.onmessage = function(e) {
  var taskID = e.data.taskID;

  if(e.data.useLs) {
    AppStorage.finishTask(e.data.taskID, e.data.args);
    return;
  }

  switch(e.data.task) {
    case 'computeSRP':
    case 'gzipUncompress':
      return cryptoWorker[e.data.task].apply(cryptoWorker, e.data.args).then(result => {
        //ctx.postMessage({taskID: taskID, result: result});
        reply({taskID: taskID, result: result});
      });

    default: {
      try {
        let result = apiManager[e.data.task].apply(apiManager, e.data.args);
        if(result instanceof Promise) {
          result.then(result => {
            //console.log(e.data.task + ' result:', result, taskID);
            reply({taskID: taskID, result: result});
            //ctx.postMessage({taskID: taskID, result: result});
          }).catch(err => {
            //console.error(e.data.task + ' err:', err, taskID);
            //ctx.postMessage({taskID: taskID, error: err});
            reply({taskID: taskID, error: err});
          });
        } else {
          //ctx.postMessage({taskID: taskID, result: result});
          reply({taskID: taskID, result: result});
        }
      } catch(err) {
        reply({taskID: taskID, error: err});
        //ctx.postMessage({taskID: taskID, error: err});
      }

      //throw new Error('Unknown task: ' + e.data.task);
    }
  }
}

ctx.postMessage('ready');
