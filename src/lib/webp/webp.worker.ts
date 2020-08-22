import { webp2png } from './webp';
import type { WebpConvertTask } from './webpWorkerController';

const ctx = self as any as DedicatedWorkerGlobalScope;
const tasks: WebpConvertTask[] = [];
let isProcessing = false;

function finishTask() {
  isProcessing = false;
  processTasks();
}

function processTasks() {
  if(isProcessing) return;

  const task = tasks.shift();
  if(!task) return;

  isProcessing = true;

  switch(task.type) {
    case 'convertWebp': {
      const {fileName, bytes} = task.payload;

      ctx.postMessage({
        type: 'convertWebp', 
        payload: {
          fileName, 
          bytes: webp2png(bytes).bytes
        }
      });

      finishTask();

      break;
    }

    default:
      finishTask();
  }
}

function scheduleTask(task: WebpConvertTask) {
  tasks.push(task);
  processTasks();
}

ctx.addEventListener('message', (event) => {
  scheduleTask(event.data);
});
