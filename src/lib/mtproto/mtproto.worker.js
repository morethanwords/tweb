import apiManager from "./apiManager";
import AppStorage from '../storage';
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";

//const ctx: Worker = self as any;
const ctx = self;

//console.error('INCLUDE !!!', new Error().stack);

networkerFactory.setUpdatesProcessor((obj, bool) => {
  ctx.postMessage({update: {obj, bool}});
});

ctx.onmessage = function(e) {
  var taskID = e.data.taskID;

  if(e.data.useLs) {
    AppStorage.finishTask(e.data.taskID, e.data.args);
    return;
  }

  switch(e.data.task) {
    case 'unzip':
      return cryptoWorker.gzipUncompress.apply(cryptoWorker, e.data.args).then(result => {
        ctx.postMessage({taskID: taskID, result: result});
      });

    default:
      return apiManager[e.data.task].apply(apiManager, e.data.args).then(result => {
        //console.log(e.data.task + ' result:', result, taskID);
        ctx.postMessage({taskID: taskID, result: result});
      }).catch(err => {
        //console.error(e.data.task + ' err:', err, taskID);
        ctx.postMessage({taskID: taskID, error: err});
      });
      //throw new Error('Unknown task: ' + e.data.task);
  }
}

ctx.postMessage('ready');
