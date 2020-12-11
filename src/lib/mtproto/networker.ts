import {isObject} from './bin_utils';
import { bigStringInt} from './bin_utils';
import {TLDeserialization, TLSerialization} from './tl_utils';
import CryptoWorker from '../crypto/cryptoworker';
import AppStorage from '../storage';
import Schema from './schema';
import timeManager from './timeManager';
import NetworkerFactory from './networkerFactory';
import { logger, LogLevels } from '../logger';
import { Modes, App } from './mtproto_config';
import { InvokeApiOptions } from '../../types';
import { longToBytes } from '../crypto/crypto_utils';
import MTTransport from './transports/transport';
import { convertToUint8Array, bufferConcat, bytesCmp, bytesToHex } from '../../helpers/bytes';
import { nextRandomInt } from '../../helpers/random';

/// #if MTPROTO_HTTP_UPLOAD
// @ts-ignore
import HTTP from './transports/http';
// @ts-ignore
import Socket from './transports/websocket';
/// #elif MTPROTO_HTTP
// @ts-ignore
import HTTP from './transports/http';
/// #else
// @ts-ignore
import Socket from './transports/websocket';
/// #endif

//console.error('networker included!', new Error().stack);

export type MTMessageOptions = InvokeApiOptions & Partial<{
  noResponse: true, // http_wait
  longPoll: true,
  
  notContentRelated: true, // ACK
  noSchedule: true,
  messageId: string,
}>;

export type MTMessage = InvokeApiOptions & MTMessageOptions & {
  msg_id: string,
  seq_no: number,
  body?: Uint8Array | number[],
  isAPI?: boolean,
  // only these four are important

  acked?: boolean,

  deferred?: {
    resolve: any,
    reject: any
  },

  container?: boolean,
  inner?: string[],

  // below - options

  notContentRelated?: true,
  noSchedule?: true,

  resultType?: string,

  singleInRequest?: true,
  longPoll?: true,
  noResponse?: true, // only with http (http_wait for longPoll)
};

const CONNECTION_TIMEOUT = 5000;

export default class MTPNetworker {
  private authKeyUint8: Uint8Array;

  private isFileNetworker: boolean;
  private isFileUpload: boolean;
  private isFileDownload: boolean;

  private lastServerMessages: Array<string> = [];

  private sentMessages: {
    [msgId: string]: MTMessage
  } = {};

  private pendingMessages: {[msgId: string]: number} = {};
  private pendingAcks: Array<string> = [];
  private pendingResends: Array<string> = [];
  private connectionInited = false;

  /// #if MTPROTO_HTTP || MTPROTO_HTTP_UPLOAD
  //private longPollInt: number;
  private longPollPending = 0;
  private nextReqTimeout: number;
  private nextReq: number = 0;
  private checkConnectionTimeout: number;
  private checkConnectionPeriod = 0;
  private sleepAfter = 0;
  private offline = false;
  /// #endif

  private seqNo: number = 0;
  private prevSessionId: Array<number> = [];
  private sessionId: Array<number> = [];

  private lastResendReq: {
    req_msg_id: string,
    resend_msg_ids: Array<string>
  } | null = null;

  //private transport: MTTransport;

  private name: string;
  private log: ReturnType<typeof logger>;
  
  private isOnline = false;
  private lastResponseTime = 0;
  //public onConnectionStatusChange: (online: boolean) => void;

  constructor(public dcId: number, private authKey: number[], private authKeyId: Uint8Array,
    private serverSalt: number[], private transport: MTTransport, options: InvokeApiOptions = {}) {
    this.authKeyUint8 = convertToUint8Array(this.authKey);
    //this.authKeyID = sha1BytesSync(this.authKey).slice(-8);

    //console.trace('Create', dcId, options);

    this.isFileUpload = !!options.fileUpload;
    this.isFileDownload = !!options.fileDownload;
    this.isFileNetworker = this.isFileUpload || this.isFileDownload;

    const suffix = this.isFileUpload ? '-U' : this.isFileDownload ? '-D' : '';
    this.name = 'NET-' + dcId + suffix;
    //this.log = logger(this.name, this.upload && this.dcId == 2 ? LogLevels.debug | LogLevels.warn | LogLevels.log | LogLevels.error : LogLevels.error);
    this.log = logger(this.name, LogLevels.log | LogLevels.error);
    this.log('constructor'/* , this.authKey, this.authKeyID, this.serverSalt */);

    // Test resend after bad_server_salt
    /* if(this.dcId == 2 && this.upload) {
      //timeManager.applyServerTime((Date.now() / 1000 - 86400) | 0);
      this.serverSalt[0] = 0;
    } */

    this.updateSession();

    // if(!NetworkerFactory.offlineInited) {
    //   NetworkerFactory.offlineInited = true;
    //   /* rootScope.offline = true
    //   rootScope.offlineConnecting = true */
    // }

    /// #if MTPROTO_HTTP_UPLOAD
    if(this.transport instanceof HTTP) {
      /* this.longPollInt =  */setInterval(this.checkLongPoll, 10000);
      this.checkLongPoll();
    } else {
      (this.transport as Socket).networker = this;
    }
    /// #elif MTPROTO_HTTP
    //if(this.transport instanceof HTTP) {
      /* this.longPollInt =  */setInterval(this.checkLongPoll, 10000);
      this.checkLongPoll();
    /// #else
    //} else {
      (this.transport as Socket).networker = this;
    //}
    /// #endif
  }

