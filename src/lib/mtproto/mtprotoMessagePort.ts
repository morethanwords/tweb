/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';
import type {getEnvironment} from '../../environment/utils';
import type {StoragesResults} from '../appManagers/utils/storages/loadStorages';
import type {LocalStorageProxyTask} from '../localStorage';
import type {MirrorTaskPayload, NotificationBuildTaskPayload, TabState} from './mtprotoworker';
import type toggleStorages from '../../helpers/toggleStorages';
import type {ActiveAccountNumber} from '../accounts/types';
import type {LoadStateResult} from '../appManagers/utils/state/loadState';
import SuperMessagePort from './superMessagePort';

export type MTProtoManagerTaskPayload = {name: string, method: string, args: any[], accountNumber: ActiveAccountNumber};

type CallNotificationPayload = {
  callerId: string | number,
  callId: string | number,
  accountNumber: ActiveAccountNumber
}

type MTProtoBroadcastEvent = {
  event: (payload: {name: string, args: any[], accountNumber: ActiveAccountNumber}, source: MessageEventSource) => void
};

export default class MTProtoMessagePort<Master extends boolean = true> extends SuperMessagePort<{
  environment: (environment: ReturnType<typeof getEnvironment>) => void,
  crypto: (payload: {method: string, args: any[]}) => Promise<any>,
  state: (payload: {accountNumber: ActiveAccountNumber} & LoadStateResult) => void,
  manager: (payload: MTProtoManagerTaskPayload) => any,
  toggleStorages: (payload: {enabled: boolean, clearWrite: boolean}) => ReturnType<typeof toggleStorages>,
  serviceWorkerOnline: (online: boolean) => void,
  serviceWorkerPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  cryptoPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  createObjectURL: (blob: Blob) => string,
  tabState: (payload: TabState, source: MessageEventSource) => void,
  createProxyWorkerURLs: (payload: {originalUrl: string, blob: Blob}) => string[],
  setInterval: (timeout: number) => number,
  clearInterval: (intervalId: number) => void,
  terminate: () => void,
  toggleUsingPasscode: (value: boolean) => void,
  changePasscode: (payload: {hash: Uint8Array, salt: Uint8Array}) => void
} & MTProtoBroadcastEvent, {
  convertWebp: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  convertOpus: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  localStorageProxy: (payload: LocalStorageProxyTask['payload']) => Promise<any>,
  mirror: (payload: MirrorTaskPayload) => void,
  notificationBuild: (payload: NotificationBuildTaskPayload) => void,
  receivedServiceMessagePort: (payload: void) => void,
  log: (payload: any) => void
  tabsUpdated: (payload: TabState[]) => void,
  callNotification: (payload: CallNotificationPayload) => void,
  intervalCallback: (intervalId: number) => void
  // hello: () => void
} & MTProtoBroadcastEvent, Master> {
  private static INSTANCE: MTProtoMessagePort;

  constructor() {
    super('MTPROTO');

    MTProtoMessagePort.INSTANCE = this;

    MOUNT_CLASS_TO && (MOUNT_CLASS_TO.mtprotoMessagePort = this);
  }

  public static getInstance<Master extends boolean>() {
    return this.INSTANCE as MTProtoMessagePort<Master>;
  }
}
