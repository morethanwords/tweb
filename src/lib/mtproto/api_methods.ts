/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from "../../environment/ctx";
import { ignoreRestrictionReasons } from "../../helpers/restrictions";
import { MethodDeclMap, User } from "../../layer";
import { InvokeApiOptions } from "../../types";
import { AppManager } from "../appManagers/manager";
import { ApiError } from "./apiManager";
import { MTAppConfig } from "./appConfig";
import { UserAuth } from "./mtproto_config";
import { MTMessage } from "./networker";

type HashResult = {
  hash: number,
  result: any
};

type HashOptions = {
  [queryJSON: string]: HashResult
};

export default abstract class ApiManagerMethods extends AppManager {
  private afterMessageIdTemp: number;
  private hashes: {[method: string]: HashOptions} = {};
  private apiPromisesSingleProcess: {
    [q: string]: Map<any, Promise<any>>
  } = {};
  private apiPromisesSingle: {
    [q: string]: Promise<any>
  } = {};
  private apiPromisesCacheable: {
    [method: string]: {
      [queryJSON: string]: {
        timestamp: number,
        promise: Promise<any>,
        fulfilled: boolean,
        timeout?: number,
        params: any
      }
    }
  } = {};

  private appConfig: MTAppConfig;
  private getAppConfigPromise: Promise<MTAppConfig>;

  constructor() {
    super();
    this.afterMessageIdTemp = 0;
  }

  abstract setUserAuth(userAuth: UserAuth | UserId): Promise<void>;

  public setUser(user: User) {
    // appUsersManager.saveApiUser(user);
    return this.setUserAuth(user.id);
  }

  abstract invokeApi<T extends keyof MethodDeclMap>(method: T, params?: MethodDeclMap[T]['req'], options?: InvokeApiOptions): Promise<MethodDeclMap[T]['res']>;

  public invokeApiAfter<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    let o = options;
    o.prepareTempMessageId = '' + ++this.afterMessageIdTemp;
    
    o = {...options};
    (options as MTMessage).messageId = o.prepareTempMessageId;

    //console.log('will invokeApi:', method, params, options);
    return this.invokeApi(method, params, o);
  }

  public invokeApiHashable<T extends keyof MethodDeclMap, R>(o: {
    method: T, 
    processResult?: (response: MethodDeclMap[T]['res']) => R, 
    processError?: (error: ApiError) => any,
    params?: Omit<MethodDeclMap[T]['req'], 'hash'>, 
    options?: InvokeApiOptions & {cacheKey?: string}
  }) {
    // @ts-ignore
    o.params ??= {};
    o.options ??= {};
    //console.log('will invokeApi:', method, params, options);

    const {params, options, method} = o;

    const queryJSON = JSON.stringify(params);
    let cached: HashResult;
    if(this.hashes[method]) {
      cached = this.hashes[method][queryJSON];
      if(cached) {
        (params as any).hash = cached.hash;
      }
    }

    return this.invokeApiSingleProcess<T, R>({
      method,
      processResult: (result) => {
        if(result._.includes('NotModified')) {
          // this.debug && this.log.warn('NotModified saved!', method, queryJSON);
          return cached.result;
        }
        
        if(result.hash/*  || result.messages */) {
          const hash = result.hash/*  || this.computeHash(result.messages) */;
          
          if(!this.hashes[method]) this.hashes[method] = {};
          this.hashes[method][queryJSON] = {
            hash,
            result
          };
        }

        if(o.processResult) {
          return o.processResult(result);
        }
  
        return result;
      },
      params,
      options
    });
  }

  public invokeApiSingle<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {} as any, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    const q = method + '-' + JSON.stringify(params);
    const cache = this.apiPromisesSingle;
    if(cache[q]) {
      return cache[q];
    }

    return cache[q] = this.invokeApi(method, params, options).finally(() => {
      delete cache[q];
    });
  }

  public invokeApiSingleProcess<T extends keyof MethodDeclMap, R>(o: {
    method: T, 
    processResult: (response: MethodDeclMap[T]['res']) => R, 
    processError?: (error: ApiError) => any,
    params?: MethodDeclMap[T]['req'], 
    options?: InvokeApiOptions & {cacheKey?: string}
  }): Promise<Awaited<R>> {
    o.params ??= {};
    o.options ??= {};

    const {method, processResult, processError, params, options} = o;
    const cache = this.apiPromisesSingleProcess;
    const cacheKey = options.cacheKey || JSON.stringify(params);
    const map = cache[method] ?? (cache[method] = new Map());
    const oldPromise = map.get(cacheKey);
    if(oldPromise) {
      return oldPromise;
    }
    
    const originalPromise = this.invokeApi(method, params, options);
    const newPromise: Promise<Awaited<R>> = originalPromise.then(processResult, processError);

    const p = newPromise.finally(() => {
      map.delete(cacheKey);
      if(!map.size) {
        delete cache[method];
      }
    });

    map.set(cacheKey, p);
    return p;
  }

  public invokeApiCacheable<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {} as any, options: InvokeApiOptions & Partial<{cacheSeconds: number, override: boolean}> = {}): Promise<MethodDeclMap[T]['res']> {
    const cache = this.apiPromisesCacheable[method] ?? (this.apiPromisesCacheable[method] = {});
    const queryJSON = JSON.stringify(params);
    const item = cache[queryJSON];
    if(item && (!options.override || !item.fulfilled)) {
      return item.promise;
    }

    if(options.override) {
      if(item && item.timeout) {
        clearTimeout(item.timeout);
        delete item.timeout;
      }

      delete options.override;
    }

    let timeout: number;
    if(options.cacheSeconds) {
      timeout = ctx.setTimeout(() => {
        delete cache[queryJSON];
      }, options.cacheSeconds * 1000);
      delete options.cacheSeconds;
    }

    const promise = this.invokeApi(method, params, options);

    cache[queryJSON] = {
      timestamp: Date.now(),
      fulfilled: false,
      timeout,
      promise,
      params
    };

    return promise;
  }

  public clearCache<T extends keyof MethodDeclMap>(method: T, verify: (params: MethodDeclMap[T]['req']) => boolean) {
    const cache = this.apiPromisesCacheable[method];
    if(cache) {
      for(const queryJSON in cache) {
        const item = cache[queryJSON];
        try {
          if(verify(item.params)) {
            if(item.timeout) {
              clearTimeout(item.timeout);
            }
  
            delete cache[queryJSON];
          }
        } catch(err) {
          // this.log.error('clearCache error:', err, queryJSON, item);
        }
      }
    }
  }

  public getConfig() {
    return this.invokeApiCacheable('help.getConfig');
  }

  public getAppConfig(overwrite?: boolean) {
    if(this.appConfig && !overwrite) return this.appConfig;
    if(this.getAppConfigPromise && !overwrite) return this.getAppConfigPromise;
    const promise: Promise<MTAppConfig> = this.getAppConfigPromise = this.invokeApi('help.getAppConfig').then((config: MTAppConfig) => {
      if(this.getAppConfigPromise !== promise) {
        return this.getAppConfigPromise;
      }
      
      this.appConfig = config;
      ignoreRestrictionReasons(config.ignore_restriction_reasons ?? []);
      return config;
    });

    return promise;
  }
}
