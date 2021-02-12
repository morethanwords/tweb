import MTTransport from './transport';

//import abridgedPacketCodec from './abridged';
import intermediatePacketCodec from './intermediate';
import MTPNetworker from '../networker';
import { logger, LogLevels } from '../../logger';
import Obfuscation from './obfuscation';
import { DEBUG, Modes } from '../mtproto_config';

export default class Socket extends MTTransport {
  public ws: WebSocket;

  private pending: Array<Partial<{
    resolve: any, 
    reject: any, 
    body: Uint8Array, 
    bodySent: boolean
  }>> = [];
  
  public connected = false;
  private codec = intermediatePacketCodec;
  private log: ReturnType<typeof logger>;
  private obfuscation = new Obfuscation();
  public networker: MTPNetworker;

  private lastCloseTime: number;

  private debug = Modes.debug && false;
  //private releasePendingDebounced: () => void;

  /* private stream: Array<any>;
  private canRead: Promise<any>;
  private resolveRead: () => void; */
  //private lol: Uint8Array[] = [];
  //private dd: () => void;

  //private debugPayloads: MTPNetworker['debugRequests'] = [];

  constructor(dcId: number, url: string, logSuffix: string, public retryTimeout: number) {
    super(dcId, url);

    let logLevel = LogLevels.error | LogLevels.log;
    if(this.debug) logLevel |= LogLevels.debug;
    this.log = logger(`WS-${dcId}` + logSuffix, logLevel);
    this.log('constructor');
    this.connect();
    //this.releasePendingDebounced = debounce(() => this.releasePending(true), 200, false, true);

    /* this.dd = debounce(() => {
      if(this.connected && this.lol.length) {
        this.ws.send(this.lol.shift());

        if(this.lol.length) {
          this.dd();
        }
      }
    }, 100, false, true); */
  }

  private removeListeners() {
    this.ws.removeEventListener('open', this.handleOpen);
    this.ws.removeEventListener('close', this.handleClose);
    this.ws.removeEventListener('error', this.handleError);
    this.ws.removeEventListener('message', this.handleMessage);
  }
  
  connect = () => {
    if(this.ws) {
      this.removeListeners();
      this.ws.close(1000);
    }

    /* this.stream = [];
    this.canRead = new Promise<void>(resolve => {
      this.resolveRead = resolve;
    }); */

    this.ws = new WebSocket(this.url, 'binary');
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', this.handleOpen);
    this.ws.addEventListener('close', this.handleClose);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('message', this.handleMessage);
  };
  
  handleOpen = () => {
    this.log('opened');

    this.debug && this.log.debug('sending init packet');
    this.ws.send(this.obfuscation.init(this.codec));

    //setTimeout(() => {
      this.connected = true;

      this.releasePending();

      if(this.networker) {
        this.networker.setConnectionStatus(true);

        if(this.lastCloseTime) {
          this.networker.cleanupSent();
          this.networker.resend();
        }
      }
    //}, 3e3);
  };

  handleError = (e: Event) => {
    this.log.error(e);
  };

  handleClose = () => {
    this.log('closed'/* , event, this.pending, this.ws.bufferedAmount */);
    this.connected = false;
    this.removeListeners();

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
  };

  handleMessage = (event: MessageEvent) => {
    this.debug && this.log.debug('<-', 'handleMessage', /* event,  */event.data.byteLength);

    let data = this.obfuscation.decode(new Uint8Array(event.data));
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
  };

  send = (body: Uint8Array) => {
    this.debug && this.log.debug('-> body length to pending:', body.length);

    //return;

    if(this.networker) {
      this.pending.push({body});
      this.releasePending();
    } else {
      const promise = new Promise<Uint8Array>((resolve, reject) => {
        this.pending.push({resolve, reject, body});
      });

      this.releasePending();

      return promise;
    }
  };

  releasePending(/* tt = false */) {
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
      if(body && !bodySent) {
        const toEncode = this.codec.encodePacket(body);

        //this.log('send before obf:', /* body.hex, nonce.hex, */ toEncode.hex);
        const enc = this.obfuscation.encode(toEncode);
        //this.log('send after obf:', enc.hex);

        //this.debugPayloads.push({before: body.slice(), after: enc});

        this.debug && this.log.debug('-> body length to send:', enc.length, this.ws.bufferedAmount);
        /* if(this.ws.bufferedAmount) {
          this.log.error('bufferedAmount:', this.ws.bufferedAmount);
        } */

        /* if(this.ws.readyState !== this.ws.OPEN) {
          this.log.error('ws is closed?');
          this.connected = false;
          break;
        } */

        //this.lol.push(enc);
        //setTimeout(() => {
          this.ws.send(enc);
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
  