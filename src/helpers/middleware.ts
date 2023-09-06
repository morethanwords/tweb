/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from './array/indexOfAndSplice';
import makeError from './makeError';

export type Middleware = {
  (): boolean;
  create(): MiddlewareHelper;
  onClean: (callback: VoidFunction) => void;
  onDestroy: (callback: VoidFunction) => void;
};

const createDetails = (): {
  cleaned?: boolean,
  inner: MiddlewareHelper[],
  onCleanCallbacks: VoidFunction[],
  middleware?: Middleware
} => ({
  cleaned: false,
  inner: [],
  onCleanCallbacks: []
});

const MIDDLEWARE_ERROR = makeError('MIDDLEWARE');

// * onClean == cancel promises, etc
// * onDestroy == destructor
export class MiddlewareHelper {
  private details = createDetails();
  private onDestroyCallbacks: VoidFunction[] = [];
  private parent: MiddlewareHelper;
  private destroyed: boolean;

  public clean() {
    const details = this.details;
    details.cleaned = true;
    details.inner.splice(0, details.inner.length).forEach((helper) => helper.destroy());
    details.onCleanCallbacks.splice(0, details.onCleanCallbacks.length).forEach((callback) => callback());
    details.middleware = undefined;
    this.details = createDetails();
  }

  public destroy() {
    this.destroyed = true;
    this.clean();
    this.onDestroyCallbacks.splice(0, this.onDestroyCallbacks.length).forEach((callback) => callback());

    if(this.parent) {
      indexOfAndSplice(this.parent.details.inner, this);
      this.parent = undefined;
    }
  }

  private createMiddlewareForDetails(details: ReturnType<typeof createDetails>, additionalCallback?: () => boolean) {
    const middleware: Middleware = () => {
      return !details.cleaned && (!additionalCallback || additionalCallback());
    };

    middleware.create = () => {
      if(!middleware()) throw MIDDLEWARE_ERROR;
      const helper = getMiddleware();
      helper.parent = this;
      details.inner.push(helper);
      return helper;
    };

    middleware.onClean = (callback) => {
      if(!middleware()) return callback();
      details.onCleanCallbacks.push(callback);
    };

    middleware.onDestroy = this.onDestroy;

    return middleware;
  }

  public get(additionalCallback?: () => boolean) {
    const details = this.details;
    if(details.cleaned) {
      return this.createMiddlewareForDetails(details);
    }

    if(additionalCallback) {
      return this.createMiddlewareForDetails(details, additionalCallback);
    }

    return details.middleware ??= this.createMiddlewareForDetails(details);
  }

  public onDestroy = (callback: VoidFunction) => {
    if(this.destroyed) return callback();
    this.onDestroyCallbacks.push(callback);
  };
}

// * will change .cleaned and new instance will be created
export function getMiddleware() {
  return new MiddlewareHelper();
}
