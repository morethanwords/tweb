import Modes from '@config/modes';
import {logger, LogTypes} from '@lib/logger';
import MTPNetworker from '@lib/mtproto/networker';
import Obfuscation from '@lib/mtproto/transports/obfuscation';
import MTTransport, {MTConnection, MTConnectionConstructable} from '@lib/mtproto/transports/transport';
// import intermediatePacketCodec from '@lib/mtproto/transports/intermediate';
import abridgedPacketCodec from '@lib/mtproto/transports/abridged';
import paddedIntermediatePacketCodec from '@lib/mtproto/transports/padded';
import {ConnectionStatus} from '@lib/mtproto/connectionStatus';
import transportController from '@lib/mtproto/transports/controller';
import bytesToHex from '@helpers/bytes/bytesToHex';
// import networkStats from '@lib/mtproto/networkStats';
import ctx from '@environment/ctx';

/** Extra behaviour for the Electron raw-TCP bridge: stream reframing + MTProxy obfuscation. */
export type TcpObfuscatedOptions = {
  /**
   * Reframe the incoming byte stream into discrete MTProto packets. Required for raw TCP
   * (chunk boundaries are arbitrary); a no-op for Telegram's WebSocket where each message
   * is already exactly one packet.
   */
  streamFramed?: boolean;
  /** MTProxy obfuscation: secret-keyed AES + embedded target DC id + padded framing flag. */
  mtproto?: {
    secret: Uint8Array,
    dcId: number,
    padded: boolean
  };
};

export default class TcpObfuscated implements MTTransport {
  private codec = abridgedPacketCodec;
  private obfuscation = new Obfuscation();
  public networker: MTPNetworker;

  private streamFramed: boolean;
  private mtproto: TcpObfuscatedOptions['mtproto'];
  private recvBuffer: Uint8Array;
  private recvChain: Promise<void>;

  private pending: Array<Partial<{
    resolve: any,
    reject: any,
    body: Uint8Array,
    encoded?: Uint8Array,
    bodySent: boolean
  }>> = [];

  private debug = Modes.debug && false/* true */;
  private log: ReturnType<typeof logger>;
  public connected = false;
  private lastCloseTime: number;
  public connection: MTConnection;

  private autoReconnect = true;
  private reconnectTimeout: number;
  private releasingPending: boolean;

  // private debugPayloads: MTPNetworker['debugRequests'] = [];

  constructor(
    private Connection: MTConnectionConstructable,
    private dcId: number,
    private url: string,
    private logSuffix: string,
    private retryTimeout: number,
    options?: TcpObfuscatedOptions
  ) {
    this.streamFramed = !!options?.streamFramed;
    this.mtproto = options?.mtproto;
    if(this.mtproto?.padded) {
      this.codec = paddedIntermediatePacketCodec;
    }

    let logTypes = LogTypes.Error | LogTypes.Log;
    if(this.debug) logTypes |= LogTypes.Debug;
    this.log = logger(`TCP-${dcId}` + logSuffix, logTypes);
    this.log('constructor');

    this.connect();
  }

  private onOpen = async() => {
    this.connected = true;

    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      transportController.setTransportOpened('websocket');
    }

    const initPayload = await this.obfuscation.init(
      this.codec,
      this.mtproto ? {secret: this.mtproto.secret, dcId: this.mtproto.dcId} : undefined
    );
    if(!this.connected) {
      return;
    }

    this.connection.send(initPayload);

    if(this.networker) {
      this.pending.length = 0; // ! clear queue and reformat messages to container, because if sending simultaneously 10+ messages, connection will die
      this.networker.onTransportOpen();
    }/*  else {
      for(const pending of this.pending) {
        if(pending.encoded && pending.body) {
          pending.encoded = this.encodeBody(pending.body);
        }
      }
    } */

