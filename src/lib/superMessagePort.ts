import DEBUG from '@config/debug';
import tabId from '@config/tabId';
import ctx from '@environment/ctx';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import {IS_WORKER} from '@helpers/context';
import EventListenerBase from '@helpers/eventListenerBase';
import makeError from '@helpers/makeError';
import {WorkerTaskTemplate, WorkerTaskVoidTemplate} from '@types';
import {logger} from '@lib/logger';

type SuperMessagePortTask = WorkerTaskTemplate & {
  transfer?: Transferable[]
};

interface InvokeTask extends SuperMessagePortTask {
  type: 'invoke',
  payload: WorkerTaskVoidTemplate & {withAck?: boolean, void?: boolean}
}

interface ResultTask extends SuperMessagePortTask {
  type: 'result',
  payload: {
    taskId: number,
    result?: any,
    error?: any
  }
}

interface AckTask extends SuperMessagePortTask {
  type: 'ack',
  payload: {
    cached: boolean,
    taskId: number
    result?: any,
    error?: any,
  }
}

interface PingTask extends SuperMessagePortTask {
  type: 'ping'
}

interface PongTask extends SuperMessagePortTask {
  type: 'pong'
}

interface BatchTask extends SuperMessagePortTask {
  type: 'batch',
  payload: Task[]
}

interface CloseTask extends SuperMessagePortTask {
  type: 'close'
}

type DataCloneError = {
  type: 'DATA_CLONE_ERROR',
  message: string
};

// interface OpenTask extends SuperMessagePortTask {
//   type: 'open'
// }

interface LockTask extends SuperMessagePortTask {
  type: 'lock',
  payload: string
}

type Task = InvokeTask | ResultTask | AckTask | PingTask | PongTask | BatchTask | CloseTask/*  | OpenTask */ | LockTask;
type TaskMap = {
  [type in Task as type['type']]?: (task: Extract<Task, type>, source: MessageEventSource, event: MessageEvent<any>) => void | Promise<any>
};

export type AckedResult<T> = {
  cached: boolean,
  result: Promise<T>
};
// export type AckedResult<T> = {
//   cached: true,
//   result: T
// } | {
//   cached: false,
//   result: Promise<T>
// };

type ListenPort = WindowProxy | MessagePort | ServiceWorker | Worker | ServiceWorkerContainer;
type SendPort = Pick<MessageEventSource, 'postMessage'>/* WindowProxy | MessagePort | ServiceWorker | Worker */;

export type MessageListenPort = ListenPort;
export type MessageSendPort = SendPort;

type ListenerCallback = (payload: any, source: MessageEventSource, event: MessageEvent<any>) => any;
type Listeners = Record<string, ListenerCallback>;

const USE_LOCKS = true;
const USE_BATCHING = true;

// Stuck-invoke watchdog (DEBUG only).
const STUCK_WATCHDOG_INTERVAL_MS = 2000;
const STUCK_WARN_FIRST_MS = 5000;
const STUCK_WARN_PERSIST_MS = 30000;

// const PING_INTERVAL = DEBUG && false ? 0x7FFFFFFF : 5000;
// const PING_TIMEOUT = DEBUG && false ? 0x7FFFFFFF : 10000;

// A task payload holds the raw arguments of the call it carries — for 'computeSRP'
// argument 0 is the user's plaintext cloud password, the one credential SRP exists to
// keep on the device. logger.error always reaches console.error (LogTypes.Error survives
// DEBUG being off) and, in the worker realm, the exportable log ring buffer, so a task
// must never be logged whole: identify it instead.
function describeTask(task: Task) {
  return {
    id: task?.id,
    type: task?.type,
    invoke: task?.type === 'invoke' ? (task as InvokeTask).payload?.type : undefined
  };
}

// The parts a pending invoke is identified by, kept apart so the readable name is only
// built where it is actually printed.
type AwaitingTaskName = {
  taskType: string,
  taskName?: string,
  taskMethod?: string
};

function getInvokeTaskName(type: string, value: unknown): AwaitingTaskName {
  const payload = value as {
    name?: string,
    method?: string
  };

  return {
    taskType: type,
    taskName: payload?.name,
    taskMethod: payload?.method
  };
}

function formatAwaitingName(entry: AwaitingTaskName) {
  return [
    entry.taskType,
    entry.taskName,
    entry.taskMethod
  ].filter(Boolean).join(':');
}