  public updateSession() {
    this.seqNo = 0;
    this.prevSessionId = this.sessionId;
    this.sessionId = [...new Uint8Array(8).randomize()];
  }

  public updateSentMessage(sentMessageId: string) {
    const sentMessage = this.sentMessages[sentMessageId];
    if(!sentMessage) {
      return false;
    }

    if(sentMessage.container) {
      const newInner: string[] = [];
      sentMessage.inner.forEach((innerSentMessageId) => {
        const innerSentMessage = this.updateSentMessage(innerSentMessageId);
        if(innerSentMessage) {
          newInner.push(innerSentMessage.msg_id);
        }
      });

      sentMessage.inner = newInner;
    }
  
    sentMessage.msg_id = timeManager.generateId();
    sentMessage.seq_no = this.generateSeqNo(sentMessage.notContentRelated || sentMessage.container);

    this.log('updateSentMessage', sentMessage.msg_id, sentMessageId);

    this.sentMessages[sentMessage.msg_id] = sentMessage;
    delete this.sentMessages[sentMessageId];
  
    return sentMessage;
  }

  public generateSeqNo(notContentRelated?: boolean) {
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
  
    const messageId = timeManager.generateId();
    const seqNo = this.generateSeqNo();
    const message = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes()
    };
  
    if(Modes.debug) {
      this.log('MT call', method, params, messageId, seqNo);
    }
  
