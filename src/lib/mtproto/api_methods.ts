/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from '../../environment/ctx';
import callbackify from '../../helpers/callbackify';
import {ignoreRestrictionReasons} from '../../helpers/restrictions';
import {Config, DataJSON, HelpAppConfig, HelpPeerColors, MethodDeclMap, User} from '../../layer';
import {InvokeApiOptions} from '../../types';
import {AppManager} from '../appManagers/manager';
import rootScope from '../rootScope';
import {MTAppConfig} from './appConfig';
import {UserAuth} from './mtproto_config';
import {MTMessage} from './networker';

type HashResult = {
  hash: number,
  result: any
};

type HashOptions = {
  [queryJSON: string]: HashResult
};

export type ApiLimitType = 'pin' | 'folderPin' | 'folders' |
  'favedStickers' | 'reactions' | 'bio' | 'topicPin' | 'caption' |
  'chatlistsJoined' | 'chatlistInvites' | 'channels' | 'links' |
  'gifs' | 'folderPeers' | 'uploadFileParts' | 'recommendedChannels' |
  'savedPin';

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
        result?: any,
        error?: any,
        timeout?: number,
        params: any
      }
    }
  } = {};

  protected config: Config;
  protected appConfig: MTAppConfig;
  protected requestedAppConfig: boolean;

  protected themeParams: DataJSON;

  constructor() {
    super();
    this.afterMessageIdTemp = 0;
  }

  protected after() {
    this.rootScope.addEventListener('managers_ready', async() => {
      const appConfig = await promise;
      this.applyAppConfig(appConfig, false);
    }, {once: true});

    const promise = this.appStateManager.getState().then((state) => {
      return state.appConfig;
    });

    return promise;
  }

  abstract setUserAuth(userAuth: UserAuth | UserId): Promise<void>;

  public setUser(user: User) {
    this.appUsersManager.saveApiUser(user);

    rootScope.dispatchEvent('account_logged_in', {
      accountNumber: this.getAccountNumber(),
      userId: user.id
    });

    return this.setUserAuth(user.id);
  }

  abstract invokeApi<T extends keyof MethodDeclMap>(method: T, params?: MethodDeclMap[T]['req'], options?: InvokeApiOptions): Promise<MethodDeclMap[T]['res']>;

  public invokeApiAfter<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    let o = options;
    o.prepareTempMessageId = '' + ++this.afterMessageIdTemp;

    o = {...options};
    (options as MTMessage).messageId = o.prepareTempMessageId;

    // console.log('will invokeApi:', method, params, options);
    return this.invokeApi(method, params, o);
  }

  public invokeApiHashable<T extends keyof MethodDeclMap, R>(o: {
    method: T,
    processResult?: (response: MethodDeclMap[T]['res']) => R,
    processError?: (error: ApiError) => any,
    params?: Omit<MethodDeclMap[T]['req'], 'hash'>,
    options?: InvokeApiOptions & {cacheKey?: string},
    overwrite?: boolean
  }) {
    // @ts-ignore
    o.params ??= {};
    o.options ??= {};
    // console.log('will invokeApi:', method, params, options);

    const {params, options, method, overwrite} = o;

    const queryJSON = JSON.stringify(params);
    let cached: HashResult;
    if(this.hashes[method]) {
      cached = this.hashes[method][queryJSON];
      if(cached) {
        if(overwrite) {
          delete this.hashes[method][queryJSON];
          cached = undefined;
        } else {
          (params as any).hash = cached.hash;
        }
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
          cached = this.hashes[method][queryJSON] = {
            hash,
            result
          };
        }

        if(o.processResult) {
          const newResult = o.processResult(result);
          return cached ? cached.result = newResult : newResult;
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

  public invokeApiSingleProcess<T extends keyof MethodDeclMap, R = MethodDeclMap[T]['res']>(o: {
    method: T,
    processResult?: (response: MethodDeclMap[T]['res']) => R,
    processError?: (error: ApiError) => any,
    params?: MethodDeclMap[T]['req'],
    options?: InvokeApiOptions & {cacheKey?: string, overwrite?: boolean}
  }): Promise<Awaited<R>> {
    o.params ??= {};
    o.options ??= {};

    const {method, processResult, processError, params, options} = o;
    const cache = this.apiPromisesSingleProcess;
    const cacheKey = options.cacheKey || JSON.stringify(params);
    const map = cache[method] ??= new Map();
    const oldPromise = map.get(cacheKey);
    if(oldPromise) {
      return oldPromise;
    }

    const getNewPromise = () => {
      const promise = map.get(cacheKey);
      return promise === p ? undefined : promise;
    };

    const originalPromise = this.invokeApi(method, params, options);
    const newPromise: Promise<Awaited<R>> = originalPromise.then((result) => {
      return getNewPromise() || (processResult ? processResult(result) : result);
    }, (error) => {
      const promise = getNewPromise();
      if(promise) {
        return promise;
      }

      if(!processError) {
        throw error;
      }

      return processError(error);
    });

    const p = newPromise.finally(() => {
      if(map.get(cacheKey) !== p) {
        return;
      }

      map.delete(cacheKey);
      if(!map.size) {
        delete cache[method];
      }
    });

    map.set(cacheKey, p);
    return p;
  }

  public invokeApiCacheable<
    T extends keyof MethodDeclMap,
    O extends InvokeApiOptions & Partial<{cacheSeconds: number, override: boolean, syncIfHasResult: boolean}>
  >(
    method: T,
    params: MethodDeclMap[T]['req'] = {} as any,
    options: O = {} as any
  ): O['syncIfHasResult'] extends true ? MethodDeclMap[T]['res'] | Promise<MethodDeclMap[T]['res']> : Promise<MethodDeclMap[T]['res']> {
    const cache = this.apiPromisesCacheable[method] ??= {};
    const queryJSON = JSON.stringify(params);
    let item = cache[queryJSON];
    if(item && (!options.override || !item.fulfilled)) {
      if(options.syncIfHasResult) {
        if(item.hasOwnProperty('result')) {
          return item.result;
        } else if(item.hasOwnProperty('error')) {
          throw item.error;
        }
      }

      return item.promise;
    }

    if(options.override) {
      if(item?.timeout) {
        clearTimeout(item.timeout);
        delete item.timeout;
      }

      delete options.override;
    }

    let timeout: number;
    if(options.cacheSeconds) {
      timeout = ctx.setTimeout(() => {
        if(cache[queryJSON] === item) {
          delete cache[queryJSON];
        }
      }, options.cacheSeconds * 1000);
      delete options.cacheSeconds;
    }

    const promise = this.invokeApi(method, params, options);

    const onResult = (result: any) => {
      item.result = result;
    };

    promise.then((result) => {
      item.result = result;
    }, (error) => {
      item.error = error;
    });

    item = cache[queryJSON] = {
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

  public getConfig(overwrite?: boolean) {
    if(this.config && !overwrite) {
      return this.config;
    }

    return this.invokeApiSingleProcess({
      method: 'help.getConfig',
      params: {},
      processResult: (config) => {
        this.config = config;
        this.rootScope.dispatchEvent('config', config);
        return config;
      },
      options: {overwrite}
    });
  }

  private applyAppConfig(appConfig: MTAppConfig, save?: boolean) {
    this.appConfig = appConfig;
    ignoreRestrictionReasons(appConfig.ignore_restriction_reasons ?? []);

    if(save) {
      appConfig.cachedTime = Date.now();
      this.appStateManager.pushToState('appConfig', appConfig);
    }

    this.rootScope.dispatchEvent('app_config', appConfig);
    return appConfig;
  }

  public getAppConfig(overwrite?: boolean) {
    if(
      this.appConfig &&
      !overwrite &&
      (this.requestedAppConfig || (Date.now() - (this.appConfig.cachedTime || 0)) < 86400e3)
    ) {
      return this.appConfig;
    }

    return this.invokeApiSingleProcess({
      method: 'help.getAppConfig',
      params: {
        hash: this.appConfig?.hash || 0
      },
      processResult: async(helpAppConfig) => {
        this.requestedAppConfig = true;
        const config = (helpAppConfig as HelpAppConfig.helpAppConfig).config as any as MTAppConfig || this.appConfig;
        config.hash = (helpAppConfig as HelpAppConfig.helpAppConfig).hash || config.hash;
        return this.applyAppConfig(config, true);
      },
      options: {overwrite}
    });
  }

  public getTimezonesList() {
    return this.invokeApiCacheable('help.getTimezonesList', {hash: 0}, {cacheSeconds: 86400, syncIfHasResult: true});
  }

  public getLimit(type: ApiLimitType, isPremium?: boolean) {
    return callbackify(this.getAppConfig(), (appConfig) => {
      const map: {[type in ApiLimitType]: [keyof MTAppConfig, keyof MTAppConfig] | keyof MTAppConfig} = {
        pin: ['dialogs_pinned_limit_default', 'dialogs_pinned_limit_premium'],
        folderPin: ['dialogs_folder_pinned_limit_default', 'dialogs_folder_pinned_limit_premium'],
        folders: ['dialog_filters_limit_default', 'dialog_filters_limit_premium'],
        favedStickers: ['stickers_faved_limit_default', 'stickers_faved_limit_premium'],
        reactions: ['reactions_user_max_default', 'reactions_user_max_premium'],
        bio: ['about_length_limit_default', 'about_length_limit_premium'],
        topicPin: 'topics_pinned_limit',
        caption: ['caption_length_limit_default', 'caption_length_limit_premium'],
        chatlistInvites: ['chatlist_invites_limit_default', 'chatlist_invites_limit_premium'],
        chatlistsJoined: ['chatlists_joined_limit_default', 'chatlists_joined_limit_premium'],
        channels: ['channels_limit_default', 'channels_limit_premium'],
        links: ['channels_public_limit_default', 'channels_public_limit_premium'],
        gifs: ['saved_gifs_limit_default', 'saved_gifs_limit_premium'],
        folderPeers: ['dialog_filters_chats_limit_default', 'dialog_filters_chats_limit_premium'],
        uploadFileParts: ['upload_max_fileparts_default', 'upload_max_fileparts_premium'],
        recommendedChannels: ['recommended_channels_limit_default', 'recommended_channels_limit_premium'],
        savedPin: ['saved_dialogs_pinned_limit_default', 'saved_dialogs_pinned_limit_premium']
      };

      isPremium ??= this.rootScope.premium;

      const a = map[type];
      const key = Array.isArray(a) ? a[isPremium ? 1 : 0] : a;
      return appConfig[key] as number;
    });
  }

  public getPeerColors() {
    return this.apiManager.invokeApiCacheable('help.getPeerColors', {hash: 0}) as Promise<HelpPeerColors.helpPeerColors>;
  }

  public getPeerProfileColors() {
    return this.apiManager.invokeApiCacheable('help.getPeerProfileColors', {hash: 0}) as Promise<HelpPeerColors.helpPeerColors>;
  }

  public setThemeParams(themeParams: DataJSON) {
    this.themeParams = themeParams;
  }

  public getThemeParams() {
    return this.themeParams;
  }
}