class SuperMessagePort<
  Workers extends Listeners,
  Masters extends Listeners,
  IsMaster extends boolean,
  Receive extends Listeners = IsMaster extends true ? Masters : Workers,
  Send extends Listeners = IsMaster extends true ? Workers : Masters
> extends EventListenerBase<Receive> {
  protected listenPorts: Array<ListenPort>;
  protected sendPorts: Array<SendPort>;
  protected pingResolves: Map<SendPort, () => void>;

  protected taskId: number;
  // * the task name is stored unjoined on purpose: every invoke allocates this entry,
  // * but only the stuck watchdog and the debug log ever read it, so building the
  // * string here would be per-call garbage for something almost nobody looks at
  protected awaiting: {
    [id: number]: AwaitingTaskName & {
      resolve: any,
      reject: any,
      port?: SendPort,
      createdAt: number,
      warned?: boolean
    }
  };
  protected stuckWatchdogInterval?: ReturnType<typeof setInterval>;
  protected pending: Map<SendPort, Task[]>;

  protected log: ReturnType<typeof logger>;
  protected debug: boolean;
  protected releasingPending: boolean;

  protected processTaskMap: TaskMap;

  protected onPortDisconnect: (source: MessageEventSource) => void;
  // protected onPortConnect: (source: MessageEventSource) => void;

  protected heldLocks: Map<SendPort, {resolve: () => void, id: string}>;
  protected requestedLocks: Map<string, SendPort>;

  constructor(protected logSuffix?: string) {
    super(false);

    this.listenPorts = [];
    this.sendPorts = [];
    this.pingResolves = new Map();
    this.taskId = Math.random(); // [0 <-> 1] Have some decimals to prevent tabs from overlapping ids
    this.awaiting = {};
    this.pending = new Map();
    this.log = logger('MP' + (logSuffix ? '-' + logSuffix : ''));
    this.debug = DEBUG && false;
    this.heldLocks = new Map();
    this.requestedLocks = new Map();

    this.processTaskMap = {
      result: this.processResultTask,
      ack: this.processAckTask,
      invoke: this.processInvokeTask,
      ping: this.processPingTask,
      pong: this.processPongTask,
      close: this.processCloseTask,
      // open: this.processOpenTask,
      lock: this.processLockTask,
      batch: this.processBatchTask
    };

    // Watchdog: when a port-bridged invoke hangs (handler unregistered, port
    // never started, peer crashed), the proxy quietly accumulates entries in
    // `awaiting` forever and the UI just doesn't progress. Periodically log
    // anything older than the threshold so the symptom surfaces immediately
    // — particularly important in Modes.noWorker where there's no cross-thread
    // boundary to blame.
    if(DEBUG) {
      this.stuckWatchdogInterval = ctx.setInterval(this.scanStuckAwaiting, STUCK_WATCHDOG_INTERVAL_MS) as any;
    }
  }

  protected scanStuckAwaiting = () => {
    const now = Date.now();
    for(const id in this.awaiting) {
      const entry = this.awaiting[id];
      const age = now - entry.createdAt;
      if(!entry.warned && age >= STUCK_WARN_FIRST_MS) {
        entry.warned = true;
        this.log.warn(`[STUCK] ${formatAwaitingName(entry)} pending ${age}ms (id=${id})`);
      } else if(entry.warned && age >= STUCK_WARN_PERSIST_MS && age % STUCK_WARN_PERSIST_MS < STUCK_WATCHDOG_INTERVAL_MS) {
        this.log.error(`[STUCK] ${formatAwaitingName(entry)} still pending after ${age}ms (id=${id}) — likely no listener on peer or port not started`);
      }
    }
  };

  public setOnPortDisconnect(callback: (source: MessageEventSource) => void) {
    this.onPortDisconnect = callback;
  }

  // public setOnPortConnect(callback: (source: MessageEventSource) => void) {
  //   this.onPortConnect = callback;
  // }

  public attachPort(port: MessageEventSource) {
    this.attachListenPort(port);
    this.attachSendPort(port);
  }

  public attachListenPort(port: ListenPort) {
    this.listenPorts.push(port);
    port.addEventListener('message', this.onMessage as any);
  }

  public attachSendPort(port: SendPort) {
    this.log.warn('attaching send port');

    (port as MessagePort).start?.();

    this.sendPorts.push(port);
    // this.sendPing(port);

    // const task = this.createTask('open', undefined);
    // this.postMessage(port, task);

    if(typeof(window) !== 'undefined' && USE_LOCKS) {
      if('locks' in navigator) {
        const id = ['lock', tabId, this.logSuffix || '', Math.random() * 0x7FFFFFFF | 0].join('-');
        this.log.warn('created lock', id);
        const promise = new Promise<void>((resolve) => this.heldLocks.set(port, {resolve, id}))
        .then(() => this.heldLocks.delete(port));
        navigator.locks.request(id, () => {
          this.resendLockTask(port);
          return promise;
        });
      } else {
        window.addEventListener('beforeunload', () => {
          const task = this.createTask('close', undefined);
          this.postMessage(undefined, task);
        });
      }
    }

    this.releasePending();
  }

  public resendLockTask(port: SendPort) {
    const lock = this.heldLocks.get(port);
    if(!lock) {
      return;
    }

    this.pushTask(this.createTask('lock', lock.id), port);
  }

  // ! Can't rely on ping because timers can be suspended
  // protected sendPing(port: SendPort, loop = IS_WORKER) {
  //   let timeout: number;
  //   const promise = new Promise<void>((resolve, reject) => {
  //     this.pingResolves.set(port, resolve);
  //     this.pushTask(this.createTask('ping', undefined), port);

  //     timeout = ctx.setTimeout(() => {
  //       reject();
  //     }, PING_TIMEOUT);
  //   });

  //   promise.then(() => {
  //     // this.log('got pong');

  //     clearTimeout(timeout);
  //     this.pingResolves.delete(port);

  //     if(loop) {
  //       this.sendPingWithTimeout(port);
  //     }
  //   }, () => {
  //     this.pingResolves.delete(port);
  //     this.detachPort(port);
  //   });
  // }

  // protected sendPingWithTimeout(port: SendPort, timeout = PING_INTERVAL) {
  //   ctx.setTimeout(() => {
  //     if(!this.sendPorts.includes(port)) {
  //       return;
  //     }

  //     this.sendPing(port);
  //   }, timeout);
  // }

  public detachPort(port: ListenPort) {
    this.log.warn('disconnecting port');

    indexOfAndSplice(this.listenPorts, port);
    indexOfAndSplice(this.sendPorts, port as any);

    port.removeEventListener?.('message', this.onMessage as any);
    (port as MessagePort).close?.();

    this.onPortDisconnect?.(port as any);

    const heldLock = this.heldLocks.get(port as SendPort);
    heldLock?.resolve();

    const error = makeError('PORT_DISCONNECTED');
    for(const id in this.awaiting) {
      const task = this.awaiting[id];
      if(task.port === port) {
        task.reject(error);
        delete this.awaiting[id];
      }
    }
  }

  protected postMessage(port: SendPort | SendPort[], task: Task) {
    const ports = Array.isArray(port) ? port : (port ? [port] : this.sendPorts);
    ports.forEach((port) => {
      if(import.meta.env.MODE === 'test') {
        return;
      }

      // try {
      //   const perf = performance.now();
      //   const clone = structuredClone(task); clone;
      //   this.log('postMessage clone time',
      //     task.type,
      //     performance.now() - perf,
      //     task.type === 'batch' ? task.payload.length : undefined
      //   );
      // } catch(err) {
      //   console.error('postMessage clone error', err);
      // }

      port.postMessage(task, task.transfer as any);
    });
  }

  protected onMessage = (event: MessageEvent) => {
    const task: Task = event.data;
    // this.log('got message', task);

    const source: MessageEventSource = event.source || event.currentTarget as any; // can have no source

    // @ts-ignore
    this.processTaskMap[task.type](task, source, event);
  };

  protected async releasePending() {
    // return;

    if(/* !this.listenPorts.length || !this.sendPorts.length ||  */this.releasingPending) {
      return;
    }

    this.releasingPending = true;
    // const perf = performance.now();

    if(USE_BATCHING) {
      await Promise.resolve();
    }
    // await pause(0);

    this.debug && this.log.debug('releasing tasks, length:', this.pending.size/* , performance.now() - perf */);

    this.pending.forEach((portTasks, port) => {
      let tasks: Task[] = portTasks;
      if(USE_BATCHING) {
        let batchTask: BatchTask;
        tasks = [];
        portTasks.forEach((task) => {
          if(task.transfer) {
            batchTask = undefined;
            tasks.push(task);
          } else {
            if(!batchTask) {
              batchTask = this.createTask('batch', []);
              tasks.push(batchTask);
            }

            batchTask.payload.push(task);
          }
        });
      }

      const ports = port ? [port] : this.sendPorts;
      if(!ports.length) {
        return;
      }

      tasks.forEach((task) => {
        // if(USE_BATCHING && task.type === 'batch') {
        //   this.log(`batching ${task.payload.length} tasks`);
        // }

        this.sendTask(ports, task);
      });

      this.pending.delete(port);
    });

    this.debug && this.log.debug('released tasks');

    this.releasingPending = false;
  }

  private createDataCloneError(): DataCloneError {
    return {
      type: 'DATA_CLONE_ERROR',
      message: 'Message port task payload could not be cloned'
    };
  }

  private isDataCloneError(error: unknown) {
    return (error as {name?: string})?.name === 'DataCloneError';
  }

  private sendDataCloneError(port: SendPort, taskId: number) {
    const task = this.createTask('result', {
      taskId,
      error: this.createDataCloneError()
    });

    try {
      this.postMessage(port, task);
    } catch(error) {
      this.log.error('postMessage clone-error fallback failed:', error, task.type, task.id);
    }
  }

  private rejectUnsentInvoke(task: InvokeTask, error: unknown) {
    const deferred = this.awaiting[task.id];
    if(!deferred) {
      return;
    }

    delete this.awaiting[task.id];
    deferred.reject(error);
  }

  private getTaskDebugName(task: Task) {
    return task.type === 'invoke' ?
      formatAwaitingName(getInvokeTaskName(task.payload.type, task.payload.payload)) :
      task.type;
  }

  private sendTask(ports: SendPort[], task: Task, deliveredElsewhere = false) {
    const failedPorts: SendPort[] = [];
    const cloneFailedPorts: SendPort[] = [];
    let firstError: unknown;
    let sent = false;

    ports.forEach((port) => {
      try {
        this.postMessage(port, task);
        sent = true;
      } catch(error) {
        failedPorts.push(port);
        firstError ??= error;
        if(this.isDataCloneError(error)) {
          cloneFailedPorts.push(port);
        } else {
          this.log.error('postMessage error:', error, task.type, task.id);
        }
      }
    });

    if(!failedPorts.length) {
      return;
    }

    if(cloneFailedPorts.length) {
      this.log.error(
        'postMessage data clone error:',
        this.getTaskDebugName(task),
        task.id
      );
    }

    if(task.type === 'batch') {
      const wasDelivered = deliveredElsewhere || sent;
      task.payload.forEach((innerTask) => {
        this.sendTask(failedPorts, innerTask, wasDelivered);
      });
    } else if(task.type === 'result' || task.type === 'ack') {
      cloneFailedPorts.forEach((port) => {
        this.sendDataCloneError(port, task.payload.taskId);
      });
    } else if(task.type === 'invoke' && !task.payload.void && !sent && !deliveredElsewhere) {
      this.rejectUnsentInvoke(
        task,
        cloneFailedPorts.length === failedPorts.length ?
          this.createDataCloneError() :
          firstError
      );
    }
  }

  protected processResultTask = (task: ResultTask) => {
    const {taskId, result, error} = task.payload;
    const deferred = this.awaiting[taskId];
    if(!deferred) {
      return;
    }

    this.debug && this.log.debug('done', formatAwaitingName(deferred), result, error);
    'error' in task.payload ? deferred.reject(error) : deferred.resolve(result);
    delete this.awaiting[taskId];
  };

  protected processAckTask = (task: AckTask) => {
    const payload = task.payload;
    const deferred = this.awaiting[payload.taskId];
    if(!deferred) {
      return;
    }

    // * will finish the init promise with incoming result
    const previousResolve: (acked: AckedResult<any>) => void = deferred.resolve;
    // const previousReject = deferred.reject;

    // if(payload.cached) {
    //   if('result' in payload) {
    //     previousResolve({
    //       cached: true,
    //       result: payload.result
    //     });
    //   } else {
    //     previousReject(payload.error);
    //   }
    // } else {
    //   const ret: AckedResult<any> = {
    //     cached: false,
    //     result: new Promise((resolve, reject) => {
    //       deferred.resolve = resolve;
    //       deferred.reject = reject;
    //     })
    //   };

    //   previousResolve(ret);
    // }

    const ret: AckedResult<any> = {
      cached: payload.cached,
      result: payload.cached ? ('result' in payload ? Promise.resolve(payload.result) : Promise.reject(payload.error)) : new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
      })
    };

    previousResolve(ret);

    if(payload.cached) {
      delete this.awaiting[payload.taskId];
    }
  };

  protected processPingTask = (task: PingTask, source: MessageEventSource, event: MessageEvent) => {
    this.pushTask(this.createTask('pong', undefined), event.source);
  };

  protected processPongTask = (task: PongTask, source: MessageEventSource, event: MessageEvent) => {
    const pingResolve = this.pingResolves.get(source);
    if(pingResolve) {
      this.pingResolves.delete(source);
      pingResolve();
    }
  };

  protected processCloseTask = (task: CloseTask, source: MessageEventSource, event: MessageEvent) => {
    this.detachPort(source);
  };

  protected processBatchTask = (task: BatchTask, source: MessageEventSource, event: MessageEvent) => {
    if(!USE_BATCHING) {
      return;
    }

    const newEvent: MessageEvent = {data: event.data, source: event.source, currentTarget: event.currentTarget} as any;
    task.payload.forEach((task) => {
      // @ts-ignore
      newEvent.data = task;
      this.onMessage(newEvent);
    });
  };

  // * it's just an 'open' callback, DO NOT attach port from here
  // protected processOpenTask = (task: OpenTask, source: MessageEventSource, event: MessageEvent) => {
  //   this.onPortConnect?.(source);
  // };

  protected processLockTask = (task: LockTask, source: MessageEventSource, event: MessageEvent) => {
    const id = task.payload;
    if(this.requestedLocks.has(id)) {
      return;
    }

    this.requestedLocks.set(id, source);
    navigator.locks.request(id, () => {
      this.processCloseTask(undefined, source, undefined);
      this.requestedLocks.delete(id);
    });
  };

  protected processInvokeTask = async(task: InvokeTask, source: MessageEventSource, event: MessageEvent) => {
    const id = task.id;
    const innerTask = task.payload;

    let resultTaskPayload: ResultTask['payload'];
    let resultTask: ResultTask, ackTask: AckTask;
    if(!innerTask.void) {
      resultTaskPayload = {taskId: id};
      resultTask = this.createTask('result', resultTaskPayload);
    }

    if(innerTask.withAck) {
      ackTask = this.createTask('ack', {
        taskId: id,
        cached: true
      });
    }

    let isPromise: boolean;

    try {
      const listeners = this.listeners[innerTask.type];
      if(!listeners?.size) {
        throw new Error('no listener');
      }

      const listener = listeners.values().next().value;

      // @ts-ignore
      let result = this.invokeListenerCallback(innerTask.type, listener, innerTask.payload, source, event);
      if(innerTask.void) {
        return;
      }

      isPromise = result instanceof Promise;

      if(ackTask) {
        const cached = !isPromise;
        ackTask.payload.cached = cached;
        if(cached) ackTask.payload.result = result;
        this.pushTask(ackTask, source);

        if(cached) {
          return;
        }
      }

      if(isPromise) {
        result = await result;
      }

      if(result instanceof SuperMessagePort.TransferableResult) {
        resultTask.transfer = result.transferables;
        result = result.value;
      }

      resultTaskPayload.result = result;
    } catch(error) {
      this.log.error('worker task error:', error, describeTask(task));
      if(innerTask.void) {
        return;
      }

      if(ackTask && ackTask.payload.cached) {
        ackTask.payload.error = error;
        this.pushTask(ackTask, source);
        return;
      }

      resultTaskPayload.error = error;
    }

    this.pushTask(resultTask, source);
  };

  protected createTask<T extends Task['type'], K extends Task = Parameters<TaskMap[T]>[0]>(type: T, payload: K['payload'], transfer?: Transferable[]): K {
    return {
      type,
      payload,
      id: this.getNextTaskId(),
      transfer
    } as K;
  }

  protected createInvokeTask(type: string, payload: any, withAck?: boolean, _void?: boolean, transfer?: Transferable[]): InvokeTask {
    return this.createTask('invoke', {
      type,
      payload,
      withAck,
      void: _void
    }, transfer);
  }

  protected pushTask(task: Task, port?: SendPort) {
    let tasks = this.pending.get(port);
    if(!tasks) {
      this.pending.set(port, tasks = []);
    }

    tasks.push(task);
    this.releasePending();
  }

  public getNextTaskId() {
    return this.taskId++;
  }

  public invokeVoid<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], port?: SendPort, transfer?: Transferable[]) {
    const task = this.createInvokeTask(type as string, payload, undefined, true, transfer);
    this.pushTask(task, port);
  }

  // typed cross-invoke: subclasses whose UI->worker methods aren't part of Send (both bundles
  // share one <false> instance) route through these instead of per-class @ts-ignore wrappers
  protected invokeVoidAs<M extends Listeners, T extends keyof M>(type: T, payload: Parameters<M[T]>[0], port?: SendPort, transfer?: Transferable[]) {
    this.invokeVoid(type as any, payload as any, port, transfer);
  }

  protected invokeAs<M extends Listeners, T extends keyof M>(type: T, payload: Parameters<M[T]>[0], port?: SendPort, transfer?: Transferable[]): Promise<Awaited<ReturnType<M[T]>>> {
    return this.invoke(type as any, payload as any, false, port, transfer) as any;
  }

  public invoke<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], withAck?: false, port?: SendPort, transfer?: Transferable[], timeout?: number): Promise<Awaited<ReturnType<Send[T]>>>;
  public invoke<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], withAck?: true, port?: SendPort, transfer?: Transferable[], timeout?: number): Promise<AckedResult<Awaited<ReturnType<Send[T]>>>>;
  public invoke<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], withAck?: boolean, port?: SendPort, transfer?: Transferable[], timeout?: number) {
    this.debug && this.log.debug('start', type, payload);

    let task: InvokeTask;
    const promise = new Promise<Awaited<ReturnType<Send[T]>>>((resolve, reject) => {
      task = this.createInvokeTask(type as string, payload, withAck, undefined, transfer);
      this.awaiting[task.id] = {
        ...getInvokeTaskName(type as string, payload),
        resolve,
        reject,
        port,
        createdAt: Date.now()
      };
      this.pushTask(task, port);
    });

    if(timeout) {
      const deferred = this.awaiting[task.id];
      const timeoutId = setTimeout(() => {
        if(this.awaiting[task.id] !== deferred) {
          return;
        }

        delete this.awaiting[task.id];
        deferred.reject(makeError('TIMEOUT'));
      }, timeout);
      promise.then(
        () => clearTimeout(timeoutId),
        () => clearTimeout(timeoutId)
      );
    }

    if(IS_WORKER/*  || true */) {
      const clearLogInterval = () => {
        clearInterval(interval);
      };
      promise.then(clearLogInterval, clearLogInterval);

      const interval = ctx.setInterval(() => {
        this.log.error('task still has no result', describeTask(task), port);
      }, IS_WORKER ? 60e3 : 5e3);
    } else if(false) {
      // let timedOut = false;
      const startTime = Date.now();
      promise.finally(() => {
        const elapsedTime = Date.now() - startTime;
        if(elapsedTime >= TIMEOUT) {
          this.log.error(`task was processing ${Date.now() - startTime}ms`, describeTask(task), port);
        }/*  else {
          clearTimeout(timeout);
        } */
      });

      const TIMEOUT = 10;
      // const timeout = ctx.setTimeout(() => {
      //   timedOut = true;
      //   // this.log.error(`task is processing more than ${TIMEOUT} milliseconds`, task, port);
      // }, TIMEOUT);
    }

    return promise;
  }

  public invokeExceptSource<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], source?: SendPort) {
    const ports = this.sendPorts.slice();
    indexOfAndSplice(ports, source);

    ports.forEach((target) => {
      this.invokeVoid(type, payload, target);
    });
  }

  public async invokeExceptSourceAsync<T extends keyof Send>(type: T, payload: Parameters<Send[T]>[0], source?: SendPort) {
    const ports = this.sendPorts.slice();
    indexOfAndSplice(ports, source);

    await Promise.all(ports.map((target) => this.invoke(type, payload, undefined, target)));
  }
}

namespace SuperMessagePort {
  export type TransferableResultValue<T> = T extends MaybePromise<TransferableResult<infer U>> ? U : T;

  export class TransferableResult<T> {
    constructor(public value: T, public transferables: Transferable[]) { }
  };
}

export default SuperMessagePort;
