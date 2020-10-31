import { AuthSentCode } from "./layer";
import type { ApiError } from "./lib/mtproto/apiManager";

export type InvokeApiOptions = Partial<{
  dcID: number,
  floodMaxTimeout: number,
  noErrorBox: true,
  fileUpload: true,
  ignoreErrors: true,
  fileDownload: true,
  createNetworker: true,
  singleInRequest: true,
  startMaxLength: number,

  prepareTempMessageID: string,
  afterMessageID: string,
  resultType: string,
  
  timeout: number,
  waitTime: number,
  stopTime: number,
  rawError: any
}>;

export type WorkerTaskTemplate = {
  type: string,
  id: number,
  payload?: any,
  error?: ApiError
};

export type Modify<T, R> = Omit<T, keyof R> & R;

//export type Parameters<T> = T extends (... args: infer T) => any ? T : never; 

export type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;

export type AuthState = AuthState.signIn | AuthState.authCode | AuthState.password | AuthState.signUp | AuthState.signedIn;
export namespace AuthState {
  export type signIn = {
    _: 'authStateSignIn'
  };

  export type authCode = {
    _: 'authStateAuthCode',
    sentCode: AuthSentCode.authSentCode
  };

  export type password = {
    _: 'authStatePassword'
  };

  export type signUp = {
    _: 'authStateSignUp',
    authCode: {
      phone_number: string,
      phone_code_hash: string
    }
  };

  export type signedIn = {
    _: 'authStateSignedIn'
  };
}