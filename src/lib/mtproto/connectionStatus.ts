/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export enum ConnectionStatus {
  Connected,
  Connecting,
  Closed,
  TimedOut
};

export type ConnectionStatusChange = {
  _: 'networkerStatus',
  status: ConnectionStatus,
  dcId: number,
  name: string,
  isFileNetworker: boolean,
  isFileDownload: boolean,
  isFileUpload: boolean,
  retryAt?: number
};
