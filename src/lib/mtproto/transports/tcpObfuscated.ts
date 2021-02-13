import Modes from "../../../config/modes";
import { logger, LogLevels } from "../../logger";
import MTPNetworker from "../networker";
import Obfuscation from "./obfuscation";
import MTTransport from "./transport";
import Socket from "./websocket";
import intermediatePacketCodec from './intermediate';

export default class TcpObfuscated implements MTTransport {
  private codec = intermediatePacketCodec;
  private obfuscation = new Obfuscation();
  public networker: MTPNetworker;

  private pending: Array<Partial<{
    resolve: any, 
    reject: any, 
    body: Uint8Array, 
    encoded?: Uint8Array,
    bodySent: boolean
  }>> = [];

  private debug = Modes.debug && false;

  private log: ReturnType<typeof logger>;

  public connected = false;

  private lastCloseTime: number;

  private socket: Socket;

  //private debugPayloads: MTPNetworker['debugRequests'] = [];

  constructor(private dcId: number, private url: string, private logSuffix: string, public retryTimeout: number) {
    let logLevel = LogLevels.error | LogLevels.log;
    if(this.debug) logLevel |= LogLevels.debug;
    this.log = logger(`WS-${dcId}` + logSuffix, logLevel);
    this.log('constructor');
    
    this.connect();
  }

  private connect() {
    this.socket = new Socket(this.dcId, this.url, this.logSuffix);

    this.socket.addListener('open', () => {
      this.connected = true;

      const initPayload = this.obfuscation.init(this.codec);

      if(this.networker) {
        this.networker.setConnectionStatus(true);

        if(this.lastCloseTime) {
          this.networker.cleanupSent();
          this.networker.resend();
        }
      }

      setTimeout(() => {
        this.releasePending();
      }, 0);

      this.socket.send(initPayload);
    });

    this.socket.addListener('message', (buffer) => {
      let data = this.obfuscation.decode(new Uint8Array(buffer));
      data = this.codec.readPacket(data);

      if(this.networker) { // authenticated!
        //this.pending = this.pending.filter(p => p.body); // clear pending

        this.debug && this.log.debug('redirecting to networker', data.length);
        this.networker.parseResponse(data).then(response => {
          this.debug && this.log.debug('redirecting to networker response:', response);

          try {
            this.networker.processMessage(response.response, response.messageId, response.sessionId);
          } catch(err) {
            this.log.error('handleMessage networker processMessage error', err);
          }

          //this.releasePending();
        }).catch(err => {
          this.log.error('handleMessage networker parseResponse error', err);
        });

        //this.dd();
        return;
      }

      //console.log('got hex:', data.hex);
      const pending = this.pending.shift();
      if(!pending) {
        this.debug && this.log.debug('no pending for res:', data.hex);
        return;
      }

      pending.resolve(data);
    });

    this.socket.addListener('close', () => {
      this.connected = false;
      this.socket = undefined;

      const time = Date.now();
      const diff = time - this.lastCloseTime;
      const needTimeout = !isNaN(diff) && diff < this.retryTimeout ? this.retryTimeout - diff : 0;

      if(this.networker) {
        this.networker.setConnectionStatus(false);
      }

      this.log('will try to reconnect after timeout:', needTimeout / 1000);
      setTimeout(() => {
        this.log('trying to reconnect...');
        this.lastCloseTime = Date.now();
        
        for(const pending of this.pending) {
          if(pending.bodySent) {
            pending.bodySent = false;
          }
        }

        this.connect();
      }, needTimeout);
    });
  }

  private encodeBody = (body: Uint8Array) => {
    const toEncode = this.codec.encodePacket(body);

    //this.log('send before obf:', /* body.hex, nonce.hex, */ toEncode.hex);
    const encoded = this.obfuscation.encode(toEncode);
    //this.log('send after obf:', enc.hex);

    return encoded;
  };

  public send = (body: Uint8Array) => {
    this.debug && this.log.debug('-> body length to pending:', body.length);

    const encoded: typeof body = this.connected ? this.encodeBody(body) : undefined;

    //return;

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
  };

  private releasePending(/* tt = false */) {
    if(!this.connected) {
      //this.connect();
      return;
    }

    /* if(!tt) {
      this.releasePendingDebounced();
      return;
    } */

    //this.log('-> messages to send:', this.pending.length);
    let length = this.pending.length;
    //for(let i = length - 1; i >= 0; --i) {
    for(let i = 0; i < length; ++i) {
      /* if(this.ws.bufferedAmount) {
        break;
      } */

      const pending = this.pending[i];
      const {body, bodySent} = pending;
      let encoded = pending.encoded;
      if(body && !bodySent) {

        //this.debugPayloads.push({before: body.slice(), after: enc});

        this.debug && this.log.debug('-> body length to send:', body.length);
        /* if(this.ws.bufferedAmount) {
          this.log.error('bufferedAmount:', this.ws.bufferedAmount);
        } */

        /* if(this.ws.readyState !== this.ws.OPEN) {
          this.log.error('ws is closed?');
          this.connected = false;
          break;
        } */

        if(!encoded) {
          encoded = this.encodeBody(body);
        }

        //this.lol.push(body);
        //setTimeout(() => {
          this.socket.send(encoded);
        //}, 100);
        //this.dd();
        
        if(!pending.resolve) { // remove if no response needed
          this.pending.splice(i--, 1);
          length--;
        } else {
          pending.bodySent = true;
        }

        //delete pending.body;
      }
    }
  }
}
