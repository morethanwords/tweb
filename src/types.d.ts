import type { ApiError } from "./lib/mtproto/apiManager";

export type InvokeApiOptions = Partial<{
  dcID: number,
  timeout: number,
  noErrorBox: boolean,
  fileUpload: boolean,
  ignoreErrors: boolean,
  fileDownload: boolean,
  createNetworker: boolean,
  singleInRequest: boolean,
  startMaxLength: number,

  afterMessageID: string,
  resultType: boolean,
  
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