    return this.pushMessage(message, options);
  }
  
  public wrapMtpMessage(object: any, options: MTMessageOptions) {
    const serializer = new TLSerialization({mtproto: true});
    serializer.storeObject(object, 'Object');
  
    const messageId = timeManager.generateId();
    const seqNo = this.generateSeqNo(options.notContentRelated);
    const message = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes()
    };
  
    if(Modes.debug) {
      this.log('MT message', object, messageId, seqNo);
    }
  
    return this.pushMessage(message, options);
  }

  public wrapApiCall(method: string, params: any = {}, options: InvokeApiOptions = {}) {
    const serializer = new TLSerialization(options);
  
    if(!this.connectionInited) { // this will call once for each new session
      ///////this.log('Wrap api call !this.connectionInited');
      
      const invokeWithLayer = Schema.API.methods.find(m => m.method == 'invokeWithLayer');
      if(!invokeWithLayer) throw new Error('no invokeWithLayer!');
      serializer.storeInt(+invokeWithLayer.id >>> 0, 'invokeWithLayer');

      // @ts-ignore
      serializer.storeInt(Schema.layer, 'layer');
  
      const initConnection = Schema.API.methods.find(m => m.method == 'initConnection');
      if(!initConnection) throw new Error('no initConnection!');
  
      serializer.storeInt(+initConnection.id >>> 0, 'initConnection');
      serializer.storeInt(0x0, 'flags');
      serializer.storeInt(App.id, 'api_id');
      serializer.storeString(navigator.userAgent || 'Unknown UserAgent', 'device_model');
      serializer.storeString(navigator.platform || 'Unknown Platform', 'system_version');
      serializer.storeString(App.version, 'app_version');
      serializer.storeString(navigator.language || 'en', 'system_lang_code');
      serializer.storeString('', 'lang_pack');
      serializer.storeString(navigator.language || 'en', 'lang_code');
      //serializer.storeInt(0x0, 'proxy');
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
      const invokeAfterMsg = Schema.API.methods.find(m => m.method == 'invokeAfterMsg');
      if(!invokeAfterMsg) throw new Error('no invokeAfterMsg!');

      this.log('Api call options.afterMessageId!');
      serializer.storeInt(+invokeAfterMsg.id >>> 0, 'invokeAfterMsg');
      serializer.storeLong(options.afterMessageId, 'msg_id');
    }
  
    options.resultType = serializer.storeMethod(method, params);

    /* if(method == 'account.updateNotifySettings') {
      this.log('api call body:', serializer.getBytes(true));
    } */
  
    const messageId = timeManager.generateId();
    const seqNo = this.generateSeqNo();
    const message = {
      msg_id: messageId,
      seq_no: seqNo,
      body: serializer.getBytes(true),
      isAPI: true
    };
  
    if(Modes.debug/*  || true */) {
      this.log('Api call', method, message, params, options);
    } else {
      this.log('Api call', method, params, options);
    }
  
    return this.pushMessage(message, options);
  }

  /// #if MTPROTO_HTTP || MTPROTO_HTTP_UPLOAD
  public checkLongPoll = () => {
    const isClean = this.cleanupSent();
    //this.log.error('Check lp', this.longPollPending, this.dcId, isClean, this);
    if((this.longPollPending && Date.now() < this.longPollPending) ||
      this.offline) {
      //this.log('No lp this time');
      return false;
    }

    AppStorage.get<number>('dc').then((baseDcId: number) => {
      if(isClean && (
          baseDcId != this.dcId ||
          this.isFileNetworker ||
          (this.sleepAfter && Date.now() > this.sleepAfter)
        )) {
        //console.warn(dT(), 'Send long-poll for DC is delayed', this.dcId, this.sleepAfter);
        return;
      }

      this.sendLongPoll();
    });
  };

  public sendLongPoll() {
    const maxWait = 25000;

    this.longPollPending = Date.now() + maxWait;
    //this.log('Set lp', this.longPollPending, tsNow())
  
    this.wrapMtpCall('http_wait', {
      max_delay: 500,
      wait_after: 150,
      max_wait: maxWait
    }, {
      noResponse: true,
      longPoll: true
    }).then(() => {
      this.longPollPending = 0;
      setTimeout(this.checkLongPoll, 0);
    }, (error: ErrorEvent) => {
      this.log('Long-poll failed', error);
    });
  }

  public checkConnection = (event: Event | string) => {
    /* rootScope.offlineConnecting = true */
  
    this.log('Check connection', event);
    clearTimeout(this.checkConnectionTimeout);
    this.checkConnectionTimeout = 0;
  
    const serializer = new TLSerialization({mtproto: true});
    const pingId = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
  
    serializer.storeMethod('ping', {
      ping_id: pingId
    });
  
    const pingMessage = {
      msg_id: timeManager.generateId(),
      seq_no: this.generateSeqNo(true),
      body: serializer.getBytes()
    };

    this.sendEncryptedRequest(pingMessage).then((result) => {
      /* delete rootScope.offlineConnecting */
      this.toggleOffline(false);
    }, () => {
      this.log('Delay ', this.checkConnectionPeriod * 1000);
      this.checkConnectionTimeout = setTimeout(this.checkConnection, this.checkConnectionPeriod * 1000 | 0);
      this.checkConnectionPeriod = Math.min(60, this.checkConnectionPeriod * 1.5);
      /* setTimeout(function() {
        delete rootScope.offlineConnecting
      }, 1000); */
    });
  };

  public toggleOffline(enabled: boolean) {
    // this.log('toggle ', enabled, this.dcId, this.iii)
    if(this.offline !== undefined && this.offline == enabled) {
      return false;
    }
  
    this.offline = enabled;
    /* rootScope.offline = enabled;
    rootScope.offlineConnecting = false; */

    if(this.offline) {
      clearTimeout(this.nextReqTimeout);
      this.nextReqTimeout = 0;
      this.nextReq = 0;
  
      if(this.checkConnectionPeriod < 1.5) {
        this.checkConnectionPeriod = 0;
      }
  
      this.checkConnectionTimeout = setTimeout(this.checkConnection, this.checkConnectionPeriod * 1000 | 0);
      this.checkConnectionPeriod = Math.min(30, (1 + this.checkConnectionPeriod) * 1.5);
  
      document.body.addEventListener('online', this.checkConnection, false);
      document.body.addEventListener('focus', this.checkConnection, false);
    } else {
      this.checkLongPoll();

      this.scheduleRequest();
  
      document.body.removeEventListener('online', this.checkConnection);
      document.body.removeEventListener('focus', this.checkConnection);

      clearTimeout(this.checkConnectionTimeout);
      this.checkConnectionTimeout = 0;
    }
    
  }

  private handleSentEncryptedRequestHTTP(promise: ReturnType<MTPNetworker['sendEncryptedRequest']>, message: MTMessage, noResponseMsgs: string[]) {
    promise
    .then((result) => {
      this.toggleOffline(false);
      // this.log('parse for', message)
      this.parseResponse(result).then((response) => {
        if(Modes.debug) {
          this.log('Server response', response);
        }
  
        this.processMessage(response.response, response.messageId, response.sessionId);
  
        noResponseMsgs.forEach((msgId) => {
          if(this.sentMessages[msgId]) {
            const deferred = this.sentMessages[msgId].deferred;
            delete this.sentMessages[msgId];
            deferred.resolve();
          }
        });

        this.checkLongPoll();
  
        this.checkConnectionPeriod = Math.max(1.1, Math.sqrt(this.checkConnectionPeriod));
      });
    }, (error) => {
      this.log.error('Encrypted request failed', error, message);
  
      if(message.container) {
        message.inner.forEach((msgId: string) => {
          this.pendingMessages[msgId] = 0;
        });

        delete this.sentMessages[message.msg_id];
      } else {
        this.pendingMessages[message.msg_id] = 0;
      }
  
      noResponseMsgs.forEach((msgId) => {
        if(this.sentMessages[msgId]) {
          const deferred = this.sentMessages[msgId].deferred;
          delete this.sentMessages[msgId];
          delete this.pendingMessages[msgId];
          deferred.reject();
        }
      })
  
      this.toggleOffline(true);
    });
  }
  /// #endif

  // тут можно сделать таймаут и выводить дисконнект
  public pushMessage(message: {
    msg_id: string,
    seq_no: number,
    body: Uint8Array | number[],
    isAPI?: boolean
  }, options: MTMessageOptions) {
    const promise = new Promise((resolve, reject) => {
      this.sentMessages[message.msg_id] = Object.assign(message, options, options.notContentRelated 
        ? undefined 
        : {
          deferred: {resolve, reject}
        }
      );

      //this.log.error('Networker pushMessage:', this.sentMessages[message.msg_id]);

      this.pendingMessages[message.msg_id] = 0;
    
      if(!options.noSchedule) {
        this.scheduleRequest();
      }

      if(isObject(options)) {
        options.messageId = message.msg_id;
      }
    });

    if(!options.notContentRelated && !options.noResponse) {
      const timeout = setTimeout(() => {
        if(this.lastResponseTime && (Date.now() - this.lastResponseTime) < CONNECTION_TIMEOUT) {
          return;
        }

        this.log.error('timeout', message);
        this.setConnectionStatus(false);
      }, CONNECTION_TIMEOUT);
  
      promise.finally(() => {
        clearTimeout(timeout);
        this.setConnectionStatus(true);
      });
    }

    return promise;
  }

  public setConnectionStatus(online: boolean) {
    const willChange = this.isOnline != online;
    this.isOnline = online;

    if(willChange && NetworkerFactory.onConnectionStatusChange) {
      NetworkerFactory.onConnectionStatusChange({
        _: 'networkerStatus', 
        online: this.isOnline, 
        dcId: this.dcId,
        name: this.name,
        isFileNetworker: this.isFileNetworker,
        isFileDownload: this.isFileDownload,
        isFileUpload: this.isFileUpload
      });
    }
    /* if(this.onConnectionStatusChange) {
      this.onConnectionStatusChange(this.isOnline);
    } */
  }

  public pushResend(messageId: string, delay = 0) {
    const value = delay ? Date.now() + delay : 0;
    const sentMessage = this.sentMessages[messageId];
    if(sentMessage.container) {
      for(const innerMsgId of sentMessage.inner) {
        this.pendingMessages[innerMsgId] = value;
      }
    } else {
      this.pendingMessages[messageId] = value;
    }
  
    this.log('Resend', messageId, sentMessage, this.pendingMessages);
  
    this.scheduleRequest(delay);
  }

  public async getMsgKey(dataWithPadding: ArrayBuffer, isOut: boolean) {
    const authKey = this.authKeyUint8;
    const x = isOut ? 0 : 8
    const msgKeyLargePlain = bufferConcat(authKey.subarray(88 + x, 88 + x + 32), dataWithPadding);

    const msgKeyLarge = await CryptoWorker.sha256Hash(msgKeyLargePlain);
    const msgKey = new Uint8Array(msgKeyLarge).subarray(8, 24);
    return msgKey;
  };

  public getAesKeyIv(msgKey: Uint8Array | number[], isOut: boolean): Promise<[Uint8Array, Uint8Array]> {
    const authKey = this.authKeyUint8;
    const x = isOut ? 0 : 8;
    const sha2aText = new Uint8Array(52);
    const sha2bText = new Uint8Array(52);
    const promises: Array<Promise<number[]>> = [];
  
    sha2aText.set(msgKey, 0);
    sha2aText.set(authKey.subarray(x, x + 36), 16);
    promises.push(CryptoWorker.sha256Hash(sha2aText));
  
    sha2bText.set(authKey.subarray(40 + x, 40 + x + 36), 0);
    sha2bText.set(msgKey, 36);
    promises.push(CryptoWorker.sha256Hash(sha2bText));

    return Promise.all(promises).then((results) => {
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
    });
  }

  public performScheduledRequest = () => {
    // this.log('scheduled', this.dcId, this.iii)

    /// #if MTPROTO_HTTP || MTPROTO_HTTP_UPLOAD
    if(this.offline) {
      this.log('Cancel scheduled');
      return false;
    }

    this.nextReq = 0;
    /// #endif

    if(this.pendingAcks.length) {
      const ackMsgIds: Array<string> = this.pendingAcks.slice();

      // this.log('acking messages', ackMsgIDs)
      this.wrapMtpMessage({
        _: 'msgs_ack',
        msg_ids: ackMsgIds
      }, {
        notContentRelated: true,
        noSchedule: true
      });
    }
  
    if(this.pendingResends.length) {
      const resendMsgIds: Array<string> = this.pendingResends.slice();
      const resendOpts: MTMessageOptions = {
        noSchedule: true,
        notContentRelated: true,
        messageId: '' // will set in wrapMtpMessage->pushMessage
      };

      this.log('resendReq messages', resendMsgIds);
      this.wrapMtpMessage({
        _: 'msg_resend_req',
        msg_ids: resendMsgIds
      }, resendOpts);

      this.lastResendReq = {
        req_msg_id: resendOpts.messageId,
        resend_msg_ids: resendMsgIds
      };
    }
  
    let message: MTPNetworker['sentMessages'][keyof MTPNetworker['sentMessages']];
    const messages: typeof message[] = [];
      
    const currentTime = Date.now();
    let messagesByteLen = 0;
    let hasApiCall = false;
    let hasHttpWait = false;
    let lengthOverflow = false;
    let singlesCount = 0;

    for(const messageId in this.pendingMessages) {
      const value = this.pendingMessages[messageId];

      if(!value || value >= currentTime) {
        if(message = this.sentMessages[messageId]) {
          //this.log('performScheduledRequest message:', message);
          const messageByteLength = (/* message.body.byteLength ||  */message.body.length) + 32;
          if(!message.notContentRelated &&
            lengthOverflow) {
            continue; // maybe break here
          }

          if(!message.notContentRelated &&
            messagesByteLen &&
            messagesByteLen + messageByteLength > 655360) { // 640 Kb
            this.log.warn('lengthOverflow', message);
            lengthOverflow = true;
            continue; // maybe break here
          }

          if(message.singleInRequest) {
            singlesCount++;
            if(singlesCount > 1) {
              continue; // maybe break here
            }
          }

          messages.push(message);
          messagesByteLen += messageByteLength;
          if(message.isAPI) {
            hasApiCall = true;
          } else if(message.longPoll) {
            hasHttpWait = true;
          }
        } else {
          // this.log(message, messageId)
        }

        delete this.pendingMessages[messageId];
      }
    }
  
    /// #if MTPROTO_HTTP_UPLOAD
    if(this.transport instanceof HTTP)
    /// #endif
    /// #if MTPROTO_HTTP || MTPROTO_HTTP_UPLOAD
    if(hasApiCall && !hasHttpWait) {
      const serializer = new TLSerialization({mtproto: true});
      serializer.storeMethod('http_wait', {
        max_delay: 500,
        wait_after: 150,
        max_wait: 3000
      });

      messages.push({
        msg_id: timeManager.generateId(),
        seq_no: this.generateSeqNo(),
        body: serializer.getBytes()
      });
    }
    /// #endif
  
    if(!messages.length) {
      // this.log('no scheduled messages')
      return;
    }
  
    const noResponseMsgs: Array<string> = [];
  
    if(messages.length > 1) {
      const container = new TLSerialization({
        mtproto: true,
        startMaxLength: messagesByteLen + 64
      });

      container.storeInt(0x73f1f8dc, 'CONTAINER[id]');
      container.storeInt(messages.length, 'CONTAINER[count]');

      const innerMessages: string[] = [];
      messages.forEach((message, i) => {
        container.storeLong(message.msg_id, 'CONTAINER[' + i + '][msg_id]');
        innerMessages.push(message.msg_id);
        container.storeInt(message.seq_no, 'CONTAINER[' + i + '][seq_no]');
        container.storeInt(message.body.length, 'CONTAINER[' + i + '][bytes]');
        container.storeRawBytes(message.body, 'CONTAINER[' + i + '][body]');
        if(message.noResponse) {
          noResponseMsgs.push(message.msg_id);
        }
      });
  
      const containerSentMessage: MTMessage = {
        msg_id: timeManager.generateId(),
        seq_no: this.generateSeqNo(true),
        container: true,
        inner: innerMessages
      };
  
      message = Object.assign({
        body: container.getBytes(true)
      }, containerSentMessage);
  
      this.sentMessages[message.msg_id] = containerSentMessage;
  
      if(Modes.debug || true) {
        this.log('Container', innerMessages, message.msg_id, message.seq_no);
      }
    } else {
      if(message.noResponse) {
        noResponseMsgs.push(message.msg_id);
      }

      this.sentMessages[message.msg_id] = message;
    }
  
    this.pendingAcks = [];

    const promise = this.sendEncryptedRequest(message);
    
    /// #if MTPROTO_HTTP_UPLOAD
    if(!(this.transport instanceof HTTP)) {
      if(noResponseMsgs.length) this.log.error('noResponseMsgs length!', noResponseMsgs);
      this.cleanupSent(); // ! WARNING
    } else {
      this.handleSentEncryptedRequestHTTP(promise, message, noResponseMsgs);
    }
    /// #elif !MTPROTO_HTTP
    //if(!(this.transport instanceof HTTP)) {
      if(noResponseMsgs.length) this.log.error('noResponseMsgs length!', noResponseMsgs);
      this.cleanupSent(); // ! WARNING
    //} else {
    /// #else
      this.handleSentEncryptedRequestHTTP(promise, message, noResponseMsgs);
    //}
    /// #endif 
  
    if(lengthOverflow || singlesCount > 1) {
      this.scheduleRequest();
    }
  };

  public async getEncryptedMessage(dataWithPadding: ArrayBuffer) {
    const msgKey = await this.getMsgKey(dataWithPadding, true);
    const keyIv = await this.getAesKeyIv(msgKey, true);
    // this.log('after msg key iv')

    const encryptedBytes = await CryptoWorker.aesEncrypt(dataWithPadding, keyIv[0], keyIv[1]);
    // this.log('Finish encrypt')

    return {
      bytes: encryptedBytes,
      msgKey: msgKey
    };
  }

  public getDecryptedMessage(msgKey: Uint8Array | number[], encryptedData: Uint8Array | number[]): Promise<ArrayBuffer> {
    // this.log('get decrypted start')
    return this.getAesKeyIv(msgKey, false).then((keyIv) => {
      // this.log('after msg key iv')
      return CryptoWorker.aesDecrypt(encryptedData, keyIv[0], keyIv[1]);
    });
  }

  public sendEncryptedRequest(message: MTMessage) {
    this.log.debug('Send encrypted', message, this.authKeyId);
    // console.trace()
    const data = new TLSerialization({
      startMaxLength: message.body.length + 2048
    });

    data.storeIntBytes(this.serverSalt, 64, 'salt');
    data.storeIntBytes(this.sessionId, 64, 'session_id');
  
    data.storeLong(message.msg_id, 'message_id');
    data.storeInt(message.seq_no, 'seq_no');
    
    data.storeInt(message.body.length, 'message_data_length');
    data.storeRawBytes(message.body, 'message_data');
  
    const dataBuffer = data.getBuffer();
  
    const paddingLength = (16 - (data.offset % 16)) + 16 * (1 + nextRandomInt(5));
    const padding = [...new Uint8Array(paddingLength).randomize()];
    //MTProto.secureRandom.nextBytes(padding);

    const dataWithPadding = bufferConcat(dataBuffer, padding);
    // this.log('Adding padding', dataBuffer, padding, dataWithPadding)
    // this.log('auth_key_id', bytesToHex(self.authKeyID))

    /* if(message.fileUpload) {
      this.log('Send encrypted: body length:', (message.body as ArrayBuffer).byteLength, paddingLength, dataWithPadding);
    } */
  
    return this.getEncryptedMessage(dataWithPadding).then((encryptedResult) => {
      this.log.debug('Got encrypted out message', encryptedResult);

      const request = new TLSerialization({
        startMaxLength: encryptedResult.bytes.length + 256
      });
      request.storeIntBytes(this.authKeyId, 64, 'auth_key_id');
      request.storeIntBytes(encryptedResult.msgKey, 128, 'msg_key');
      request.storeRawBytes(encryptedResult.bytes, 'encrypted_data');
  
      //var requestData = xhrSendBuffer ? request.getBuffer() : request.getBytes(true) as Uint8Array;
      const requestData = request.getBytes(true);

      const baseError = {
        code: 406,
        type: 'NETWORK_BAD_RESPONSE',
        transport: this.transport
      };

      /* if(message.fileUpload) {
        this.log('Send encrypted: requestData length:', requestData.length, requestData.length % 16, paddingLength % 16, paddingLength, data.offset);
      } */

      const promise = this.transport.send(requestData);
      /// #if !MTPROTO_HTTP && !MTPROTO_HTTP_UPLOAD
      /* if(!(this.transport instanceof HTTP)) */ return promise;
      /// #else
      if(!(this.transport instanceof HTTP)) return promise;

      return promise.then((result) => {
        if(!result || !result.byteLength) {
          return Promise.reject(baseError);
        }

        return result;
      }, (error) => {
        if(!error.message && !error.type) {
          error = Object.assign(baseError, {
          type: 'NETWORK_BAD_REQUEST',
          originalError: error
          });
        }
        return Promise.reject(error);
      });
      /// #endif
    });
  }

  public parseResponse(responseBuffer: Uint8Array) {
    //const perf = performance.now();
    this.log.debug('Start parsing response'/* , responseBuffer */);

    this.lastResponseTime = Date.now();

    const deserializer = new TLDeserialization(responseBuffer);
  
    const authKeyId = deserializer.fetchIntBytes(64, true, 'auth_key_id');
    if(!bytesCmp(authKeyId, this.authKeyId)) {
      throw new Error('[MT] Invalid server auth_key_id: ' + authKeyId.hex);
    }

    const msgKey = deserializer.fetchIntBytes(128, true, 'msg_key');
    const encryptedData = deserializer.fetchRawBytes(responseBuffer.byteLength - deserializer.getOffset(), true, 'encrypted_data');
  
    return this.getDecryptedMessage(msgKey, encryptedData).then((dataWithPadding) => {
      // this.log('after decrypt')
      return this.getMsgKey(dataWithPadding, false).then((calcMsgKey) => {
        if(!bytesCmp(msgKey, calcMsgKey)) {
          this.log.warn('[MT] msg_keys', msgKey, calcMsgKey);
          this.updateSession(); // fix 28.01.2020
          throw new Error('[MT] server msgKey mismatch, updating session');
        }
        // this.log('after msgKey check')
  
        let deserializer = new TLDeserialization(dataWithPadding, {mtproto: true});
  
        /* const salt =  */deserializer.fetchIntBytes(64, false, 'salt'); // need
        const sessionId = deserializer.fetchIntBytes(64, false, 'session_id');
        const messageId = deserializer.fetchLong('message_id');
  
        if(!bytesCmp(sessionId, this.sessionId) &&
          (!this.prevSessionId || !bytesCmp(sessionId, this.prevSessionId))) {
          this.log.warn('Sessions', sessionId, this.sessionId, this.prevSessionId, dataWithPadding);
          //this.updateSession();
          //this.sessionID = sessionID;
          throw new Error('[MT] Invalid server session_id: ' + bytesToHex(sessionId));
        }
  
        const seqNo = deserializer.fetchInt('seq_no');
  
        const totalLength = dataWithPadding.byteLength;
  
        const messageBodyLength = deserializer.fetchInt('message_data[length]');
        let offset = deserializer.getOffset();
  
        if((messageBodyLength % 4) ||
          messageBodyLength > totalLength - offset) {
          throw new Error('[MT] Invalid body length: ' + messageBodyLength);
        }
        const messageBody = deserializer.fetchRawBytes(messageBodyLength, true, 'message_data');
  
        offset = deserializer.getOffset();
        const paddingLength = totalLength - offset;
        if(paddingLength < 12 || paddingLength > 1024) {
          throw new Error('[MT] Invalid padding length: ' + paddingLength);
        }
  
        //let buffer = bytesToArrayBuffer(messageBody);
        deserializer = new TLDeserialization(/* buffer */messageBody, {
          mtproto: true, 
          override: {
            mt_message: (result: any, field: string) => {
              result.msg_id = deserializer.fetchLong(field + '[msg_id]');
              result.seqno = deserializer.fetchInt(field + '[seqno]');
              result.bytes = deserializer.fetchInt(field + '[bytes]');
  
              const offset = deserializer.getOffset();
  
              //self.log('mt_message!!!!!', result, field);
  
              try {
                result.body = deserializer.fetchObject('Object', field + '[body]');
              } catch(e) {
                this.log.error('parse error', e.message, e.stack);
                result.body = {
                  _: 'parse_error',
                  error: e
                };
              }

              if(deserializer.offset != offset + result.bytes) {
                // console.warn(dT(), 'set offset', this.offset, offset, result.bytes)
                // this.log(result)
                deserializer.offset = offset + result.bytes;
              }
              // this.log('override message', result)
            },
            mt_rpc_result: (result: any, field: any) => {
              result.req_msg_id = deserializer.fetchLong(field + '[req_msg_id]');
  
              const sentMessage = this.sentMessages[result.req_msg_id];
              const type = sentMessage && sentMessage.resultType || 'Object';
  
              if(result.req_msg_id && !sentMessage) {
                // console.warn(dT(), 'Result for unknown message', result);
                return;
              }
  
              result.result = deserializer.fetchObject(type, field + '[result]');
              // self.log(dT(), 'override rpc_result', sentMessage, type, result);
            }
          }
        });

        const response = deserializer.fetchObject('', 'INPUT');
        //this.log.error('Parse response time:', performance.now() - perf);
        return {
          response,
          messageId,
          sessionId: sessionId,
          seqNo
        };
      });
    });
  }

  public applyServerSalt(newServerSalt: string) {
    const serverSalt = longToBytes(newServerSalt);
  
    AppStorage.set({
      ['dc' + this.dcId + '_server_salt']: bytesToHex(serverSalt)
    });
  
    this.serverSalt = serverSalt;
  }

  public scheduleRequest(delay = 0) {
    /// #if !MTPROTO_HTTP && !MTPROTO_HTTP_UPLOAD
    /* clearTimeout(this.nextReqTimeout);
    this.nextReqTimeout = self.setTimeout(this.performScheduledRequest.bind(this), delay || 0);
    return; */
    return this.performScheduledRequest();
    /// #else
    if(!(this.transport instanceof HTTP)) return this.performScheduledRequest();
    if(this.offline/*  && this.transport instanceof HTTP */) {
      this.checkConnection('forced schedule');
    }

    /* if(delay && !(this.transport instanceof HTTP)) {
      delay = 0;
    } */

    var nextReq = Date.now() + delay;
  
    if(delay && this.nextReq && this.nextReq <= nextReq) {
      return false;
    }
  
    // this.log('schedule req', delay)
    // console.trace()
  
    clearTimeout(this.nextReqTimeout);
    this.nextReqTimeout = 0;
    if(delay > 0) {
      this.nextReqTimeout = self.setTimeout(this.performScheduledRequest, delay || 0);
    } else {
      setTimeout(this.performScheduledRequest, 0);
    }
  
    this.nextReq = nextReq;
    /// #endif
  }

  public ackMessage(msgId: string) {
    // this.log('ack message', msgID)
    this.pendingAcks.push(msgId);
    this.scheduleRequest(30000);
  }
  
  public reqResendMessage(msgId: string) {
    this.log('Req resend', msgId);
    this.pendingResends.push(msgId);
    this.scheduleRequest(100);
  }

  public cleanupSent() {
    let notEmpty = false;
    // this.log('clean start', this.dcId/*, this.sentMessages*/)
    Object.keys(this.sentMessages).forEach((msgId) => {
      const message = this.sentMessages[msgId];
    
      // this.log('clean iter', msgID, message)
      if(message.notContentRelated && this.pendingMessages[msgId] === undefined) {
        // this.log('clean notContentRelated', msgID)
        delete this.sentMessages[msgId];
      } else if(message.container) {
        for(const innerMsgId of message.inner) {
          if(this.sentMessages[innerMsgId] !== undefined) {
            // this.log('clean failed, found', msgID, message.inner[i], this.sentMessages[message.inner[i]].seq_no)
            notEmpty = true;
            return;
          }
        }
        // this.log('clean container', msgID)
        delete this.sentMessages[msgId];
      } else {
        notEmpty = true;
      }
    });
  
    return !notEmpty;
  }

  public processMessageAck(messageId: string) {
    const sentMessage = this.sentMessages[messageId];
    if(sentMessage && !sentMessage.acked) {
      delete sentMessage.body;
      sentMessage.acked = true;
  
      return true;
    }
  
    return false;
  }

  public processError(rawError: {error_message: string, error_code: number}) {
    const matches = (rawError.error_message || '').match(/^([A-Z_0-9]+\b)(: (.+))?/) || [];
    rawError.error_code = rawError.error_code;
  
    return {
      code: !rawError.error_code || rawError.error_code <= 0 ? 500 : rawError.error_code,
      type: matches[1] || 'UNKNOWN',
      description: matches[3] || ('CODE#' + rawError.error_code + ' ' + rawError.error_message),
      originalError: rawError
    };
  }

  /**
   * только для сокета, возможно это будет неправильно работать, но в тесте сработало правильно
   */
  public resend() {
    for(const id in this.sentMessages) {
      const msg = this.sentMessages[id];
      if(msg.body) {
        this.pushResend(id);
      }
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
    }).then(res => {
      this.log('status', res);
    });
  } */

  // * https://core.telegram.org/mtproto/service_messages_about_messages#notice-of-ignored-error-message
  public processMessage(message: any, messageId: string, sessionId: Uint8Array | number[]) {
    if(message._ == 'messageEmpty') {
      this.log.warn('processMessage: messageEmpty', message, messageId);
      return;
    }

    const msgidInt = parseInt(messageId.substr(0, -10), 10);
    if(msgidInt % 2) {
      this.log.warn('Server even message id: ', messageId, message);
      return;
    }

    this.log.debug('process message', message, messageId, sessionId);

    switch(message._) {
      case 'msg_container': {
        for(const innerMessage of message.messages) {
          this.processMessage(innerMessage, innerMessage.msg_id, sessionId);
        }

        break;
      }
  
      case 'bad_server_salt': {
        this.log('Bad server salt', message);

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
        this.log.error('Bad msg notification', message);

        if(message.error_code == 16 || message.error_code == 17) {
          const changedOffset = timeManager.applyServerTime(bigStringInt(messageId).shiftRight(32).toString(10));
          if(message.error_code == 17 || changedOffset) {
            this.log('Update session');
            this.updateSession();
          }

          const badMessage = this.updateSentMessage(message.bad_msg_id);
          if(badMessage) this.pushResend(badMessage.msg_id); // fix 23.01.2020
          this.ackMessage(messageId);
        }

        break;
      }
  
      case 'message': {
        if(this.lastServerMessages.indexOf(messageId) != -1) {
          // console.warn('[MT] Server same messageId: ', messageId)
          this.ackMessage(messageId);
          return;
        }

        this.lastServerMessages.push(messageId);
        if(this.lastServerMessages.length > 100) {
          this.lastServerMessages.shift();
        }

        this.processMessage(message.body, message.msg_id, sessionId);
        break;
      }
        
  
      case 'new_session_created': {
        this.ackMessage(messageId);

        this.log.debug('new_session_created', message);
        //this.updateSession();
  
        this.processMessageAck(message.first_msg_id);
        this.applyServerSalt(message.server_salt);
  
        AppStorage.get<number>('dc').then((baseDcId: number) => {
          if(baseDcId == this.dcId && !this.isFileNetworker && NetworkerFactory.updatesProcessor) {
            NetworkerFactory.updatesProcessor(message, true);
          }
        });
        break;
      }
        
      case 'msgs_ack': {
        for(const msgId of message.msg_ids) {
          this.processMessageAck(msgId);
        }

        break;
      }
  
      case 'msg_detailed_info':
        if(!this.sentMessages[message.msg_id]) {
          this.ackMessage(message.answer_msg_id);
          break;
        }
      case 'msg_new_detailed_info':
        if(this.pendingAcks.indexOf(message.answer_msg_id)) {
          break;
        }
        this.reqResendMessage(message.answer_msg_id);
        break;
  
      case 'msgs_state_info': {
        this.ackMessage(message.answer_msg_id);
        if(this.lastResendReq && 
          this.lastResendReq.req_msg_id == message.req_msg_id && 
          this.pendingResends.length
        ) {
          for(const badMsgId of this.lastResendReq.resend_msg_ids) {
            const pos = this.pendingResends.indexOf(badMsgId);
            if(pos != -1) {
              this.pendingResends.splice(pos, 1);
            }
          }
        }

        break;
      }

      case 'rpc_result': {
        this.ackMessage(messageId);
  
        const sentMessageId = message.req_msg_id;
        const sentMessage = this.sentMessages[sentMessageId];

        this.processMessageAck(sentMessageId);
        if(sentMessage) {
          const deferred = sentMessage.deferred;
          if(message.result._ == 'rpc_error') {
            const error = this.processError(message.result);
            this.log('Rpc error', error);
            if(deferred) {
              deferred.reject(error);
            }
          } else {
            if(deferred) {
              if(Modes.debug) {
                this.log.debug('Rpc response', message.result);
              } else {
                let dRes = message.result._;
                if(!dRes) {
                  if(message.result.length > 5) {
                    dRes = '[..' + message.result.length + '..]';
                  } else {
                    dRes = message.result;
                  }
                }

                this.log.debug('Rpc response', dRes, sentMessage);
              }

              sentMessage.deferred.resolve(message.result);
            }

            if(sentMessage.isAPI && !this.connectionInited) {
              this.connectionInited = true;
              ////this.log('Rpc set connectionInited to:', this.connectionInited);
            }
          }
  
          delete this.sentMessages[sentMessageId];
        } else {
          this.log('Rpc result for unknown message:', sentMessageId);
        }

        break;
      }
  
      default:
        this.ackMessage(messageId);

        this.log.debug('Update', message);
        
        if(NetworkerFactory.updatesProcessor !== null) {
          NetworkerFactory.updatesProcessor(message, true);
        }
        break;
    }
  }
}
