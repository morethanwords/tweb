import MTTransport from './transport';

//import abridgetPacketCodec from './abridged';
import intermediatePacketCodec from './intermediate';
import MTPNetworker from '../networker';
import { logger, LogLevels } from '../../logger';
import Obfuscation from './obfuscation';
import { DEBUG, Modes } from '../mtproto_config';
//import { debounce } from '../../../helpers/schedulers';

export default class Socket extends MTTransport {
  ws: WebSocket;

  pending: Array<Partial<{
    resolve: any, 
    reject: any, 
    body: Uint8Array, 
    bodySent: boolean
  }>> = [];
  
  connected = false;
  
  transport = 'websocket';

  obfuscation = new Obfuscation();

  networker: MTPNetworker;

  log: ReturnType<typeof logger>;

  codec = intermediatePacketCodec;

  lastCloseTime: number;

  debug = Modes.debug;
  //releasePendingDebounced: () => void;

  constructor(dcId: number, url: string, logSuffix: string, public retryTimeout: number) {
    super(dcId, url);

    let logLevel = LogLevels.error | LogLevels.log;
    if(this.debug) logLevel |= LogLevels.debug;
    this.log = logger(`WS-${dcId}` + logSuffix, logLevel);
    this.log('constructor');
    this.connect();
    //this.releasePendingDebounced = debounce(() => this.releasePending(true), 2000, false, true);
  }
  
  connect = () => {
    if(this.ws) {
      this.ws.removeEventListener('open', this.handleOpen);
      this.ws.removeEventListener('close', this.handleClose);
      this.ws.removeEventListener('error', this.handleError);
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.close(1000);
    }

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

  handleClose = (event: CloseEvent) => {
    this.log('closed', event, this.pending, this.ws.bufferedAmount);
    this.connected = false;

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
    this.debug && this.log.debug('<-', 'handleMessage', event);

    let data = this.obfuscation.decode(new Uint8Array(event.data));
    data = this.codec.readPacket(data);

    if(this.networker) { // authenticated!
      //this.pending = this.pending.filter(p => p.body); // clear pending

      this.debug && this.log.debug('redirecting to networker');
      return this.networker.parseResponse(data).then(response => {
        this.debug && this.log.debug('redirecting to networker response:', response);
        this.networker.processMessage(response.response, response.messageId, response.sessionId);
      });
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
  }

  releasePending(/* tt = false */) {
    if(!this.connected) {
      //this.connect();
      return;
    }

    /* if(!tt) {
      this.releasePendingDebounced();
      return;
    } */

    //this.log.error('Pending length:', this.pending.length);
    let length = this.pending.length;
    //for(let i = length - 1; i >= 0; --i) {
    for(let i = 0; i < length; ++i) {
      const pending = this.pending[i];
      const {body, bodySent} = pending;
      if(body && !bodySent) {
        const toEncode = this.codec.encodePacket(body);

        //this.log('send before obf:', /* body.hex, nonce.hex, */ toEncode.hex);
        const enc = this.obfuscation.encode(toEncode);
        //this.log('send after obf:', enc.hex);

        this.debug && this.log.debug('-> body length to send:', enc.length, this.ws.bufferedAmount);
        /* if(this.ws.bufferedAmount) {
          this.log.error('bufferedAmount:', this.ws.bufferedAmount);
        } */

        if(this.ws.readyState !== this.ws.OPEN) {
          this.log.error('ws is closed?');
          this.connected = false;
          break;
        }

        this.ws.send(enc);
        
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
  