    setTimeout(() => {
      this.releasePending();
    }, 0);
  };

  private onMessage = (buffer: ArrayBuffer) => {
    if(this.streamFramed) {
      // Raw TCP: chunk boundaries are arbitrary, so serialize decoding (CTR state is
      // order-sensitive) and reframe the decrypted stream into MTProto packets.
      this.recvChain = (this.recvChain || Promise.resolve()).then(() => this.handleStreamChunk(buffer));
      return;
    }

    return this.handleMessage(buffer);
  };

  private async handleMessage(buffer: ArrayBuffer) {
    // networkStats.addReceived(this.dcId, buffer.byteLength);

    const time = Date.now();
    let data = await this.obfuscation.decode(new Uint8Array(buffer));
    data = this.codec.readPacket(data);

    this.dispatchPacket(data, time);
  }

  private async handleStreamChunk(buffer: ArrayBuffer) {
    const time = Date.now();
    const decoded = await this.obfuscation.decode(new Uint8Array(buffer));

    this.recvBuffer = this.recvBuffer?.length ? this.recvBuffer.concat(decoded) : decoded;

    const readPacketLength = this.codec.readPacketLength.bind(this.codec);
    while(this.recvBuffer.length) {
      const total = readPacketLength(this.recvBuffer);
      if(total < 0 || this.recvBuffer.length < total) {
        break;
      }

      const packet = this.recvBuffer.subarray(0, total);
      const data = this.codec.readPacket(packet);
      this.recvBuffer = this.recvBuffer.slice(total);

      this.dispatchPacket(data, time);
    }
  }

  private dispatchPacket(data: Uint8Array, time: number) {
    if(this.networker) { // authenticated!
      this.networker.onTransportData(data, time);
      return;
    }

    // console.log('got hex:', data.hex);
    const pending = this.pending.shift();
    if(!pending) {
      this.debug && this.log.debug('no pending for res:', bytesToHex(data));
      return;
    }

    pending.resolve(data);
  }

  private onClose = () => {
    this.clear();

    let needTimeout: number, retryAt: number;
    if(this.autoReconnect) {
      const time = Date.now();
      const diff = time - this.lastCloseTime;
      needTimeout = !isNaN(diff) && diff < this.retryTimeout ? this.retryTimeout - diff : 0;
      retryAt = time + needTimeout;
    }

    if(this.networker) {
      this.networker.setConnectionStatus(ConnectionStatus.Closed, retryAt);
      this.pending.length = 0;
    }

    if(this.autoReconnect) {
      this.log('will try to reconnect after timeout:', needTimeout / 1000);
      this.reconnectTimeout = ctx.setTimeout(this.reconnect, needTimeout);
    } else {
      this.log('reconnect isn\'t needed');
    }
  };

  public clear() {
    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      if(this.connected) {
        transportController.setTransportClosed('websocket');
      }
    }

    this.connected = false;

    // Drop any half-assembled stream so a reconnect re-frames from scratch.
    this.recvBuffer = undefined;
    this.recvChain = undefined;

    if(this.connection) {
      this.connection.removeEventListener('open', this.onOpen);
      this.connection.removeEventListener('close', this.onClose);
      this.connection.removeEventListener('message', this.onMessage);
      this.connection = undefined;
    }
  }

  /**
   * invoke only when closed
   */
  public reconnect = () => {
    if(this.reconnectTimeout !== undefined) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if(this.connection) {
      return;
    }

    this.log('trying to reconnect...');
    this.lastCloseTime = Date.now();

    if(!this.networker) {
      for(const pending of this.pending) {
        if(pending.bodySent) {
          pending.bodySent = false;
        }
      }
    } else {
      this.networker.setConnectionStatus(ConnectionStatus.Connecting);
    }

    this.connect();
  }

  public forceReconnect() {
    this.close();
    this.reconnect();
  }

  public destroy() {
    this.setAutoReconnect(false);
    this.close();

    if(this.obfuscation) {
      this.obfuscation.destroy();
    }

    this.pending.forEach((pending) => {
      if(pending.reject) {
        pending.reject();
      }
    });
    this.pending.length = 0;
  }

  public close() {
    const connection = this.connection;
    if(connection) {
      const connected = this.connected;
      this.clear();
      if(connected) { // wait for buffered messages if they are there
        connection.addEventListener('message', this.onMessage);
        connection.addEventListener('close', () => {
          connection.removeEventListener('message', this.onMessage);
        }, {once: true});
        connection.close();
      }
    }
  }

  /**
   * Will connect if enable and disconnected \
   * Will reset reconnection timeout if disable
   */
  public setAutoReconnect(enable: boolean) {
    this.autoReconnect = enable;

    if(!enable) {
      if(this.reconnectTimeout !== undefined) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = undefined;
      }
    } else if(!this.connection && this.reconnectTimeout === undefined) {
      this.reconnect();
    }
  }

  private connect() {
    if(this.connection) {
      this.close();
    }

    this.connection = new this.Connection(this.dcId, this.url, this.logSuffix);
    this.connection.addEventListener('open', this.onOpen);
    this.connection.addEventListener('close', this.onClose);
    this.connection.addEventListener('message', this.onMessage);
  }

  public changeUrl(url: string) {
    if(this.url === url) {
      return;
    }

    this.url = url;
    this.forceReconnect();
  }

  private encodeBody(body: Uint8Array) {
    const toEncode = this.codec.encodePacket(body);

    // this.log('send before obf:', /* body.hex, nonce.hex, */ toEncode.hex);
    const encoded = this.obfuscation.encode(toEncode);
    // this.log('send after obf:', enc.hex);

    return encoded;
  }

  public send(body: Uint8Array) {
    this.debug && this.log.debug('-> body length to pending:', body.length);

    const encoded: typeof body = /* this.connected ? this.encodeBody(body) :  */undefined;

    // return;

    if(this.networker) {
      this.pending.push({body, encoded});
      this.releasePending();
    } else {
      const promise = new Promise<typeof body>((resolve, reject) => {
        this.pending.push({resolve, reject, body, encoded});
      });

      this.releasePending();

      return promise;
    }
  }

  private async releasePending(/* tt = false */) {
    if(!this.connected || this.releasingPending) {
      // this.connect();
      return;
    }

    this.releasingPending = true;

    /* if(!tt) {
      this.releasePendingDebounced();
      return;
    } */

    // this.log('-> messages to send:', this.pending.length);
    let length = this.pending.length;
    let sent = false;
    // for(let i = length - 1; i >= 0; --i) {
    for(let i = 0; i < length; ++i) {
      const pending = this.pending[i];
      if(!pending) {
        break;
      }

      const {body, bodySent} = pending;
      if(body && !bodySent) {
        // this.debugPayloads.push({before: body.slice(), after: enc});

        this.debug && this.log.debug('-> body length to send:', body.length);

        // if(!encoded) {
        //   encoded = pending.encoded = this.encodeBody(body);
        // }

        const encoded = pending.encoded ??= await this.encodeBody(body);
        if(!this.connected) {
          break;
        }

        // networkStats.addSent(this.dcId, encoded.byteLength);
        this.connection.send(encoded);

        if(!pending.resolve) { // remove if no response needed
          this.pending.splice(i--, 1);
          length--;
        } else {
          pending.bodySent = true;
        }

        sent = true;
        // delete pending.body;
      }
    }

    this.releasingPending = undefined;

    if(this.pending.length && sent) {
      this.releasePending();
    }
  }
}
