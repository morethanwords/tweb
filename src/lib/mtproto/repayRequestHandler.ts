import {ConfirmedPaymentResult} from '../../components/chat/paidMessagesInterceptor';
import assumeType from '../../helpers/assumeType';
import safeAssign from '../../helpers/object/safeAssign';
import {MethodDeclMap} from '../../layer';

import {MessageSendingParams} from '../appManagers/appMessagesManager';
import type {RootScope} from '../rootScope';

import type {ApiManager} from './apiManager';
import MTProtoMessagePort from './mtprotoMessagePort';


const INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX = 'ALLOW_PAYMENT_REQUIRED_';
// const INSUFFICIENT_STARS_FOR_MESSAGE_TIMEOUT = 20e3; // In case the user doesn't resend the messages

type InvokeApiParams = MethodDeclMap[keyof MethodDeclMap]['req'];
type InvokeApiArgs = Parameters<ApiManager['invokeApi']>;

type ConstructorArgs = {
  rootScope: RootScope;
};

type HandleErrorArgs = {
  error: ApiError;
  messageCount: number;
  repayCallback: RepayRequestCallback;
  paidStars: number;
};

type ConfirmationPromiseResult = {
  starsAmount: number; // The stars amount for just one message
};

export type RepayRequest = {
  id: number;
  messageCount: number;
};

type RepayRequestCallback = (args: Pick<MessageSendingParams, 'confirmedPaymentResult'>) => void;

type ApiErrorWithInvokeArgs = ApiError & {
  invokeApiArgs: InvokeApiArgs;
};

export default class RepayRequestHandler {
  private rootScope: RootScope;

  private repayRequestsSeed = 0;
  private repayRequests = new Map<number, RepayRequestCallback>();

  constructor(args: ConstructorArgs) {
    safeAssign(this, args);
  }

  public static canHandleError(error: ApiError) {
    return error.code === 403 && error.type?.startsWith(INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX);
  }

  public static attachInvokeArgsToError(error: ApiError, invokeApiArgs: InvokeApiArgs): ApiErrorWithInvokeArgs  {
    return {
      ...error,
      invokeApiArgs: invokeApiArgs
    };
  }

  public tryRegisterRequest({error, messageCount, repayCallback, paidStars}: HandleErrorArgs) {
    assumeType<ApiErrorWithInvokeArgs>(error);

    if(!RepayRequestHandler.canHandleError(error) || !error.invokeApiArgs) return;

    const requiredStars = +error.type.replace(INSUFFICIENT_STARS_FOR_MESSAGE_PREFIX, '');
    if(isNaN(requiredStars)) return;

    const requestId = ++this.repayRequestsSeed;
    this.repayRequests.set(requestId, repayCallback);

    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] catching too many stars',
      payload: {
        requiredStars,
        requestId,
        messageCount
      }
    });

    this.rootScope.dispatchEvent('insufficent_stars_for_message', {
      messageCount,
      requestId,
      invokeApiArgs: error.invokeApiArgs,
      paidStars
    });

    return {
      id: requestId,
      messageCount
    };
  }

  private removeRepayRequest(requestId: number) {
    this.repayRequests.delete(requestId) &&
    this.rootScope.dispatchEvent('fulfill_repaid_message', {requestId});
  }

  public confirmRepayRequest(requestId: number, confirmedPaymentResult: ConfirmedPaymentResult) {
    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] ApiManager.confirmRepayRequest',
      requestId
    });

    const repayCallback = this.repayRequests.get(requestId);
    this.removeRepayRequest(requestId);

    repayCallback?.({confirmedPaymentResult});
  }

  public cancelRepayRequest(requestId: number) {
    MTProtoMessagePort.getInstance<false>().invoke('log', {
      message: '[my-debug] ApiManager.cancelRepayRequest',
      requestId
    });

    this.removeRepayRequest(requestId);
  }
}
