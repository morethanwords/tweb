/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {logger, LogTypes} from '../lib/logger';
import insertInDescendSortedArray from './array/insertInDescendSortedArray';
import {getMiddleware, MiddlewareHelper} from './middleware';
import middlewarePromise from './middlewarePromise';
import safeAssign from './object/safeAssign';
import pause from './schedulers/pause';

export type SortedElementBase<T = any> = {
  id: T,
  index: number
};

let id = 0;

export class BatchProcessor<Item extends any = any> {
  protected queue: Promise<Item>[];
  protected promise: Promise<void>;

  protected middlewareHelper: MiddlewareHelper;
  protected log: ReturnType<typeof logger>;

  protected process: (batch: Item[], m: ReturnType<typeof middlewarePromise>, log: BatchProcessor['log']) => Promise<any>;
  protected possibleError: any;

  constructor(options: {
    log?: BatchProcessor['log'],
    // middleware: MiddlewareHelper,
    process: BatchProcessor<Item>['process'],
    possibleError?: BatchProcessor['possibleError']
  }) {
    safeAssign(this, options);

    this.queue = [];
    this.middlewareHelper ??= getMiddleware();

    const prefix = 'BATCH-PROCESSOR-' + ++id;
    const logTypes = LogTypes.Warn | LogTypes.Error;
    if(this.log) {
      this.log = this.log.bindPrefix(prefix, logTypes);
    } else {
      this.log = logger(prefix, logTypes);
    }
  }

  public get queuePromise() {
    return this.promise;
  }

  public clear() {
    this.log('clear');
    this.queue.length = 0;
    this.promise = undefined;
    this.middlewareHelper.clean();
  }

  public addToQueue(item: BatchProcessor<Item>['queue'][0]) {
    this.queue.push(item);
    return this.setQueue();
  }

  protected setQueue() {
    if(!this.queue.length) {
      return Promise.resolve();
    }

    if(this.promise) {
      return this.promise;
    }

    const middleware = this.middlewareHelper.get();
    const log = this.log.bindPrefix('queue');
    const m = middlewarePromise(middleware, this.possibleError);

    const processQueue = async(): Promise<void> => {
      log('start', this.queue.length);

      const queue = this.queue.splice(0, this.queue.length);

      const perf = performance.now();
      const promises = queue.map((promise) => {
        promise.then((details) => {
          log('render item time', performance.now() - perf, details);
        });

        return promise;
      });

      const renderedQueue = await m(Promise.all(promises));
      await m(this.process(renderedQueue, m, log));

      log('queue rendered');

      if(this.queue.length) {
        log('have new items to render');
        return processQueue();
      } else {
        log('end');
      }
    };

    log('setting pause');
    const promise = this.promise = m(pause(0))
    .then(
      () => processQueue().catch((err: ApiError) => {
        if(err !== this.possibleError) {
          log.error('process queue error', err);
        }

        throw err;
      }),
      (err) => {
        log('pause has been cleared');
        throw err;
      }
    )
    .finally(() => {
      if(this.promise === promise) {
        this.promise = undefined;
      }
    });

    return promise;
  }
}

export default class SortedList<SortedElement extends SortedElementBase, SortedElementId = SortedElement['id']> {
  protected elements: Map<SortedElementId, SortedElement>;
  protected sorted: Array<SortedElement>;

  protected getIndex: (element: SortedElement) => PromiseLike<number> | number;
  protected onDelete: (element: SortedElement) => void;
  protected onUpdate: (element: SortedElement) => void;
  protected onSort: (element: SortedElement, idx: number) => void;
  protected onElementCreate: (base: SortedElementBase) => PromiseLike<SortedElement> | SortedElement;

  protected updateElementWith = (callback: () => void) => callback();
  protected updateListWith = (callback: (canUpdate: boolean | undefined) => void) => callback(true);

  protected middleware: MiddlewareHelper;

  protected batchProcessor: BatchProcessor<SortedElement>;

  protected log: ReturnType<typeof logger>;

  constructor(options: {
    getIndex: SortedList<SortedElement>['getIndex'],
    onDelete?: SortedList<SortedElement>['onDelete'],
    onUpdate?: SortedList<SortedElement>['onUpdate'],
    onSort?: SortedList<SortedElement>['onSort'],
    onElementCreate: SortedList<SortedElement>['onElementCreate'],

    updateElementWith?: SortedList<SortedElement>['updateElementWith'],
    updateListWith?: SortedList<SortedElement>['updateListWith'],

    log?: SortedList<SortedElement>['log']
  }) {
    safeAssign(this, options);

    this.elements = new Map();
    this.sorted = [];
    this.middleware = getMiddleware();

    this.batchProcessor = new BatchProcessor<SortedElement>({
      log: this.log,
      process: async(batch, m, log) => {
        // const elements = await Promise.all(batch.map((element) => this.onElementCreate(element)));
        const elements = batch;
        const promises = elements.map((element) => this.update(element.id, element));
        await m(Promise.all(promises));
      }
    });
  }

  public clear() {
    this.batchProcessor.clear();
    this.middleware.clean();
    this.elements.clear();
    this.sorted.length = 0;
  }

  protected _updateList() {
    this.elements.forEach((element) => {
      this.update(element.id);
    });

    if(this.onSort) {
      this.sorted.forEach((element, idx) => {
        this.onSort(element, idx);
      });
    }
  }

  public updateList(callback?: (updated: boolean) => void) {
    const middleware = this.middleware.get();
    this.updateListWith((canUpdate) => {
      if(!middleware() || (canUpdate !== undefined && !canUpdate)) {
        callback?.(false);
        return;
      }

      this._updateList();

      callback?.(true);
    });
  }

  public has(id: SortedElementId) {
    return this.elements.has(id);
  }

  public get(id: SortedElementId) {
    return this.elements.get(id);
  }

  public getAll() {
    return this.elements;
  }

  public async add(id: SortedElementId) {
    const element = this.get(id);
    if(element) {
      return;
      // return element;
    }

    const base: SortedElementBase = {
      id,
      index: 0
    };

    this.elements.set(id, base as SortedElement);
    const createPromise = Promise.resolve(this.onElementCreate(base));
    return this.batchProcessor.addToQueue(createPromise);

    // return element;
  }

  public delete(id: SortedElementId, noScheduler?: boolean) {
    const element = this.elements.get(id);
    if(!element) {
      return false;
    }

    this.elements.delete(id);

    const idx = this.sorted.indexOf(element);
    if(idx !== -1) {
      this.sorted.splice(idx, 1);
    }

    if(this.onDelete) {
      if(noScheduler) {
        this.onDelete(element);
      } else {
        const middleware = this.middleware.get();
        this.updateElementWith(() => {
          if(!middleware()) {
            return;
          }

          this.onDelete(element);
        });
      }
    }

    return true;
  }

  public async update(id: SortedElementId, element = this.get(id)) {
    if(!element) {
      return;
    }

    element.index = await this.getIndex(element);
    if(this.get(id) !== element) {
      return;
    }

    this.onUpdate?.(element);

    const idx = insertInDescendSortedArray(this.sorted, element, 'index');
    this.onSort(element, idx);
  }
}
