/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {webp2png} from './webp';
import type {ConvertWebPTask} from './webpWorkerController';

const ctx = self as any as DedicatedWorkerGlobalScope;
const tasks: ConvertWebPTask[] = [];
// let isProcessing = false;

function finishTask() {
  // isProcessing = false;
  processTasks();
}

function processTasks() {
  // if(isProcessing) return;

  const task = tasks.shift();
  if(!task) return;

  // isProcessing = true;

  switch(task.type) {
    case 'convertWebp': {
      const {fileName, bytes} = task.payload;

      let convertedBytes: Uint8Array;
      try {
        convertedBytes = webp2png(bytes).bytes;
      } catch(err) {
        console.error('Convert webp2png error:', err, 'payload:', task.payload);
      }

      ctx.postMessage({
        type: 'convertWebp',
        payload: {
          fileName,
          bytes: convertedBytes
        }
      });

      finishTask();

      break;
    }

    default:
      finishTask();
  }
}

function scheduleTask(task: ConvertWebPTask) {
  tasks.push(task);
  /* if(task.payload.fileName.indexOf('main-') === 0) {
    tasks.push(task);
  } else {
    tasks.unshift(task);
  } */

  processTasks();
}

ctx.addEventListener('message', (event) => {
  scheduleTask(event.data);
});
