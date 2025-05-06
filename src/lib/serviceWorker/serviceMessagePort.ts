/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {WebPushApiManager} from '../mtproto/webPushApiManager';
import type {PushNotificationObject} from './push';
import type {MyUploadFile} from '../mtproto/apiFileManager';
import type {Document, InputFileLocation, InputGroupCall} from '../../layer';
import type {GroupCallRtmpState} from '../appManagers/appGroupCallsManager';
import type {ActiveAccountNumber} from '../accounts/types';
import type {getEnvironment} from '../../environment/utils';
import type {ToggleUsingPasscodePayload} from '../mtproto/mtprotoMessagePort';
import type {VideoStreamInfo} from '../calls/videoStreamInfo';
import SuperMessagePort from '../mtproto/superMessagePort';
import {MOUNT_CLASS_TO} from '../../config/debug';

export type ServicePushPingTaskPayload = {
  localNotifications: boolean,
  lang: {
    push_action_mute1d: string
    push_action_settings: string
    push_message_nopreview: string
  },
  settings: WebPushApiManager['settings']
};

export type ServiceRequestFilePartTaskPayload = {
  docId: DocId,
  dcId: number,
  offset: number,
  limit: number,
  accountNumber: ActiveAccountNumber
};

export type ServiceRequestRtmpPartTaskPayload = {
  request: InputFileLocation.inputGroupCallStream,
  dcId: number,
  accountNumber: ActiveAccountNumber
};

export type ServiceDownloadTaskPayload = {
  headers: any,
  id: string
};

export type ServiceEvent = {
  port: (payload: void, source: MessageEventSource, event: MessageEvent) => void
};

export default class ServiceMessagePort<Master extends boolean = false> extends SuperMessagePort<{
  // from main thread to service worker
  environment: (environment: ReturnType<typeof getEnvironment>) => void,
  notificationsClear: () => void,
  toggleStorages: (payload: {enabled: boolean, clearWrite: boolean}) => void,
  pushPing: (payload: ServicePushPingTaskPayload, source: MessageEventSource, event: MessageEvent) => void,
  hello: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  shownNotification: (payload: string) => void,
  leaveRtmpCall: (payload: [Long, boolean]) => void,
  toggleStreamInUse: (payload: {url: string, inUse: boolean, accountNumber: ActiveAccountNumber}) => void,
  toggleCacheStorage: (value: boolean) => void,
  toggleUsingPasscode: (payload: ToggleUsingPasscodePayload, source: MessageEventSource) => void,
  saveEncryptionKey: (payload: CryptoKey) => void,

  // from mtproto worker
  download: (payload: ServiceDownloadTaskPayload) => void,
  downloadChunk: (payload: {id: ServiceDownloadTaskPayload['id'], chunk: Uint8Array}) => void
  downloadFinalize: (payload: ServiceDownloadTaskPayload['id']) => void,
  downloadCancel: (payload: ServiceDownloadTaskPayload['id']) => void,
}, {
  // to main thread
  pushClick: (payload: PushNotificationObject) => void,
  hello: (payload: void, source: MessageEventSource) => void,
  share: (payload: ShareData) => void,
  rtmpStreamTime: (payload: {callId: Long, time: string}) => void,
  rtmpStreamDestroyed: (payload: Long) => void,
  downloadRequestReceived: (payload: string) => void,
  serviceCryptoPort: (payload: undefined, source: MessageEventSource, event: MessageEvent) => void,

  // to mtproto worker
  requestFilePart: (payload: ServiceRequestFilePartTaskPayload) => MaybePromise<MyUploadFile>,
  cancelFilePartRequests: (payload: {docId: DocId, accountNumber: ActiveAccountNumber}) => void,
  requestRtmpState: (payload: {call: InputGroupCall, accountNumber: ActiveAccountNumber}) => MaybePromise<GroupCallRtmpState>,
  requestRtmpPart: (payload: ServiceRequestRtmpPartTaskPayload) => MaybePromise<VideoStreamInfo>,
  downloadDoc: (payload: {docId: DocId, accountNumber: ActiveAccountNumber}) => MaybePromise<Blob>,
  requestDoc: (payload: {docId: DocId, accountNumber: ActiveAccountNumber}) => MaybePromise<Document.document>,
  requestAltDocsByDoc: (payload: {docId: DocId, accountNumber: ActiveAccountNumber}) => MaybePromise<Document.document[]>,
} & ServiceEvent, Master> {
  constructor() {
    super('SERVICE');

    MOUNT_CLASS_TO && (MOUNT_CLASS_TO.serviceMessagePort = this);
  }
}
