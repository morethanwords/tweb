/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {TLDeserialization, TLSerialization} from './tl_utils';
import CryptoWorker from '../crypto/cryptoMessagePort';
import sessionStorage from '../sessionStorage';
import Schema from './schema';
import {NetworkerFactory} from './networkerFactory';
import {logger, LogTypes} from '../logger';
import {InvokeApiOptions} from '../../types';
import longToBytes from '../../helpers/long/longToBytes';
import MTTransport from './transports/transport';
import {nextRandomUint, randomLong} from '../../helpers/random';
import App from '../../config/app';
import DEBUG from '../../config/debug';
import Modes from '../../config/modes';
import noop from '../../helpers/noop';
import HTTP from './transports/http';
import type TcpObfuscated from './transports/tcpObfuscated';
import bigInt from 'big-integer';
import {ConnectionStatus} from './connectionStatus';
import ctx from '../../environment/ctx';
import bufferConcats from '../../helpers/bytes/bufferConcats';
import bytesCmp from '../../helpers/bytes/bytesCmp';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import isObject from '../../helpers/object/isObject';
import forEachReverse from '../../helpers/array/forEachReverse';
import sortLongsArray from '../../helpers/long/sortLongsArray';
import randomize from '../../helpers/array/randomize';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import pause from '../../helpers/schedulers/pause';
import {getEnvironment} from '../../environment/utils';
import {TimeManager} from './timeManager';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {ActiveAccountNumber} from '../accounts/types';
import AccountController from '../accounts/accountController';
import makeError from '../../helpers/makeError';

// console.error('networker included!', new Error().stack);

export type MTMessageOptions = InvokeApiOptions & Partial<{
  noResponse: boolean, // http_wait
  longPoll: boolean,

  canCleanup: boolean,
  notContentRelated: boolean, // https://core.telegram.org/mtproto/description#content-related-message
  noSchedule: boolean,
  // withResult: boolean,
  messageId: MTLong,

  resending: Set<MTLong>
}>;

export type MTMessage = InvokeApiOptions & MTMessageOptions & {
  msg_id: MTLong,
  seq_no: number,
  body?: Uint8Array | number[],
  isAPI?: boolean,
  // only these four are important

  acked?: boolean,

  deferred?: CancellablePromise<void>,

  container?: boolean,
  inner?: MTLong[],
  resending?: Set<MTLong>,

  humanReadable?: string,
  // sentTime?: number,

  // below - options

  notContentRelated?: boolean,
  noSchedule?: boolean,

  resultType?: string,

  longPoll?: boolean,
  noResponse?: boolean, // only with http (http_wait for longPoll)
};

// const TEST_RESEND_RPC: string = 'upload.file';
const TEST_RESEND_RPC: string = undefined;
let TESTING_RESENDING_RPC = !!TEST_RESEND_RPC;
const TEST_NO_ACKS = false;
const TEST_HTTP_DROPPING_REQUESTS = import.meta.env.VITE_MTPROTO_HAS_HTTP && false;
const HTTP_POLLING_NEEDED_FOR_FILES = true;
const CHECK_CONNECTION_MAX_PERIOD = TEST_HTTP_DROPPING_REQUESTS ? 0 : 15;

const DRAIN_TIMEOUT = 10000;
const delays: {
  [k in 'client' | 'file']: {
    disconnectDelayMin: number,
    disconnectDelayMax: number,
    pingInterval: number,
    pingMaxTime: number,
    connectionTimeout: number
  }
} = {
  client: {
    disconnectDelayMin: 7,
    disconnectDelayMax: 20,
    pingInterval: 2000,
    pingMaxTime: 5,
    connectionTimeout: 5000
  },
  file: {
    disconnectDelayMin: 10,
    disconnectDelayMax: 24,
    pingInterval: 3000,
    pingMaxTime: 7,
    connectionTimeout: 7500
  }
};
// * don't clean these messages in `cleanupSent`,
// * can ask the server to resend the response
const RESEND_OPTIONS: MTMessageOptions = {notContentRelated: true, noSchedule: true};
const HTTP_WAIT_OPTIONS: MTMessageOptions = {notContentRelated: true, canCleanup: true, longPoll: true};
let invokeAfterMsgConstructor: number;
let networkerTempId = 0;

export default class MTPNetworker {
  private authKeyUint8: Uint8Array;

  public isFileNetworker: boolean;
  private isFileUpload: boolean;
  private isFileDownload: boolean;

  private lastServerMessages: Set<MTLong> = new Set();

  private sentMessages: {
    [msgId: MTLong]: MTMessage
  } = {};

  private pendingMessages: {[msgId: MTLong]: number} = {};
  private pendingAcks: Array<MTLong> = [];
  private pendingResendReq: MTLong[] = [];
  // private pendingResendAnsReq: MTLong[] = [];
  private sentResendReq: Map<MTLong, MTMessage> = new Map(); // * server answer message id -> msg_resend_req message
  public connectionInited: boolean;

  private nextReqTimeout: number;
  private nextReq: number = 0;

  // HTTP-only
  private longPollInterval: number;
  private longPollPending: number;
  private checkConnectionRetryAt: number;
  private checkConnectionTimeout: number;
  private checkConnectionPeriod = 0;
  private sleepAfter: number;
  private offline = false;
  private sendingLongPoll: boolean;

  private seqNo: number;
  private prevSessionId: Uint8Array;
  private sessionId: Uint8Array;
  private serverSalt: Uint8Array;

  private lastResendReq: {
    reqMsgId: MTLong,
    msgIds: MTPNetworker['pendingResendReq']
  };
  // private lastResendAnsReq: MTPNetworker['lastResendReq'];

  private name: string;
  private log: ReturnType<typeof logger>;

  public isOnline = false;
  private status: ConnectionStatus = ConnectionStatus.Closed;
  private lastResponseTime = 0;

  private debug = Modes.debug;

  public activeRequests = 0;

  public onDrain: () => void;
  private onDrainTimeout: number;

  public transport: MTTransport;

  // WS-only
  private pingDelayDisconnectDeferred: CancellablePromise<string>;
  // private pingPromise: Promise<void>;
  // private pingInterval: number;
  private lastPingTime: number;
  // private lastPingRealTime: number;
  private lastPingStartTime: number;
  private lastPingDelayDisconnectId: string;

  // public onConnectionStatusChange: (online: boolean) => void;

  // private debugRequests: Array<{before: Uint8Array, after: Uint8Array}> = [];

  private delays: typeof delays[keyof typeof delays];
  // private getNewTimeOffset: boolean;

  constructor(
    private networkerFactory: NetworkerFactory,
    private timeManager: TimeManager,
    public dcId: number,
    private authKey: Uint8Array,
    private authKeyId: Uint8Array,
    serverSalt: Uint8Array,
    private accountNumber: ActiveAccountNumber,
    options: InvokeApiOptions = {}
  ) {
    this.authKeyUint8 = convertToUint8Array(this.authKey);
    this.serverSalt = convertToUint8Array(serverSalt);

    this.isFileUpload = !!options.fileUpload;
    this.isFileDownload = !!options.fileDownload;
    this.isFileNetworker = this.isFileUpload || this.isFileDownload;
    this.delays = this.isFileNetworker ? delays.file : delays.client;

    const suffix = this.isFileUpload ? '-U' : this.isFileDownload ? '-D' : '';
    this.name = 'NET-' + dcId + suffix;
    // this.log = logger(this.name, this.upload && this.dcId === 2 ? LogLevels.debug | LogLevels.warn | LogLevels.log | LogLevels.error : LogLevels.error);
    this.log = logger(
      this.name + (suffix ? '' : '-C') + '-' + networkerTempId++,
      LogTypes.Log | LogTypes.Error | LogTypes.Warn | (this.debug ? LogTypes.Debug : 0)
    );
    this.log('constructor'/* , this.authKey, this.authKeyID, this.serverSalt */);

    // Test resend after bad_server_salt
    /* if(this.dcId === 2 && this.upload) {
      //timeManager.applyServerTime((Date.now() / 1000 - 86400) | 0);
      this.serverSalt[0] = 0;
    } */

    this.updateSession();

    // if(!NetworkerFactory.offlineInited) {
    //   NetworkerFactory.offlineInited = true;
    //   /* rootScope.offline = true
    //   rootScope.offlineConnecting = true */
    // }
  }

