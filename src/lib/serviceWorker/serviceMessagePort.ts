/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {WebPushApiManager} from '../mtproto/webPushApiManager';
import type {PushNotificationObject} from './push';
import type {MyUploadFile} from '../mtproto/apiFileManager';
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
  limit: number
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
  notificationsClear: () => void,
  toggleStorages: (payload: {enabled: boolean, clearWrite: boolean}) => void,
  pushPing: (payload: ServicePushPingTaskPayload, source: MessageEventSource, event: MessageEvent) => void,
  hello: (payload: void, source: MessageEventSource, event: MessageEvent) => void,
  shownNotification: (payload: string) => void,

  // from mtproto worker
  download: (payload: ServiceDownloadTaskPayload) => void,
  downloadChunk: (payload: {id: ServiceDownloadTaskPayload['id'], chunk: Uint8Array}) => void
  downloadFinalize: (payload: ServiceDownloadTaskPayload['id']) => void,
  downloadCancel: (payload: ServiceDownloadTaskPayload['id']) => void
}, {
  // to main thread
  pushClick: (payload: PushNotificationObject) => void,
  hello: (payload: void, source: MessageEventSource) => void,
  share: (payload: ShareData) => void,

  // to mtproto worker
  requestFilePart: (payload: ServiceRequestFilePartTaskPayload) => Promise<MyUploadFile> | MyUploadFile
} & ServiceEvent, Master> {
  constructor() {
    super('SERVICE');

    MOUNT_CLASS_TO && (MOUNT_CLASS_TO.serviceMessagePort = this);
  }
}
