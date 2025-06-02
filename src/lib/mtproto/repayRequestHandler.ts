import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import safeAssign from '../../helpers/object/safeAssign';
import {MethodDeclMap} from '../../layer';

import type {RootScope} from '../rootScope';

import MTProtoMessagePort from './mtprotoMessagePort';
import type {ApiManager} from './apiManager';


const INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX = 'ALLOW_PAYMENT_REQUIRED_';
// const INSUFFICIENT_STARS_FOR_MESSAGE_TIMEOUT = 20e3; // In case the user doesn't resend the messages

type InvokeApiParams = MethodDeclMap[keyof MethodDeclMap]['req'];
type InvokeApiArgs = Parameters<ApiManager['invokeApi']>;

type ConstructorArgs = {
  apiManager: ApiManager;
  rootScope: RootScope;
};

type HandleErrorArgs = {
  error: ApiError;
  invokeApiArgs: InvokeApiArgs;
};

type ConfirmationPromiseResult = {
  starsAmount: number; // The stars amount for just one message
};


export default class RepayRequestHandler {
  private apiManager: ApiManager;
  private rootScope: RootScope;

  private deferredRequestsSeed = 0;
  private deferredRequests = new Map<number, CancellablePromise<ConfirmationPromiseResult>>();

  constructor(args: ConstructorArgs) {
    safeAssign(this, args);
  }

  private getMessageCount(params: InvokeApiParams) {
    // In case of forwarding a few messages
    if('random_id' in params && params.random_id instanceof Array) return params.random_id.length;

    // When sending one message with multiple media
    if('multi_media' in params && params.multi_media instanceof Array) return params.multi_media.length;

    return 1;
  }

  public canHandleError(error: ApiError) {
    return error.code === 403 && error.type?.startsWith(INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX);
  }

  public handleError({error, invokeApiArgs}: HandleErrorArgs) {
    if(!this.canHandleError(error)) throw error;

    const [method, params, options] = invokeApiArgs;

    const requiredStars = +error.type.replace(INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX, '');
    if(isNaN(requiredStars)) throw error; // return false;

    const requestId = ++this.deferredRequestsSeed;
    const waitingConfirmationPromise = deferredPromise<ConfirmationPromiseResult>();

    const messageCount = this.getMessageCount(params)
    this.deferredRequests.set(requestId, waitingConfirmationPromise);

    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] catching too many stars',
      payload: {
        requiredStars,
        requestId,
        invokeApiArgs
      }
    });

    this.rootScope.dispatchEvent('insufficent_stars_for_message', {
      messageCount,
      requestId,
      invokeApiArgs
    });

    // const timeout = self.setTimeout(() => {
    //   waitingConfirmationPromise.reject();
    // }, INSUFFICIENT_STARS_FOR_MESSAGE_TIMEOUT);

    const result = waitingConfirmationPromise
    .finally(() => {
      // self.clearTimeout(timeout);
      this.deferredRequests.delete(requestId);
    })
    .then(({starsAmount}) => {
      // We want to make sure we use the starsAmount from the moment of confirmation rather
      // than the one that was returned by the server, as it might change a few times before this

      const newParams = {...params, allow_paid_stars: messageCount * starsAmount};

      MTProtoMessagePort.getInstance<false>().invoke('log', {
        message: '[my-debug] requesting again',
        payload: {
          requiredStars,
          requestId,
          invokeApiArgs: [method, newParams, options]
        }
      })
      return this.apiManager.invokeApi(method, newParams, options);
    }, () => {
      // Throw the original error if the repay request was canceled for some reason
      throw error;
    });

    return result;
  }

  public confirmRepayRequest(requestId: number, starsAmount: number) {
    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] ApiManager.confirmRepayRequest',
      requestId
    });

    const deferredPromise = this.deferredRequests.get(requestId);

    deferredPromise.resolve({starsAmount});
  }

  public cancelRepayRequest(requestId: number) {
    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] ApiManager.cancelRepayRequest',
      requestId
    });

    const deferredPromise = this.deferredRequests.get(requestId);
    this.deferredRequests.delete(requestId);

    deferredPromise.reject();
  }
}