  private updateSession() {
    this.seqNo = 0;
    this.prevSessionId = this.sessionId;
    this.sessionId = randomize(new Uint8Array(8));
  }

  private updateSentMessage(sentMessageId: MTLong) {
    const log = this.log.bindPrefix('updateSentMessage');
    const sentMessage = this.sentMessages[sentMessageId];
    if(!sentMessage) {
      log.error('no sentMessage', sentMessageId);
      return false;
    }

    log('updating', sentMessage);

    delete this.sentMessages[sentMessageId];

    if(sentMessage.container) {
      let deleted = false;
      forEachReverse(sentMessage.inner, (innerSentMessageId, idx) => {
        const innerSentMessage = this.updateSentMessage(innerSentMessageId);
        if(!innerSentMessage) {
          sentMessage.inner.splice(idx, 1);
          deleted = true;
        } else {
          sentMessage.inner[idx] = innerSentMessage.msg_id;
        }
      });

      if(deleted && !sentMessage.inner.length) {
        log('deleted container', sentMessage);
        return;
      }
    }

    sentMessage.msg_id = this.timeManager.generateId();
    sentMessage.seq_no = this.generateSeqNo(sentMessage.notContentRelated);

    log('old and new', sentMessageId, sentMessage.msg_id);

    this.sentMessages[sentMessage.msg_id] = sentMessage;

    return sentMessage;
  }

  private generateSeqNo(notContentRelated?: boolean) {
    let seqNo = this.seqNo * 2;

    if(!notContentRelated) {
      seqNo++;
      this.seqNo++;
    }

    return seqNo;
  }

  public wrapMtpCall(method: string, params: any, options: MTMessageOptions) {
    const serializer = new TLSerialization({mtproto: true});

    serializer.storeMethod(method, params);

    const messageId = this.timeManager.generateId();
    const seqNo = this.generateSeqNo();
    const message: MTMessage = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes(true),
      humanReadable: method
    };

    if(Modes.debug) {
      this.log('MT call', method, params, messageId, seqNo);
    }

