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
