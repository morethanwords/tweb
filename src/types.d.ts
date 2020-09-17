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
  payload: any
};

export type Modify<T, R> = Omit<T, keyof R> & R;