    return this.pushMessage(message, options);
  }

  public wrapMtpMessage(object: any, options: MTMessageOptions) {
    const serializer = new TLSerialization({mtproto: true});
    serializer.storeObject(object, 'Object');

    const messageId = this.timeManager.generateId();
    const seqNo = this.generateSeqNo(options.notContentRelated);
    const message: MTMessage = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes(true),
      humanReadable: object._
    };

    if(Modes.debug) {
      this.log('MT message', object, messageId, seqNo);
    }

    return this.pushMessage(message, options);
  }

  public wrapApiCall(method: string, params: any = {}, options: InvokeApiOptions = {}) {
    const log = this.log.bindPrefix('wrapApiCall');
    const serializer = new TLSerialization(options);

    if(!this.connectionInited) { // this will call once for each new session
      log('adding invokeWithLayer');

      const invokeWithLayer = Schema.API.methods.find((m) => m.method === 'invokeWithLayer');
      if(!invokeWithLayer) throw new Error('no invokeWithLayer!');
      serializer.storeInt(+invokeWithLayer.id, 'invokeWithLayer');

      serializer.storeInt(Schema.layer, 'layer');

      const initConnection = Schema.API.methods.find((m) => m.method === 'initConnection');
      if(!initConnection) throw new Error('no initConnection!');

      serializer.storeInt(+initConnection.id, 'initConnection');
      serializer.storeInt(0x0, 'flags');
      serializer.storeInt(App.id, 'api_id');
      serializer.storeString(getEnvironment().USER_AGENT || 'Unknown UserAgent', 'device_model');
      serializer.storeString(navigator.platform || 'Unknown Platform', 'system_version');
      serializer.storeString(App.version + (App.isMainDomain ? ' ' + App.suffix : ''), 'app_version');
      serializer.storeString(navigator.language || 'en', 'system_lang_code');
      serializer.storeString(App.langPack, 'lang_pack');
      serializer.storeString(this.networkerFactory.language, 'lang_code');
      // serializer.storeInt(0x0, 'proxy');
      /* serializer.storeMethod('initConnection', {
        'flags': 0,
        'api_id': App.id,
        'device_model': navigator.userAgent || 'Unknown UserAgent',
        'system_version': navigator.platform || 'Unknown Platform',
        'app_version': App.version,
        'system_lang_code': navigator.language || 'en',
        'lang_pack': '',
        'lang_code': navigator.language || 'en'
      }); */
    }

    if(options.afterMessageId) {
      if(invokeAfterMsgConstructor === undefined) {
        const m = Schema.API.methods.find((m) => m.method === 'invokeAfterMsg');
        invokeAfterMsgConstructor = m ? +m.id : 0;
      }

      if(invokeAfterMsgConstructor) {
        log('store invokeAfterMsg');
        serializer.storeInt(invokeAfterMsgConstructor, 'invokeAfterMsg');
        serializer.storeLong(options.afterMessageId, 'msg_id');
      } else {
        log.error('no invokeAfterMsg');
      }
    }

    options.resultType = serializer.storeMethod(method, params);

    const messageId = this.timeManager.generateId();
    const seqNo = this.generateSeqNo();
    const message: MTMessage = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes(true),
      isAPI: true,
      humanReadable: method
    };

    log('call', method, message, params, options);

    return this.pushMessage(message, options);
  }

  public changeTransport(transport?: MTTransport) {
    const oldTransport = this.transport;
    if(oldTransport) {
      oldTransport.destroy();

      this.clearNextReq();

      this.connectionInited = false;

      if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
        if(this.longPollInterval) {
          clearInterval(this.longPollInterval);
          this.longPollInterval = undefined;
        }

        this.clearCheckConnectionTimeout();
      }
    }

    this.log('change transport', transport, oldTransport);

    if(import.meta.env.VITE_MTPROTO_HAS_WS) {
      this.clearPingDelayDisconnect();

      // if(this.pingInterval !== undefined) {
      //   clearInterval(this.pingInterval);
      //   this.pingInterval = undefined;
      // }

      // this.clearPing();
    }

    this.transport = transport;
    if(!transport) {
      return;
    }

    transport.networker = this;

    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      if(!import.meta.env.VITE_MTPROTO_HAS_WS || transport instanceof HTTP) {
        if(!this.isFileNetworker || HTTP_POLLING_NEEDED_FOR_FILES) {
          this.longPollInterval = ctx.setInterval(this.checkLongPoll, 10000);
          this.checkLongPoll();
        }

        this.checkConnection('changed transport');
      }
    }

    if(import.meta.env.VITE_MTPROTO_HAS_WS) {
      // * handle outcoming dead socket, server will close the connection
      if((transport as TcpObfuscated).connection) {
        // this.sendPingDelayDisconnect();

        if(transport.connected) {
          this.setConnectionStatus(ConnectionStatus.Connected);
        }

        // this.pingInterval = ctx.setInterval(this.sendPing, PING_INTERVAL);
        // this.sendPing();
      }
    }

    this.resend();
  }

  public destroy() {
    this.log('destroy');
  }

  public forceReconnectTimeout() {
    if((this.transport as TcpObfuscated).reconnect) {
      (this.transport as TcpObfuscated).reconnect();
    } else {
      this.resend();
    }
  }

  public forceReconnect() {
    if((this.transport as TcpObfuscated).forceReconnect) {
      (this.transport as TcpObfuscated).forceReconnect();
    } else {
      this.checkConnection('force reconnect');
    }
  }

  /* private clearPing() {
    if(this.pingPromise) {
      this.pingPromise = undefined;
    }

    this.lastPingTime = undefined;
  }

  private sendPing = () => {
    // return;

    // if(!(this.transport as TcpObfuscated).connected) {
    //   this.clearPing();
    //   return;
    // }

    if(this.pingPromise) {
      return;
    }

    const startTime = Date.now();
    this.log('sendPing: ping', startTime);
    const promise = this.pingPromise = this.wrapMtpCall('ping', {
      ping_id: randomLong()
    }, {
      notContentRelated: true
    }).then(() => {
      const elapsedTime = Date.now() - startTime;
      this.lastPingTime = elapsedTime / 1000;
      this.log('sendPing: pong', elapsedTime);

      setTimeout(() => {
        if(this.pingPromise !== promise) {
          return;
        }

        this.pingPromise = undefined;
        this.sendPing();
      }, Math.max(0, PING_INTERVAL - elapsedTime));
    });
  }; */

  private clearPingDelayDisconnect() {
    const deferred = this.pingDelayDisconnectDeferred;
    this.pingDelayDisconnectDeferred = undefined;
    this.lastPingDelayDisconnectId = undefined;

    if(deferred) {
      deferred.reject();
    }
  }

  public sendPingDelayDisconnect = () => {
    // return;

    if(
      this.pingDelayDisconnectDeferred ||
      !this.transport ||
      !this.transport.connected ||
      this.isStopped()
    ) return;

    /* if(!this.isOnline) {
      if((this.transport as TcpObfuscated).connected) {
        (this.transport as TcpObfuscated).connection.close();
      }

      return;
    } */

    const deferred = this.pingDelayDisconnectDeferred = deferredPromise();
    const delays = this.delays;
    const pingMaxTime = this.delays.pingMaxTime;
    const lastPingTime = Math.min(this.lastPingTime ?? 0, pingMaxTime);
    const disconnectDelay = Math.round(delays.disconnectDelayMin + lastPingTime / pingMaxTime * (delays.disconnectDelayMax - delays.disconnectDelayMin));
    const timeoutTime = disconnectDelay * 1000;
    const startTime = this.lastPingStartTime = Date.now();
    const pingId = this.lastPingDelayDisconnectId = randomLong();
    const options: MTMessageOptions = {notContentRelated: true, canCleanup: true};
    this.wrapMtpCall('ping_delay_disconnect', {
      ping_id: pingId,
      disconnect_delay: disconnectDelay
    }, options);

    const log = this.log.bindPrefix('sendPingDelayDisconnect');
    log.debug(`ping, timeout=${timeoutTime}, lastPingTime=${this.lastPingTime}, msgId=${options.messageId}, pingId=${pingId}`);
    const rejectTimeout = ctx.setTimeout(deferred.reject.bind(deferred), timeoutTime);

    const onResolved = (reason: string) => {
      clearTimeout(rejectTimeout);
      const elapsedTime = Date.now() - startTime;
      this.lastPingTime = elapsedTime / 1000;
      log.debug(`pong, reason='${reason}', time=${lastPingTime}, msgId=${options.messageId}`);
      if(elapsedTime > timeoutTime) {
        throw undefined;
      } else {
        return pause(Math.max(0, this.delays.pingInterval - elapsedTime/* timeoutTime - elapsedTime - PING_INTERVAL */));
      }
    };

    const onTimeout = () => {
      clearTimeout(rejectTimeout);
      const transport = this.transport as TcpObfuscated;
      if(
        this.pingDelayDisconnectDeferred !== deferred ||
        !transport?.connection ||
        this.isStopped()
      ) {
        return;
      }

      log.error('catch, closing connection', this.lastPingTime, options.messageId);
      transport.connection.close();
    };

    const onFinally = () => {
      if(this.pingDelayDisconnectDeferred !== deferred) {
        return;
      }

      this.pingDelayDisconnectDeferred = undefined;
      this.sendPingDelayDisconnect();
    };

    deferred
    .then(onResolved)
    .catch(onTimeout)
    .finally(onFinally);
  };

  private checkLongPoll = () => {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    if(this.isFileNetworker && !HTTP_POLLING_NEEDED_FOR_FILES) {
      return;
    }

    const log = this.log.bindPrefix('checkLongPoll');

    if(
      this.offline ||
      (this.longPollPending && Date.now() < this.longPollPending) ||
      this.isStopped()
    ) {
      log('no lp this time');
      return;
    }

    log('check', this.longPollPending);

    const isClean = this.cleanupSent();
    this.getBaseDcId().then((baseDcId) => {
      if(isClean && (
        baseDcId !== this.dcId ||
          (this.sleepAfter && Date.now() > this.sleepAfter)
      )) {
        log.warn('send long-poll for DC is delayed', this.sleepAfter);
        return;
      }

      this.sendLongPoll();
    });
  };

  private sendLongPoll() {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    const log = this.log.bindPrefix('sendLongPoll');
    if(this.sendingLongPoll) {
      log('already sending');
      return;
    }

    this.sendingLongPoll = true;
    const maxWait = 25000;

    this.longPollPending = Date.now() + maxWait;
    log('send', this.longPollPending);

    this.wrapMtpCall('http_wait', {
      max_delay: 500,
      wait_after: 150,
      max_wait: maxWait
    }, {
      ...HTTP_WAIT_OPTIONS,
      noResponse: true
    }).then(() => {
      log('success');
      this.longPollPending = undefined;
      setTimeout(this.checkLongPoll, 0);
    }, (error: ErrorEvent) => {
      log('failed', error);
    }).finally(() => {
      this.sendingLongPoll = undefined;
    });
  }

  private checkConnection = (event: Event | string) => {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    const log = this.log.bindPrefix('checkConnection');

    log('check connection', event);
    this.clearCheckConnectionTimeout();

    if(!this.transport) {
      log.warn('no transport for checkConnection');
      return;
    }

    const serializer = new TLSerialization({mtproto: true});
    const pingId = randomLong();

    serializer.storeMethod('ping', {
      ping_id: pingId
    });

    const pingMessage = {
      msg_id: this.timeManager.generateId(),
      seq_no: this.generateSeqNo(true),
      body: serializer.getBytes(true)
    };

    if(this.offline) {
      this.setConnectionStatus(ConnectionStatus.Connecting);
    }

    this.sendEncryptedRequest(pingMessage).then(() => {
      log('got ping');
      this.toggleOffline(false);
    }, () => {
      log('still error, delay', this.checkConnectionPeriod * 1000);
      this.checkConnectionTimeout = ctx.setTimeout(() => this.checkConnection('from failed checkConnection request'), this.checkConnectionPeriod * 1000 | 0);
      this.checkConnectionPeriod = Math.min(CHECK_CONNECTION_MAX_PERIOD, this.checkConnectionPeriod * 1.5);
    });
  };

  private clearCheckConnectionTimeout() {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    if(this.checkConnectionTimeout) {
      clearTimeout(this.checkConnectionTimeout);
      this.checkConnectionTimeout = undefined;
    }
  }

  private toggleOffline(offline: boolean) {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }

    if(this.offline !== offline) {
      this.offline = offline;

      this.clearCheckConnectionTimeout();
      if(offline) {
        this.clearNextReq();

        if(this.checkConnectionPeriod < 1.5) {
          this.checkConnectionPeriod = 0;
        }

        const delay = this.checkConnectionPeriod * 1000 | 0;
        this.checkConnectionRetryAt = Date.now() + delay;
        this.setConnectionStatus(ConnectionStatus.Closed, this.checkConnectionRetryAt);
        this.checkConnectionTimeout = ctx.setTimeout(() => this.checkConnection('from toggleOffline'), delay);
        this.checkConnectionPeriod = Math.min(CHECK_CONNECTION_MAX_PERIOD, (1 + this.checkConnectionPeriod) * 1.5);

        if(!import.meta.env.VITE_MTPROTO_WORKER) {
          document.body.addEventListener('online', this.checkConnection, false);
          document.body.addEventListener('focus', this.checkConnection, false);
        }
      } else {
        this.onTransportOpen();
        this.checkLongPoll();

        if(!import.meta.env.VITE_MTPROTO_WORKER) {
          document.body.removeEventListener('online', this.checkConnection);
          document.body.removeEventListener('focus', this.checkConnection);
        }
      }
    } else {
      this.setConnectionStatus(
        offline ? ConnectionStatus.Closed : ConnectionStatus.Connected,
        offline ? this.checkConnectionRetryAt : undefined
      );
    }
  }

  private handleSentEncryptedRequestHTTP(promise: ReturnType<MTPNetworker['sendEncryptedRequest']>, message: MTMessage, noResponseMsgs: string[]) {
    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return;
    }
    // let timeout = setTimeout(() => {
    //   this.log.error('handleSentEncryptedRequestHTTP timeout', promise, message, noResponseMsgs);
    // }, 5e3);

    promise.then(async(result) => {
      this.toggleOffline(false);

      await this.onTransportData(result);

      this.checkLongPoll();
      this.checkConnectionPeriod = Math.max(1.1, Math.sqrt(this.checkConnectionPeriod));

      return true;
    }, (error) => {
      this.log.error('encrypted request failed', error, message);

      this.pushResend(message.msg_id);
      this.toggleOffline(true);

      return false;
    }).then((shouldResolve) => {
      // clearTimeout(timeout);
      const sentMessages = this.sentMessages;
      noResponseMsgs.forEach((msgId) => {
        const sentMessage = sentMessages[msgId];
        if(sentMessage) {
          const {deferred} = sentMessage;
          delete sentMessages[msgId];
          delete this.pendingMessages[msgId];
          shouldResolve ? deferred.resolve() : deferred.reject();
        }
      });
    });
  }

  // тут можно сделать таймаут и выводить дисконнект
  private pushMessage(message: MTMessage, options: MTMessageOptions) {
    let promise: CancellablePromise<void>;
    if(!options.notContentRelated || options.noResponse) {
      promise = deferredPromise();
    }

    this.sentMessages[message.msg_id] = Object.assign(
      message,
      options,
      promise ? {deferred: promise} : undefined
    );

    this.pendingMessages[message.msg_id] = 0;

    if(!options.noSchedule) {
      this.scheduleRequest();
    }

    if(isObject(options)) {
      options.messageId = message.msg_id;
    }

    return promise;
  }

  private async getBaseDcId() {
    const accountData = await AccountController.get(this.accountNumber);
    return accountData?.dcId;
  }

  public attachPromise(promise: Promise<any>, message: MTMessage) {
    const canIncrement = true;
    const timeout = setTimeout(() => {
      if(this.lastResponseTime && (Date.now() - this.lastResponseTime) < this.delays.connectionTimeout) {
        return;
      }

      this.log.error('timeout', message);
      if(this.isOnline) {
        this.setConnectionStatus(ConnectionStatus.TimedOut);
      }

      /* this.getEncryptedOutput(message).then((bytes) => {
        this.log.error('timeout encrypted', bytes);
      }); */
    }, this.delays.connectionTimeout);

    promise.catch(noop).finally(() => {
      clearTimeout(timeout);
      this.setConnectionStatus(ConnectionStatus.Connected);

      if(canIncrement) {
        --this.activeRequests;
        this.setDrainTimeout();
      }
    });

    if(canIncrement) {
      ++this.activeRequests;
      if(this.onDrainTimeout) {
        clearTimeout(this.onDrainTimeout);
        this.onDrainTimeout = undefined;
      }
    }
  }

  public setDrainTimeout() {
    if(!this.activeRequests && this.onDrain && !this.onDrainTimeout) {
      this.onDrainTimeout = ctx.setTimeout(() => {
        this.onDrainTimeout = undefined;
        this.log('drain');
        this.onDrain();
      }, DRAIN_TIMEOUT);
    }
  }

  public setConnectionStatus(status: ConnectionStatus, retryAt?: number, scheduleRequestIfOnline = true) {
    const isOnline = status === ConnectionStatus.Connected;
    const willChange = this.status !== status;
    this.isOnline = isOnline;
    this.status = status;

    if(willChange) {
      if(this.networkerFactory.onConnectionStatusChange) {
        this.networkerFactory.onConnectionStatusChange({
          _: 'networkerStatus',
          status,
          dcId: this.dcId,
          name: this.name,
          isFileNetworker: this.isFileNetworker,
          isFileDownload: this.isFileDownload,
          isFileUpload: this.isFileUpload,
          retryAt
        });
      }

      if(this.isOnline && scheduleRequestIfOnline) {
        this.scheduleRequest();
      }

      if((this.transport as TcpObfuscated)?.connection) {
        this.clearPingDelayDisconnect();
        this.sendPingDelayDisconnect();
      }

      // this.getNewTimeOffset = true;
    }
    /* if(this.onConnectionStatusChange) {
      this.onConnectionStatusChange(this.isOnline);
    } */
  }

  public onTransportOpen() {
    this.setConnectionStatus(ConnectionStatus.Connected);
    this.cleanupSent();
    if(!TEST_HTTP_DROPPING_REQUESTS) this.resend();
  }

  private pushResend(messageId: MTLong, delay = 100) {
    const log = this.log.bindPrefix('pushResend');
    const sentMessage = this.sentMessages[messageId];
    if(!sentMessage) {
      log.warn('no sentMessage', messageId);
      return;
    }

    const value = delay ? Date.now() + delay : 0;
    if(sentMessage.container) {
      for(const innerMsgId of sentMessage.inner) {
        this.pushResend(innerMsgId, delay);
      }

      log('deleting container', messageId);
      delete this.sentMessages[messageId];
    } else {
      if(
        this.pendingMessages[messageId] !== undefined &&
        this.pendingMessages[messageId] <= value
      ) {
        log('already pending', messageId);
        return;
      }

      this.pendingMessages[messageId] = value;
    }

    if(sentMessage.acked) {
      log.error('acked message?', sentMessage);
    }

    log('push', sentMessage, delay);

    this.scheduleRequest(delay);
  }

  // * correct, fully checked
  private async getMsgKey(dataWithPadding: Uint8Array, isOut: boolean) {
    const x = isOut ? 0 : 8;
    const msgKeyLargePlain = bufferConcats(this.authKeyUint8.subarray(88 + x, 88 + x + 32), dataWithPadding);

    const msgKeyLarge = await CryptoWorker.invokeCrypto('sha256', msgKeyLargePlain);
    const msgKey = new Uint8Array(msgKeyLarge).subarray(8, 24);
    return msgKey;
  };

  // * correct, fully checked
  private async getAesKeyIv(msgKey: Uint8Array, isOut: boolean): Promise<[Uint8Array, Uint8Array]> {
    const x = isOut ? 0 : 8;
    const sha2aText = new Uint8Array(52);
    const sha2bText = new Uint8Array(52);
    const promises: Array<Promise<Uint8Array>> = [];

    sha2aText.set(msgKey, 0);
    sha2aText.set(this.authKeyUint8.subarray(x, x + 36), 16);
    promises.push(CryptoWorker.invokeCrypto('sha256', sha2aText));

    sha2bText.set(this.authKeyUint8.subarray(40 + x, 40 + x + 36), 0);
    sha2bText.set(msgKey, 36);
    promises.push(CryptoWorker.invokeCrypto('sha256', sha2bText));

    const results = await Promise.all(promises);

    const aesKey = new Uint8Array(32);
    const aesIv = new Uint8Array(32);
    const sha2a = new Uint8Array(results[0]);
    const sha2b = new Uint8Array(results[1]);

    aesKey.set(sha2a.subarray(0, 8));
    aesKey.set(sha2b.subarray(8, 24), 8);
    aesKey.set(sha2a.subarray(24, 32), 24);

    aesIv.set(sha2b.subarray(0, 8));
    aesIv.set(sha2a.subarray(8, 24), 8);
    aesIv.set(sha2b.subarray(24, 32), 24);

    return [aesKey, aesIv];
  }

  public isStopped() {
    return this.networkerFactory.akStopped && !this.isFileNetworker;
  }

  private performScheduledRequest() {
    const log = this.log.bindPrefix('performScheduledRequest');
    if(this.isStopped()) {
      log('is stopped');
      return false;
    }

    let lengthOverflow = false;
    let hasApiCall: boolean, hasHttpWait: boolean;
    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      hasApiCall = hasHttpWait = false;
    }

    if(this.pendingAcks.length) {
      const ackMsgIds = this.pendingAcks.splice(0, Math.min(8192, this.pendingAcks.length));

      this.wrapMtpMessage({
        _: 'msgs_ack',
        msg_ids: ackMsgIds
      }, {
        canCleanup: true,
        notContentRelated: true,
        noSchedule: true
      });

      log.debug('acking messages', ackMsgIds);

      if(this.pendingAcks.length) {
        lengthOverflow = true;
      }
    }

    const pendingResendReqLength = this.pendingResendReq.length;
    if(pendingResendReqLength) {
      const msgIds = this.pendingResendReq.splice(0, Math.min(8192, pendingResendReqLength));
      const options: MTMessageOptions = {...RESEND_OPTIONS, resending: new Set(msgIds)};
      this.wrapMtpMessage({
        _: 'msg_resend_req',
        msg_ids: msgIds
      }, options);

      const sentMessage = this.sentMessages[options.messageId];
      msgIds.forEach((msgId) => {
        this.sentResendReq.set(msgId, sentMessage);
      });

      log.debug('resending requests', options.messageId, msgIds);

      if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
        hasApiCall = true;
      }

      if(this.pendingResendReq.length) {
        lengthOverflow = true;
      }
      /* this.lastResendReq = {
        reqMsgId: options.messageId,
        msgIds: msgIds
      }; */

      // this.pendingResendReq.length = 0;
    }

    // if(this.pendingResendAnsReq.length) {
    //   const options: MTMessageOptions = {...RESEND_OPTIONS};
    //   const msgIds = this.pendingResendAnsReq.slice();
    //   this.wrapMtpMessage({
    //     _: 'msg_resend_ans_req',
    //     msg_ids: msgIds
    //   }, options);

    //   this.log('resend: requesting answers', options.messageId, msgIds);
    //   this.lastResendAnsReq = {
    //     reqMsgId: options.messageId,
    //     msgIds: msgIds
    //   };

    //   // this.pendingResendAnsReq.length = 0;
    // }

    let outMessage: MTMessage;
    const messages: typeof outMessage[] = [];

    // const currentTime = Date.now();
    let messagesByteLen = 0;

    // * Сюда никогда не попадут контейнеры, так как их не будет в pendingMessages
    const keys = sortLongsArray(Object.keys(this.pendingMessages));
    for(const messageId of keys) {
      const message = this.sentMessages[messageId];
      if(message?.body) {
        const messageByteLength = message.body.length + 32;

        if((messagesByteLen + messageByteLength) > 655360) { // 640 Kb
          log.warn('length overflow', message, messages);
          lengthOverflow = true;

          if(outMessage) { // if it's not a first message
            break;
          }
        }

        // message.sentTime = time;
        messages.push(message);
        messagesByteLen += messageByteLength;

        if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
          if(message.isAPI) {
            hasApiCall = true;
          } else if(message.longPoll) {
            hasHttpWait = true;
          }
        }

        outMessage = message;
      } else {
        log.error('no body', message, messageId);
      }

      delete this.pendingMessages[messageId];
    }

    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      if(!import.meta.env.VITE_MTPROTO_HAS_WS || this.transport instanceof HTTP) {
        if(hasApiCall && !hasHttpWait) {
          const options: MTMessageOptions = {...HTTP_WAIT_OPTIONS, noSchedule: true};
          this.wrapMtpCall('http_wait', {
            max_delay: 500,
            wait_after: 150,
            max_wait: 3000
          }, options);

          const message = this.sentMessages[options.messageId];
          messages.push(message);
          delete this.pendingMessages[message.msg_id]
          log('appended http_wait', message.msg_id);
        }
      }
    }

    if(!messages.length) {
      log('no messages to send');
      return;
    }

    let noResponseMsgs: Array<string>;
    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      noResponseMsgs = messages.filter((message) => message.noResponse).map((message) => message.msg_id);
    }

    if(messages.length > 1) {
      // log.debug('packing messages into container', messagesByteLen, messages.map((m) => m.msg_id));
      const container = this.generateContainerMessage(messagesByteLen, messages);
      outMessage = container.messageWithBody;

      this.sentMessages[outMessage.msg_id] = container.message;
    } else {
      this.sentMessages[outMessage.msg_id] = outMessage;
    }

    const promise = this.sendEncryptedRequest(outMessage);

    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      if(!import.meta.env.VITE_MTPROTO_HAS_WS || this.transport instanceof HTTP) {
        this.handleSentEncryptedRequestHTTP(promise, outMessage, noResponseMsgs);
      }
    }

    this.cleanupSent();

    if(lengthOverflow) {
      log('scheduling next request because of overflow');
      this.scheduleRequest();
    }
  }

  private generateContainerMessage(messagesByteLen: number, messages: MTMessage[]) {
    const container = new TLSerialization({
      mtproto: true,
      startMaxLength: messagesByteLen + 64
    });

    container.storeInt(0x73f1f8dc, 'CONTAINER[id]');
    container.storeInt(messages.length, 'CONTAINER[count]');

    const innerMessages = messages.map((message, i) => {
      container.storeLong(message.msg_id, 'CONTAINER[' + i + '][msg_id]');
      container.storeInt(message.seq_no, 'CONTAINER[' + i + '][seq_no]');
      container.storeInt(message.body.length, 'CONTAINER[' + i + '][bytes]');
      container.storeRawBytes(message.body, 'CONTAINER[' + i + '][body]');
      return message.msg_id;
    });

    const message: MTMessage = {
      msg_id: this.timeManager.generateId(),
      seq_no: this.generateSeqNo(true),
      container: true,
      inner: innerMessages,
      notContentRelated: true
    };

    this.log.warn('container', message.msg_id, message.seq_no, innerMessages);

    return {
      message,
      messageWithBody: Object.assign({body: container.getBytes(true)}, message)
    };
  }

  private async getEncryptedMessage(dataWithPadding: Uint8Array) {
    const msgKey = await this.getMsgKey(dataWithPadding, true);
    const keyIv = await this.getAesKeyIv(msgKey, true);
    // this.log('after msg key iv')

    const encryptedBytes = await CryptoWorker.invokeCrypto('aes-encrypt', dataWithPadding, keyIv[0], keyIv[1]);
    // this.log('Finish encrypt')

    return {
      bytes: encryptedBytes,
      msgKey
    };
  }

  private async getDecryptedMessage(msgKey: Uint8Array, encryptedData: Uint8Array) {
    // this.log('get decrypted start')
    const keyIv = await this.getAesKeyIv(msgKey, false);
    // this.log('after msg key iv')
    return CryptoWorker.invokeCrypto('aes-decrypt', encryptedData, keyIv[0], keyIv[1]);
  }

  private async getEncryptedOutput(message: MTMessage) {
    /* if(DEBUG) {
      this.log.debug('Send encrypted', message, this.authKeyId);
    } */
    /* if(!this.isOnline) {
      this.log('trying to send message when offline:', Object.assign({}, message));
      //debugger;
    } */

    const data = new TLSerialization({
      startMaxLength: message.body.length + 2048
    });

    data.storeIntBytes(this.serverSalt, 64, 'salt');
    data.storeIntBytes(this.sessionId, 64, 'session_id');

    data.storeLong(message.msg_id, 'message_id');
    data.storeInt(message.seq_no, 'seq_no');

    data.storeInt(message.body.length, 'message_data_length');
    data.storeRawBytes(message.body, 'message_data');

    /* const des = new TLDeserialization(data.getBuffer().slice(16));
    const desSalt = des.fetchLong();
    const desSessionId = des.fetchLong();

    if(!this.isOnline) {
      this.log.error('trying to send message when offline', message, new Uint8Array(des.buffer), desSalt, desSessionId);
    } */

    /* const messageDataLength = message.body.length;
    let canBeLength = 0; // bytes
    canBeLength += 8;
    canBeLength += 8;
    canBeLength += 8;
    canBeLength += 4;
    canBeLength += 4;
    canBeLength += message.body.length; */

    const dataBuffer = data.getBuffer();

    /* if(dataBuffer.byteLength !== canBeLength || !bytesCmp(new Uint8Array(dataBuffer.slice(dataBuffer.byteLength - message.body.length)), new Uint8Array(message.body))) {
      this.log.error('wrong length', dataBuffer, canBeLength, message.msg_id);
    } */

    const paddingLength = (16 - (data.getOffset() % 16)) + 16 * (1 + nextRandomUint(8) % 5);
    const padding = /* (message as any).padding ||  */randomize(new Uint8Array(paddingLength))/* .fill(0) */;
    /* const padding = [167, 148, 207, 226, 86, 192, 193, 57, 124, 153, 174, 145, 159, 1, 5, 70, 127, 157,
      51, 241, 46, 85, 141, 212, 139, 234, 213, 164, 197, 116, 245, 70, 184, 40, 40, 201, 233, 211, 150,
      94, 57, 84, 1, 135, 108, 253, 34, 139, 222, 208, 71, 214, 90, 67, 36, 28, 167, 148, 207, 226, 86, 192, 193, 57, 124, 153, 174, 145, 159, 1, 5, 70, 127, 157,
      51, 241, 46, 85, 141, 212, 139, 234, 213, 164, 197, 116, 245, 70, 184, 40, 40, 201, 233, 211, 150,
      94, 57, 84, 1, 135, 108, 253, 34, 139, 222, 208, 71, 214, 90, 67, 36, 28].slice(0, paddingLength); */

    // (message as any).padding = padding;

    const dataWithPadding = bufferConcats(dataBuffer, padding);
    // this.log('Adding padding', dataBuffer, padding, dataWithPadding)
    // this.log('auth_key_id', bytesToHex(self.authKeyID))

    /* if(dataWithPadding.byteLength % 16) {
      this.log.error('aaa', dataWithPadding, paddingLength);
    }

    if(message.fileUpload) {
      this.log('Send encrypted: body length:', (message.body as ArrayBuffer).byteLength, paddingLength, dataWithPadding);
    } */

    // * full next block is correct
    const encryptedResult = await this.getEncryptedMessage(dataWithPadding);
    /* if(DEBUG) {
      this.log('Got encrypted out message', encryptedResult);
    } */

    const request = new TLSerialization({
      startMaxLength: encryptedResult.bytes.length + 256
    });
    request.storeIntBytes(this.authKeyId, 64, 'auth_key_id');
    request.storeIntBytes(encryptedResult.msgKey, 128, 'msg_key');
    request.storeRawBytes(encryptedResult.bytes, 'encrypted_data');

    const requestData = request.getBytes(true);

    // if(this.isFileNetworker) {
    //   //this.log('Send encrypted: requestData length:', requestData.length, requestData.length % 16, paddingLength % 16, paddingLength, data.offset, encryptedResult.msgKey.length % 16, encryptedResult.bytes.length % 16);
    //   //this.log('Send encrypted: messageId:', message.msg_id, requestData.length);
    //   //this.log('Send encrypted:', message, new Uint8Array(bufferConcat(des.buffer, padding)), requestData, this.serverSalt.hex, this.sessionId.hex/* new Uint8Array(des.buffer) */);
    //   this.debugRequests.push({before: new Uint8Array(bufferConcat(des.buffer, padding)), after: requestData});
    // }

    return requestData;
  }

  private async sendEncryptedRequest(message: MTMessage) {
    const log = this.log.bindPrefix('sendEncryptedRequest');
    const requestData = await this.getEncryptedOutput(message);

    if(!this.transport) {
      log.error('trying to send something when offline', this.transport, this);
    }

    log.debug('sending', message, [message.msg_id].concat(message.inner || []), requestData.length);
    const promise: Promise<Uint8Array> = this.transport ? this.transport.send(requestData) as any : Promise.reject({});

    if(!import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      return promise;
    }

    if(import.meta.env.VITE_MTPROTO_HAS_WS && !(this.transport instanceof HTTP)) {
      return promise;
    }

    const baseError = makeError('NETWORK_BAD_RESPONSE');
    baseError.code = 406;

    return promise.then((result) => {
      if(!result?.byteLength) {
        throw baseError;
      }

      // this.debug && this.log.debug('sendEncryptedRequest: got response for:', message, [message.msg_id].concat(message.inner || []));
      return result;
    }, (error) => {
      if(error !== baseError) {
        const newError = makeError('NETWORK_BAD_REQUEST');
        newError.originalError = error;
        error = newError;
      }

      throw error;
    });
  }

  public async onTransportData(data: Uint8Array, packetTime: number = Date.now()) {
    const response = await this.parseResponse(data);
    // this.debug && this.log.debug('server response', response);
    this.processMessage(response.response, response.messageId, response.sessionId, packetTime);
  }

  public async parseResponse(responseBuffer: Uint8Array) {
    // const perf = performance.now();
    /* if(this.debug) {
      this.log.debug('Start parsing response', responseBuffer);
    } */

    this.lastResponseTime = Date.now();

    let deserializer = new TLDeserialization(responseBuffer);

    const authKeyId = deserializer.fetchIntBytes(64, true, 'auth_key_id');
    if(!bytesCmp(authKeyId, this.authKeyId)) {
      throw new Error('[MT] Invalid server auth_key_id: ' + bytesToHex(authKeyId));
    }

    const msgKey = deserializer.fetchIntBytes(128, true, 'msg_key');
    const encryptedData = deserializer.fetchRawBytes(responseBuffer.byteLength - deserializer.getOffset(), true, 'encrypted_data');

    const dataWithPadding = await this.getDecryptedMessage(msgKey, encryptedData);
    // this.log('after decrypt')
    const calcMsgKey = await this.getMsgKey(dataWithPadding, false);
    if(!bytesCmp(msgKey, calcMsgKey)) {
      this.log.warn('[MT] msg_keys', msgKey, calcMsgKey);
      this.updateSession(); // fix 28.01.2020
      throw new Error('[MT] server msgKey mismatch, updating session');
    }
    // this.log('after msgKey check')

    deserializer = new TLDeserialization<MTLong>(dataWithPadding, {mtproto: true});

    /* const salt =  */deserializer.fetchIntBytes(64, true, 'salt'); // need
    const sessionId = deserializer.fetchIntBytes(64, true, 'session_id');
    const messageId = deserializer.fetchLong('message_id') as MTLong;

    if(!bytesCmp(sessionId, this.sessionId) &&
      (!this.prevSessionId || !bytesCmp(sessionId, this.prevSessionId))) {
      this.log.warn('sessions', sessionId, this.sessionId, this.prevSessionId, dataWithPadding);
      // this.updateSession();
      // this.sessionID = sessionID;
      throw new Error('[MT] Invalid server session_id: ' + bytesToHex(sessionId));
    }

    const seqNo = deserializer.fetchInt('seq_no');

    const totalLength = dataWithPadding.byteLength;

    const messageBodyLength = deserializer.fetchInt('message_data[length]');
    let offset = deserializer.getOffset();

    if((messageBodyLength % 4) ||
      messageBodyLength > (totalLength - offset)) {
      throw new Error('[MT] Invalid body length: ' + messageBodyLength);
    }
    const messageBody = deserializer.fetchRawBytes(messageBodyLength, true, 'message_data');

    offset = deserializer.getOffset();
    const paddingLength = totalLength - offset;
    if(paddingLength < 12 || paddingLength > 1024) {
      throw new Error('[MT] Invalid padding length: ' + paddingLength);
    }

    const response = this.parseResponseMessageBody(messageBody);
    // this.log('parse response time', performance.now() - perf);
    return {
      response,
      messageId,
      sessionId,
      seqNo
    };
  }

  private parseResponseMessageBody(messageBody: Uint8Array) {
    // let buffer = bytesToArrayBuffer(messageBody);
    const deserializer = new TLDeserialization<MTLong>(/* buffer */messageBody, {
      mtproto: true,
      override: {
        mt_message: (result: any, field: string) => {
          result.msg_id = deserializer.fetchLong(field + '[msg_id]');
          result.seqno = deserializer.fetchInt(field + '[seqno]');
          result.bytes = deserializer.fetchInt(field + '[bytes]');

          const offset = deserializer.getOffset();

          // this.log('mt_message!!!!!', result, field);

          try {
            result.body = deserializer.fetchObject('Object', field + '[body]');
          } catch(e) {
            this.log.error('parse error', (e as Error).message, (e as Error).stack);
            result.body = {
              _: 'parse_error',
              error: e
            };
          }

          if(deserializer.getOffset() !== (offset + result.bytes)) {
            // this.log.warn('set offset', deserializer.offset, offset, result.bytes)
            // this.log(result)
            deserializer.setOffset(offset + result.bytes);
          }
          // this.log('override message', result)
        },
        mt_rpc_result: (result: any, field: any) => {
          result.req_msg_id = deserializer.fetchLong(field + '[req_msg_id]');

          const sentMessage = this.sentMessages[result.req_msg_id];
          const type = sentMessage && sentMessage.resultType || 'Object';

          if(result.req_msg_id && !sentMessage) {
            // this.log.warn('Result for unknown message', result);
            return;
          }

          // deserializer.setMtproto(false);
          result.result = deserializer.fetchObject(type, field + '[result]');
          // deserializer.setMtproto(true);
          // this.log('override rpc_result', sentMessage, type, result);
        }
      }
    });

    return deserializer.fetchObject('', 'INPUT');
  }

  private applyServerSalt(newServerSalt: string) {
    const serverSalt = longToBytes(newServerSalt);

    AccountController.update(this.accountNumber, {
      ['dc' + this.dcId + '_server_salt']: bytesToHex(serverSalt)
    });

    this.serverSalt = new Uint8Array(serverSalt);
  }

  private clearNextReq() {
    const log = this.log.bindPrefix('clearNextReq').debug;
    if(!this.nextReq) {
      log('nothing to clear');
      return;
    }

    // * can have nextReq without nextReqTimeout
    if(this.nextReqTimeout) {
      log('clear');
      clearTimeout(this.nextReqTimeout);
      this.nextReqTimeout = 0;
    }

    this.nextReq = 0;
  }

  // ! таймаут очень сильно тормозит скорость работы сокета (даже нулевой)
  public scheduleRequest(delay?: number) {
    const log = this.log.bindPrefix('scheduleRequest').debug;
    /* if(!this.isOnline) {
      return;
    } */

    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      if(!import.meta.env.VITE_MTPROTO_HAS_WS || this.transport instanceof HTTP) {
        if(this.offline) {
          this.checkConnection('forced schedule');
        }

        delay ||= 0; // set zero timeout to pack other messages too
      }
    }

    const nextReq = Date.now() + (delay || 0);
    if(this.nextReq && (delay === undefined || this.nextReq <= nextReq)) {
      log('already has nextReq', this.nextReq, nextReq);
      return;
    }

    log('delay', delay);

    const cb = () => {
      if(perf) {
        log('timeout delay', performance.now() - perf);
      }

      this.clearNextReq();

      if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
        if(!import.meta.env.VITE_MTPROTO_HAS_WS || this.transport instanceof HTTP) {
          if(this.offline) {
            log('cancel scheduled');
            return;
          }
        }
      }

      this.performScheduledRequest();
    };

    let perf: number;
    if(delay !== undefined) {
      perf = performance.now();
      if(this.nextReqTimeout) {
        clearTimeout(this.nextReqTimeout);
        this.nextReqTimeout = 0;
      }

      this.nextReq = nextReq;
      this.nextReqTimeout = ctx.setTimeout(cb, delay);
    } else {
      cb();
    }
  }

  private ackMessage(msgId: MTLong) {
    if(TEST_NO_ACKS) {
      this.log('skipping sending ack', msgId);
      return;
    }

    // this.log('ack message', msgID)
    this.pendingAcks.push(msgId);

    let delay: number;

    if(import.meta.env.VITE_MTPROTO_HAS_HTTP) {
      if(!import.meta.env.VITE_MTPROTO_HAS_WS || this.transport instanceof HTTP) {
        delay = 30000;
      }
    }

    this.scheduleRequest(delay);
  }

  /**
   * will clear `msg_resend_req` message from sentMessages when all messages are acked
   */
  private processResentReqMessage(messageId: MTLong) {
    const resendRequestMessage = this.sentResendReq.get(messageId);
    if(resendRequestMessage) {
      resendRequestMessage.resending.delete(messageId);
      if(!resendRequestMessage.resending.size) {
        delete this.sentMessages[resendRequestMessage.msg_id];
      }

      this.sentResendReq.delete(messageId);
    }
  }

  private reqResend(msgId: MTLong/* , isAnswer?: boolean */) {
    this.log.debug('req resend', msgId/* , isAnswer */);

    // (isAnswer ? this.pendingResendAnsReq : this.pendingResendReq).push(msgId);
    if(!this.pendingResendReq.includes(msgId)) this.pendingResendReq.push(msgId);
    this.scheduleRequest(100);
  }

  public cleanupSent() {
    const log = this.log.bindPrefix('cleanupSent', this.debug ? LogTypes.Log : LogTypes.None);
    let notEmpty = false;
    const sentMessages = this.sentMessages;
    log.group('start');
    Object.keys(sentMessages).forEach((msgId) => {
      const message = sentMessages[msgId];

      // log('clean iter', msgId, message);
      if(message.canCleanup && this.pendingMessages[msgId] === undefined) {
        log('clean canCleanup', msgId);
        delete sentMessages[msgId];
      } else if(message.container) {
        for(const innerMsgId of message.inner) {
          if(sentMessages[innerMsgId]) {
            log(`clean failed, found item=${innerMsgId} in container=${msgId}`);
            notEmpty = true;
            return;
          }
        }

        log('clean container', msgId);
        delete sentMessages[msgId];
      } else {
        log('clean failed', msgId);
        notEmpty = true;
      }
    });

    log('end', notEmpty);
    log.groupEnd();
    return !notEmpty;
  }

  private processMessageAck(messageId: Long) {
    const sentMessage = this.sentMessages[messageId];
    if(sentMessage && !sentMessage.acked) {
      // delete sentMessage.body;
      sentMessage.acked = true;
    }
  }

  private processError(rawError: {error_message: string, error_code: number}) {
    const matches = (rawError.error_message || '').match(/^([A-Z_0-9]+\b)(: (.+))?/) || [];
    rawError.error_code = rawError.error_code;

    const error = makeError(
      matches[1] as any || 'UNKNOWN',
      matches[3] || ('CODE#' + rawError.error_code + ' ' + rawError.error_message)
    );
    error.originalError = rawError;
    error.code = !rawError.error_code || rawError.error_code <= 0 ? 500 : rawError.error_code;
    return error;
  }

  public resend() {
    this.log.warn('resending all messages');

    const sentMessages = this.sentMessages;
    for(const id in sentMessages) {
      const msg = sentMessages[id];
      if(msg.body || msg.container) {
        this.pushResend(id);
      }
    }

    if((this.transport as TcpObfuscated).connection) {
      this.clearPingDelayDisconnect();
      this.sendPingDelayDisconnect();
    }
  }

  /* public requestMessageStatus() {
    const ids: string[] = [];
    for(const id in this.sentMessages) {
      const message = this.sentMessages[id];
      if(message.isAPI && message.fileUpload) {
        ids.push(message.msg_id);
      }
    }

    this.wrapMtpMessage({
      _: 'msgs_state_req',
      msg_ids: ids
    }, {
      notContentRelated: true
    }).then((res) => {
      this.log('status', res);
    });
  } */

  private applyServerTime(messageId: string) {
    const serverTime = bigInt(messageId).shiftRight(32).toJSNumber();
    this.log('applying server time', serverTime);
    return this.timeManager.applyServerTime(serverTime);
  }

  // * https://core.telegram.org/mtproto/service_messages_about_messages#notice-of-ignored-error-message
  public processMessage(message: any, messageId: MTLong, sessionId: Uint8Array | number[], packetTime?: number) {
    const log = this.log.bindPrefix('processMessage');
    if(message._ === 'messageEmpty') {
      log.warn('messageEmpty', message, messageId);
      return;
    }

    // messageId = messageId.toString();

    const msgidInt = parseInt(messageId.substr(0, -10), 10);
    if(msgidInt % 2) {
      log.warn('server even message id', messageId, message);
      return;
    }

    log.debug('process message', message, messageId, packetTime ? Date.now() - packetTime : undefined);

    this.pingDelayDisconnectDeferred?.resolve('any message');

    // let changedTimeOffset: boolean;
    // if(this.getNewTimeOffset) {
    //   changedTimeOffset = this.applyServerTime(messageId);
    //   this.getNewTimeOffset = undefined;
    // }

    switch(message._) {
      case 'msg_container': {
        for(const innerMessage of message.messages) {
          this.processMessage(innerMessage, innerMessage.msg_id, sessionId);
        }

        break;
      }

      case 'bad_server_salt': {
        log('bad server salt', message);

        this.applyServerSalt(message.new_server_salt);

        if(this.sentMessages[message.bad_msg_id]) {
          this.pushResend(message.bad_msg_id);
        }

        this.ackMessage(messageId);

        // simulate disconnect
        /* try {
          this.log('networker state:', this);
          // @ts-ignore
          this.transport.ws.close(1000);
        } catch(err) {
          this.log.error('transport', this.transport, err);
        } */

        break;
      }

      case 'bad_msg_notification': {
        log.error('bad msg notification', message);

        switch(message.error_code) {
          case 16:    // * msg_id too low
          case 17:    // * msg_id too high
          case 32:    // * msg_seqno too low
          case 33:    // * msg_seqno too high
          case 64: {  // * invalid container
            // if(changedTimeOffset === undefined) {
            //   changedTimeOffset = this.applyServerTime(messageId);
            // }

            const changedTimeOffset = this.applyServerTime(messageId);
            if(message.error_code === 17 || changedTimeOffset) {
              log('update session');
              this.updateSession();
            }

            const badMessage = this.updateSentMessage(message.bad_msg_id);
            if(badMessage) {
              this.pushResend(badMessage.msg_id);
            }
          }

          // * invalid container
          /* case 64: {
            const badMessage = this.sentMessages[message.bad_msg_id];
            if(badMessage) {
              for(const msgId of badMessage.inner) {
                if(this.sentMessages[msgId] !== undefined) {
                  this.updateSentMessage
                }
              }
              const inner = badMessage.inner;
            }
          } */
        }

        break;
      }

      case 'message': {
        if(this.lastServerMessages.has(messageId)) {
          log.warn('server same messageId', messageId, message);
          this.ackMessage(messageId);
          return;
        }

        this.lastServerMessages.add(messageId);
        if(this.lastServerMessages.size > 100) {
          const first = this.lastServerMessages.values().next().value;
          this.lastServerMessages.delete(first);
        }

        this.processMessage(message.body, message.msg_id, sessionId);
        break;
      }

      case 'new_session_created': {
        this.ackMessage(messageId);

        log.debug('new_session_created', message);
        // this.updateSession();

        this.processMessageAck(message.first_msg_id);
        this.applyServerSalt(message.server_salt);

        this.getBaseDcId().then((baseDcId) => {
          if(baseDcId === this.dcId && !this.isFileNetworker) {
            this.networkerFactory.updatesProcessor?.(message);
          }
        });
        break;
      }

      case 'msgs_ack': {
        log.debug('got acks', message.msg_ids);
        for(const msgId of message.msg_ids) {
          this.processMessageAck(msgId);
        }

        break;
      }

      case 'msg_detailed_info': {
        const sentMessage = this.sentMessages[message.msg_id];
        if(!sentMessage) {
          this.ackMessage(message.answer_msg_id);
          break;
        }

        // * continue to resend below
      }

      case 'msg_new_detailed_info': {
        if(this.pendingAcks.includes(message.answer_msg_id)) {
          break;
        }

        this.reqResend(message.answer_msg_id);
        break;
      }

      case 'msgs_state_info': { // https://core.telegram.org/mtproto/service_messages_about_messages#informational-message-regarding-status-of-messages
        const sentMessageId = message.req_msg_id;
        const sentMessage = this.sentMessages[sentMessageId]; // should be msg_resend_req or msgs_state_req
        log('got msgs_state_info', sentMessage, message);
        if(sentMessage) {
          delete this.sentMessages[sentMessageId];
        }

        const arr = [
          [this.lastResendReq, this.pendingResendReq] as const
          // [this.lastResendAnsReq, this.pendingResendAnsReq] as const
        ];

        for(const [lastResend, pendingResend] of arr) {
          if(lastResend?.reqMsgId === sentMessageId && pendingResend.length) {
            for(const badMsgId of lastResend.msgIds) {
              indexOfAndSplice(pendingResend, badMsgId);
            }
          }
        }

        break;
      }

      case 'rpc_result': {
        if(TEST_RESEND_RPC && message.result._ === TEST_RESEND_RPC && TESTING_RESENDING_RPC) {
          TESTING_RESENDING_RPC = undefined;
          this.reqResend(messageId);
          break;
        }

        this.ackMessage(messageId);

        const sentMessageId = message.req_msg_id;
        const sentMessage = this.sentMessages[sentMessageId];

        // log('rpc response', message.result, sentMessage);

        this.processMessageAck(sentMessageId);
        if(sentMessage) {
          const {deferred} = sentMessage;
          const {result} = message;
          if(result._ === 'rpc_error') {
            const error = this.processError(result);
            log('rpc error', result, sentMessage, error);
            deferred?.reject(error);
          } else {
            log('rpc result', result, sentMessage/* , Date.now() - sentMessage.sentTime, sentMessage.sentTime */);
            deferred?.resolve(result);

            if(sentMessage.isAPI && !this.connectionInited) {
              this.connectionInited = true;
            }
          }

          this.processResentReqMessage(messageId);

          delete this.sentMessages[sentMessageId];
        } else {
          log('rpc result for unknown message:', sentMessageId, message);
        }

        break;
      }

      case 'pong': { // * https://core.telegram.org/mtproto/service_messages#ping-messages-pingpong - These messages don't require acknowledgments
        /* const sentMessageId = message.msg_id;
        const sentMessage = this.sentMessages[sentMessageId];

        if(sentMessage) {
          sentMessage.deferred.resolve(message);
          delete this.sentMessages[sentMessageId];
        } */
        const pingId = message.ping_id;
        if(this.lastPingDelayDisconnectId === pingId) {
          const deferred = this.pingDelayDisconnectDeferred;
          if(deferred) {
            deferred.resolve('pong');
          } else {
            log('ping deferred deleted', pingId);
          }

          // this.lastPingRealTime = Date.now() - this.lastPingStartTime;
          // log('last ping real time', this.lastPingRealTime);
        }

        break;
      }

      default:
        this.ackMessage(messageId);

        /* if(this.debug) {
          this.log.debug('Update', message);
        } */

        if(this.networkerFactory.updatesProcessor !== null) {
          this.networkerFactory.updatesProcessor(message);
        }
        break;
    }
  }
}
