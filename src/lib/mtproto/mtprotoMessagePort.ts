/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';
import type {getEnvironment} from '../../environment/utils';
import type loadState from '../appManagers/utils/state/loadState';
import type {StoragesResults} from '../appManagers/utils/storages/loadStorages';
import type {LocalStorageProxyTask} from '../localStorage';
import type {Awaited} from '../../types';
import type {Mirrors, MirrorTaskPayload, NotificationBuildTaskPayload, TabState} from './mtprotoworker';
import type toggleStorages from '../../helpers/toggleStorages';
import SuperMessagePort from './superMessagePort';

export type MTProtoManagerTaskPayload = {name: string, method: string, args: any[]};

type MTProtoBroadcastEvent = {
  event: (payload: {name: string, args: any[]}, source: MessageEventSource) => void
};

export default class MTProtoMessagePort<Master extends boolean = true> extends SuperMessagePort<{
  environment: (environment: ReturnType<typeof getEnvironment>) => void,
  crypto: (payload: {method: string, args: any[]}) => Promise<any>,
  state: (payload: {userId: UserId} & Awaited<ReturnType<typeof loadState>> & {storagesResults?: StoragesResults}) => void,
  manager: (payload: MTProtoManagerTaskPayload) => any,
  toggleStorages: (payload: {enabled: boolean, clearWrite: boolean}) => ReturnType<typeof toggleStorages>,
  serviceWorkerOnline: (online: boolean) => void,
  serviceWorkerPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  cryptoPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  createObjectURL: (blob: Blob) => string,
  tabState: (payload: TabState, source: MessageEventSource) => void,
  createProxyWorkerURLs: (payload: {originalUrl: string, blob: Blob}) => string[],
} & MTProtoBroadcastEvent, {
  convertWebp: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  convertOpus: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  localStorageProxy: (payload: LocalStorageProxyTask['payload']) => Promise<any>,
  mirror: (payload: MirrorTaskPayload) => void,
  notificationBuild: (payload: NotificationBuildTaskPayload) => void,
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
