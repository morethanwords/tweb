import {MOUNT_CLASS_TO} from '@config/debug';
import type {getEnvironment} from '@environment/utils';
import type {LocalStorageEncryptedProxyTaskPayload, LocalStorageProxyTask} from '@lib/localStorage';
import type {MirrorTaskPayload, NotificationBuildTaskPayload, TabState} from '@lib/apiManagerProxy';
import type toggleStorages from '@helpers/toggleStorages';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import type {LoadStateResult} from '@appManagers/utils/state/loadState';
import type {PasscodeStorageValue} from '@lib/commonStateStorage';
import type {ThreadedWorkerType} from '@lib/threadedWorkerTypes';
import type {LogEntry} from '@lib/debug/logsBuffer';
import SuperMessagePort from '@lib/superMessagePort';
import {CacheStorageDbName} from '@lib/files/cacheStorage';

export type MTProtoManagerTaskPayload = {name: string, method: string, args: any[], accountNumber: ActiveAccountNumber};
export type MTProtoSingleManagerTaskPayload = {name: string, method: string, args: any[]};

type CallNotificationPayload = {
  callerId: string | number,
  callId: string | number,
  accountNumber: ActiveAccountNumber
}

type MTProtoBroadcastEvent = {
  event: (payload: {name: string, args: any[], accountNumber: ActiveAccountNumber}, source: MessageEventSource) => void
};

export type ToggleUsingPasscodePayload = {
  isUsingPasscode: boolean;
  encryptionKey?: CryptoKey;
};

export type ThreadedWorkerEvents = {
  port: (payload: void, source: MessageEventSource, event: MessageEvent) => void
};

export default class MTProtoMessagePort<Master extends boolean = true> extends SuperMessagePort<{
  environment: (environment: ReturnType<typeof getEnvironment>) => void,
  crypto: (payload: {method: string, args: any[]}) => Promise<any>,
  state: (payload: {accountNumber: ActiveAccountNumber} & LoadStateResult) => void,
  manager: (payload: MTProtoManagerTaskPayload) => any,
  singleManager: (payload: MTProtoSingleManagerTaskPayload) => any,
  toggleStorages: (payload: {enabled: boolean, clearWrite: boolean}) => ReturnType<typeof toggleStorages>,
  serviceWorkerOnline: (online: boolean) => void,
  serviceWorkerPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  threadedPort: (payload: ThreadedWorkerType, source: MessageEventSource, event: MessageEvent) => void,
  createObjectURL: (blob: Blob) => string,
  tabState: (payload: TabState, source: MessageEventSource) => void,
  createProxyWorkerURLs: (payload: {originalUrl: string, blob: Blob, type: ThreadedWorkerType}) => string[],
  setInterval: (timeout: number) => number,
  clearInterval: (intervalId: number) => void,
  terminate: () => void,
  toggleUsingPasscode: (payload: ToggleUsingPasscodePayload, source: MessageEventSource) => void,
  changePasscode: (payload: {toStore: PasscodeStorageValue, encryptionKey: CryptoKey}, source: MessageEventSource) => void,
  saveEncryptionKey: (payload: CryptoKey, source: MessageEventSource) => void,
  isLocked: (payload: void, source: MessageEventSource) => Promise<boolean>,
  toggleLockOthers: (isLocked: boolean, source: MessageEventSource) => void
  localStorageEncryptedProxy: (payload: LocalStorageEncryptedProxyTaskPayload) => Promise<any>,
  toggleCacheStorage: (value: boolean, source: MessageEventSource) => void,
  resetEncryptableCacheStorages: () => void,
  forceLogout: () => void,
  toggleUninteruptableActivity: (payload: { activity: string, active: boolean }, source: MessageEventSource) => void,
  disableCacheStoragesByNames: (names: CacheStorageDbName[]) => void,
  enableCacheStoragesByNames: (names: CacheStorageDbName[]) => void,
  resetOpenCacheStoragesByNames: (names: CacheStorageDbName[]) => void,
  // Debug log buffer (see @lib/debug/logsBuffer): the master pulls the worker's
  // ring buffer on export, and propagates the enabled flag (prod ?debug=1 isn't
  // visible to the worker's own location.search).
  getLogs: (payload: void) => LogEntry[],
  setLogBufferEnabled: (enabled: boolean) => void
} & MTProtoBroadcastEvent, {
  convertWebp: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  convertOpus: (payload: {fileName: string, bytes: Uint8Array}) => Promise<Uint8Array>,
  localStorageProxy: (payload: LocalStorageProxyTask['payload']) => Promise<any>,
  mirror: (payload: MirrorTaskPayload) => void,
  notificationBuild: (payload: NotificationBuildTaskPayload) => void,
  receivedServiceMessagePort: (payload: void) => void,
  log: (payload: any) => void,
  tabsUpdated: (payload: TabState[]) => void,
  callNotification: (payload: CallNotificationPayload) => void,
  intervalCallback: (intervalId: number) => void,
  toggleLock: (isLocked: boolean) => void,
  saveEncryptionKey: (payload: CryptoKey, source: MessageEventSource) => void,
  toggleCacheStorage: (value: boolean, source: MessageEventSource) => void,
  toggleUsingPasscode: (payload: ToggleUsingPasscodePayload, source: MessageEventSource) => void,
} & MTProtoBroadcastEvent, Master> {
  private static INSTANCE: MTProtoMessagePort;
  // In Modes.noWorker, both the proxy (master) and the worker-side port live
  // in the same realm; the legacy INSTANCE field would only hold the last one
  // constructed. These two track both so getMasterInstance/getNonMasterInstance
  // resolve to the right end of the in-process channel.
  private static MASTER_INSTANCE: MTProtoMessagePort<true>;
  private static NON_MASTER_INSTANCE: MTProtoMessagePort<false>;

  constructor(isMaster: boolean = true) {
    super('MTPROTO');

    MTProtoMessagePort.INSTANCE = this;
    if(isMaster) MTProtoMessagePort.MASTER_INSTANCE = this as any;
    else MTProtoMessagePort.NON_MASTER_INSTANCE = this as any;

    MOUNT_CLASS_TO && (MOUNT_CLASS_TO.mtprotoMessagePort = this);
  }

  public static getInstance<Master extends boolean>() {
    return this.INSTANCE as MTProtoMessagePort<Master>;
  }

  public static getMasterInstance() {
    return this.MASTER_INSTANCE;
  }

  public static getNonMasterInstance() {
    return this.NON_MASTER_INSTANCE;
  }
}
