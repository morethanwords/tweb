import MTTransport from './transport';

//import aesjs from 'aes-js';
import {CTR} from '@cryptography/aes';
//import abridgetPacketCodec from './abridged';
import intermediatePacketCodec from './intermediate';
import {MTPNetworker} from '../networker';
import { logger } from '../../polyfill';
import { bytesFromWordss } from '../../bin_utils';
import { Codec } from './codec';

/* 
@cryptography/aes не работает с массивами которые не кратны 4, поэтому использую intermediate а не abridged
*/
export class Obfuscation {
  /* public enc: aesjs.ModeOfOperation.ModeOfOperationCTR;
  public dec: aesjs.ModeOfOperation.ModeOfOperationCTR; */

  public encNew: CTR;
  public decNew: CTR;

  public init(codec: Codec) {
    const initPayload = new Uint8Array(64);
    initPayload.randomize();
    
    while(true) {
      let val = (initPayload[3] << 24) | (initPayload[2] << 16) | (initPayload[1] << 8) | (initPayload[0]);
      let val2 = (initPayload[7] << 24) | (initPayload[6] << 16) | (initPayload[5] << 8) | (initPayload[4]);
      if(initPayload[0] != 0xef &&
          val != 0x44414548 &&
          val != 0x54534f50 &&
          val != 0x20544547 &&
          val != 0x4954504f &&
          val != 0xeeeeeeee &&
          val != 0xdddddddd &&
          val2 != 0x00000000) {
          //initPayload[56] = initPayload[57] = initPayload[58] = initPayload[59] = transport;
          break;
      }
      initPayload.randomize();
    }

    ////////////////////////initPayload.subarray(60, 62).hex = dcID;

    const reversedPayload = initPayload.slice().reverse();

    let encKey = initPayload.slice(8, 40);
    let encIv = initPayload.slice(40, 56);
    let decKey = reversedPayload.slice(8, 40);
    let decIv = reversedPayload.slice(40, 56);

    /* this.enc = new aesjs.ModeOfOperation.ctr(encKey, new aesjs.Counter(encIv as any));
    this.dec = new aesjs.ModeOfOperation.ctr(decKey, new aesjs.Counter(decIv as any)); */

    this.encNew = new CTR(encKey, encIv);
    this.decNew = new CTR(decKey, decIv);

    initPayload.set(intermediatePacketCodec.obfuscateTag, 56);
    const encrypted = this.encode(initPayload);

    initPayload.set(encrypted.slice(56, 64), 56);

    return initPayload;
  }

  /* public encode(payload: Uint8Array) {
    let res = this.enc.encrypt(payload);

    try {
      let arr = this.encNew.encrypt(payload);
      //let resNew = bytesFromWords({words: arr, sigBytes: arr.length});
      let resNew = new Uint8Array(bytesFromWordss(arr));
      console.log('Obfuscation: encode comparison:', res, arr, resNew, res.hex == resNew.hex);
    } catch(err) {
      console.error('Obfuscation: error:', err);
    }
    
    return res;
  }

  public decode(payload: Uint8Array) {
    let res = this.dec.encrypt(payload);

    try {
      let arr = this.decNew.decrypt(payload);
      //let resNew = bytesFromWords({words: arr, sigBytes: arr.length});
      let resNew = new Uint8Array(bytesFromWordss(arr));
      console.log('Obfuscation: decode comparison:', res, arr, resNew, res.hex == resNew.hex);
    } catch(err) {
      console.error('Obfuscation: error:', err);
    }
    
    return res;
  } */
  public encode(payload: Uint8Array) {
    let res = this.encNew.encrypt(payload);
    let bytes = new Uint8Array(bytesFromWordss(res));
    
    return bytes;
  }

  public decode(payload: Uint8Array) {
    let res = this.decNew.decrypt(payload);
    let bytes = new Uint8Array(bytesFromWordss(res));
    
    return bytes;
  }
}

export default class Socket extends MTTransport {
  ws: WebSocket | undefined;

  pending: Array<{resolve?: any, reject?: any, body?: Uint8Array}> = [];
  
  connected = false;
  
  transport = 'websocket';

  obfuscation = new Obfuscation();

  networker: MTPNetworker;

  log: ReturnType<typeof logger>;

  debug = false;

  codec = intermediatePacketCodec;

  constructor(dcID: number, url: string) {
    super(dcID, url);

    this.log = logger(`WS-${dcID}`);

    this.log('constructor');

    this.connect();
  }
  
  connect = () => {
    if(this.ws) {
      this.ws.removeEventListener('open', this.handleOpen);
      this.ws.removeEventListener('close', this.handleClose);
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.close(1000);
    } 

    this.ws = new WebSocket(this.url, 'binary');
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = this.handleOpen;
    this.ws.onclose = this.handleClose;
    this.ws.onmessage = this.handleMessage;
  };
  
  handleOpen = () => {
    this.log('opened');

    this.ws.send(this.obfuscation.init(this.codec));
    this.connected = true;

    this.releasePending();
  };
    
  handleClose = (event: CloseEvent) => {
    this.log('closed', event);
    this.connected = false;

    this.pending.length = 0;
    if(this.networker) {
      this.networker.cleanupSent();
    }

    this.log('trying to reconnect...');
    this.connect();
  };

  handleMessage = (event: MessageEvent) => {
    this.debug && this.log('<-', 'handleMessage', event);

    let data = this.obfuscation.decode(new Uint8Array(event.data));
    data = this.codec.readPacket(data);

    if(this.networker) { // authenticated!
      //this.pending = this.pending.filter(p => p.body); // clear pending

      this.debug && this.log('redirecting to networker');
      return this.networker.parseResponse(data).then(response => {
        this.debug && this.log('redirecting to networker response:', response);
        this.networker.processMessage(response.response, response.messageID, response.sessionID);
      });
    }

    //console.log('got hex:', data.hex);
    let pending = this.pending.shift();
    if(!pending) {
      return this.log('no pending for res:', data.hex);
    }

    pending.resolve(data);
  };

  send = (body: Uint8Array) => {
    this.debug && this.log('-> body length to pending:', body.length);

    if(this.networker) {
      this.pending.push({body});
      this.releasePending();
    } else {
      let promise = new Promise<Uint8Array>((resolve, reject) => {
        this.pending.push({resolve, reject, body});
      });

      this.releasePending();

      return promise;
    }
  }
    
  releasePending() {
    if(!this.connected) {
      //this.connect();
      return;
    }

    let length = this.pending.length;
    for(let i = length - 1; i >= 0; --i) {
      let pending = this.pending[i];
      let {body} = pending;
      if(body) {
        let toEncode = this.codec.encodePacket(body);

        //console.log('send before obf:', /* body.hex, nonce.hex, */ toEncode.hex);
        let enc = this.obfuscation.encode(toEncode);
        //console.log('send after obf:', enc.hex);

        this.debug && this.log('-> body length to send:', enc.length);

        this.ws.send(enc);

        if(!pending.resolve) { // remove if no response needed
          this.pending.splice(i, 1);
        }

        delete pending.body;
      }
    }
  }
}
  