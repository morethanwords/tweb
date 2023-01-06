/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {fastRaf} from './schedulers';
import deferredPromise, {CancellablePromise} from './cancellablePromise';
import {MOUNT_CLASS_TO} from '../config/debug';
import isInDOM from './dom/isInDOM';

class SequentialDom {
  private promises: Partial<{
    read: CancellablePromise<void>,
    write: CancellablePromise<void>
  }> = {};
  private raf = fastRaf.bind(null);
  private scheduled = false;

  private do(kind: keyof SequentialDom['promises'], callback?: VoidFunction) {
    let promise = this.promises[kind];
    if(!promise) {
      this.scheduleFlush();
      promise = this.promises[kind] = deferredPromise<void>();
    }

    if(callback !== undefined) {
      promise.then(() => callback());
    }

    return promise;
  }

  public measure(callback?: VoidFunction) {
    return this.do('read', callback);
  }

  public mutate(callback?: VoidFunction) {
    return this.do('write', callback);
  }

  /**
   * Will fire instantly if element is not connected
   * @param element
   * @param callback
   */
  public mutateElement(element: HTMLElement, callback?: VoidFunction) {
    const isConnected = isInDOM(element);
    const promise = isConnected ? this.mutate() : Promise.resolve();

    if(callback !== undefined) {
      if(!isConnected) {
        callback();
      } else {
        promise.then(() => callback());
      }
    }

    return promise;
  }

  private scheduleFlush() {
    if(!this.scheduled) {
      this.scheduled = true;

      this.raf(() => {
        this.promises.read && this.promises.read.resolve();
        this.promises.write && this.promises.write.resolve();

        this.scheduled = false;
        this.promises = {};
      });
    }
  }
}

const sequentialDom = new SequentialDom();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.sequentialDom = sequentialDom);
export default sequentialDom;
