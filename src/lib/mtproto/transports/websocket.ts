import MTTransport from './transport';

import aesjs from 'aes-js';
import abridgetPacketCodec from './abridged';
import {MTPNetworker} from '../networker';
import { logger } from '../../polyfill';
//import '../../types.d.ts';

export class Obfuscation {
  /** Encription Cipher */
  public enc: aesjs.ModeOfOperation.ModeOfOperationCTR;

  /** Decription Cipher */
  public dec: aesjs.ModeOfOperation.ModeOfOperationCTR;

  //public initPayload: Uint8Array;

  /**
   * Creates initialization payload for establishing web-socket connection
   */
  public init() {
    //if(this.initPayload) return this.initPayload;

    const initPayload = new Uint8Array(64);
    initPayload.randomize();
    //initPayload.set(new Uint8Array(bytesFromHex('8546029e63835e4138142813963d2987482dd6126089a1852ffadec149b4375c568dd0591d6b66cc95cec4b280b16f82fb6461ee1842b26fafc9ea76991ea4b1')));

    while(true) {
      let val = (initPayload[3] << 24) | (initPayload[2] << 16) | (initPayload[1] << 8) | (initPayload[0]);
      let val2 = (initPayload[7] << 24) | (initPayload[6] << 16) | (initPayload[5] << 8) | (initPayload[4]);
      if(initPayload[0] != 0xef &&
          val != 0x44414548 &&
          val != 0x54534f50 &&
          val != 0x20544547 &&
          val != 0x4954504f &&
          val != 0xeeeeeeee &&
          val2 != 0x00000000) {
          //initPayload[56] = initPayload[57] = initPayload[58] = initPayload[59] = transport;
          break;
      }
      initPayload.randomize();
    }

    //initPayload[0] = 0xFF;
    //let h = initPayload.hex;
    //console.log('initPayload.hex', initPayload.hex);
    ////////////////////////initPayload.subarray(60, 62).hex = dcID;
    //console.log(initPayload.hex, h == initPayload.hex);

    //console.log('initPayload', initPayload.hex);
    const reversedPayload = initPayload.slice().reverse();
    //console.log('initPayload', initPayload.hex);

    let encKey = initPayload.slice(8, 40);
    let encIv = initPayload.slice(40, 56);
    let decKey = reversedPayload.slice(8, 40);
    let decIv = reversedPayload.slice(40, 56);

    this.enc = new aesjs.ModeOfOperation.ctr(encKey, new aesjs.Counter(encIv as any));
    this.dec = new aesjs.ModeOfOperation.ctr(decKey, new aesjs.Counter(decIv as any));

    initPayload.set(abridgetPacketCodec.obfuscateTag, 56);
    const encrypted = this.encode(initPayload);
    //console.log('encrypted', encrypted.hex);

    initPayload.set(encrypted.slice(56, 64), 56);
    //console.log('initPayload.hex', initPayload.hex);

    return /* this.initPayload = */ initPayload;
  }

  /**
   * Obfuscates data
   */
  public encode(payload: Uint8Array) {
    return this.enc.encrypt(payload);
  }


  /**
   * Decodes obfuscated data
   */
  public decode(data: Uint8Array) {
    return this.dec.encrypt(data);
  }
}

//let obfuscation = new Obfuscation();

export default class Socket extends MTTransport {
  /** Connection handler */
  ws: WebSocket | undefined;

  /** Pending requests */
  pending: Array<{resolve?: any, reject?: any, body?: Uint8Array/* , msgKey?: Uint8Array */}> = [];
  
  /** WebSocket connecting flag */
  connected = false;
  
  /** Instance transport */
  transport = 'websocket';

  obfuscation = new Obfuscation();

  networker: MTPNetworker;

  log: ReturnType<typeof logger>;

  debug = false;

  /**
  * Creates new web socket handler
  */
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

    this.ws = new WebSocket(/* dcConfigurator.chooseServer(this.dcID, false, 'websocket') */this.url, 'binary');
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = this.handleOpen;
    this.ws.onclose = this.handleClose;
    this.ws.onmessage = this.handleMessage;
  };
  
  /**
  * Handles onopen event at websocket object
  */
  handleOpen = () => {
    this.log('opened');

    //obfuscation.init();
    //this.ws.send(new Uint8Array(bytesFromHex('ffc8b30b09c27d42791242f256b5186d3716f6f4f28121cf10cadc2196e496f092f97d13ed2c5a8b7181ca08ebe18e714ccac1cd60e88c4989bb4255682331c0')));
    this.ws.send(this.obfuscation.init());
    this.connected = true;

    this.releasePending();

    /* let request = new TLSerialization({mtproto: true});

    //let nonce = new Uint8Array(bytesFromHex('a370ec66e6e03c7b83843f3dfda22fd4').reverse());
    let nonce = new Uint8Array(16).randomize();
  
    request.storeMethod('req_pq_multi', {nonce: nonce});

    let body = request.getBytes(true) as Uint8Array;

    this.send(body); */

    //this.ws.send(new Uint8Array(bytesFromHex('0e3cae6322eb93d4fc09d924fb17eb7887f1002679dedec754a6130f31e66c19016e6f3693a803b0a44d0567fcd01fe6a38b70fd328d3ebe9302f73454edd93a')).buffer);
    //initPayload.slice(56).raw = encrypted.slice(56).raw;
      
      /* const { dc, thread, protocol } = this.cfg;
      const payload = {
        dc, thread, protocol, transport: this.transport,
      };
      
      async('transport_init', payload, (initPayload: Bytes) => {
        if (!this.ws) return;
        
        this.ws.send(initPayload.buffer.buffer);
        
        this.isConnecting = false;
        
        log(this.cfg.dc, 'ready');
        
        this.releasePending();
      }); */
  };
    
  /**
  * Handles onclose event at websocket object
  */
  handleClose = (event: CloseEvent) => {
    this.log('closed', event);
    //this.emit('disconnected');
    //this.pending = [];
    this.connected = false;

    this.pending.length = 0;
    if(this.networker) {
      this.networker.cleanupSent();
    }

    this.log('trying to reconnect...');
    this.connect();
    //this.cfg.resolveError(this.cfg.dc, this.cfg.thread, this.transport, this.lastNonce || '', event.code, event.reason);
  };

  /* set networker(networker: MTPNetworker) {
    this.networker = networker;
  } */
    
  /**
  * Handles onmessage event at websocket object
  */
  handleMessage = (event: MessageEvent) => {
    this.debug && this.log('<-', 'handleMessage', event);

    let data = this.obfuscation.decode(new Uint8Array(event.data));
    data = abridgetPacketCodec.readPacket(data);

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

    /* try {
      let deserializer = new TLDeserialization(data.buffer, {mtproto: true});
      let auth_key_id = deserializer.fetchLong('auth_key_id');
      if(auth_key_id != 0) console.error('auth_key_id != 0', auth_key_id);

      let msg_id = deserializer.fetchLong('msg_id');
      if(msg_id == 0) console.error('msg_id == 0', msg_id);

      let msg_len = deserializer.fetchInt('msg_len');
      if(!msg_len) console.error('no msg_len', msg_len);

      let response = deserializer.fetchObject('ResPQ');
      console.log(response);
    } catch(e) {
      console.error('mtpSendPlainRequest: deserialization went bad', e);
      throw e;
    } */
    /* const authKey = this.svc.getAuthKey(this.cfg.dc);
    const { dc, thread } = this.cfg;
    const payload = {
      dc, thread, transport: this.transport, authKey: authKey ? authKey.key : '', msg: new Bytes(event.data),
    };
    
    if (!event.data) return;
    
    async('transport_decrypt', payload, (msg: Message | PlainMessage | Bytes) => {
      if (msg instanceof PlainMessage) this.lastNonce = msg.nonce;
      if (msg instanceof Message || msg instanceof PlainMessage) {
        this.cfg.resolve(msg, {
          dc: this.cfg.dc,
          thread: this.cfg.thread,
          transport: this.transport,
          msgID: msg.id,
        });
      } else {
        throw new Error(`Unexpected answer: ${msg.hex}`);
      }
    }); */
  };
    
  /**
  * Method sends bytes to server via web socket.
  */
  send = (body: Uint8Array/* , msgKey?: Uint8Array */) => {
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

    /* let promise = new Promise<Uint8Array>((resolve, reject) => {
      this.pending.push({resolve, reject, body});

      this.releasePending();
    });

    return promise; */
    
    /* // let msg_id = '6784284127384679768';//timeManager.generateID();
    let msg_id = timeManager.generateID();
    console.log('generated msg_id:', msg_id);
    let packed = new TLSerialization({
      mtproto: true
    });
    //packed.storeRawBytes([0x0a]);
    packed.storeLong(0);
    packed.storeLong(msg_id);
    packed.storeInt(body.byteLength);
    packed.storeRawBytes(body);
      
    console.log('packed', (packed.getBytes(true) as Uint8Array).hex, 
      bytesToHex([...new Uint8Array(bigStringInt(msg_id).toByteArray())]));

    let toEncode = abridgetPacketCodec.encodePacket(packed.getBytes(true) as Uint8Array);

    console.log('send req_pq:', toEncode.hex);
    //let enc = obfuscation.encode(request.getBytes(true) as Uint8Array);
    let enc = obfuscation.encode(toEncode);
    //let enc = new Uint8Array(bytesFromHex('b6f899247854750f879db416e95fd41145e8f7f910741b50c02a20025d3f9cbd09b09f3306be378c43'));
    //let enc = obfuscation.encode(new Uint8Array(bytesFromHex('00000000000000000424ec94a191265e14000000f18e7ebef8c6203ebc2ae31b44a3aafd8afdf367')));
    console.log('send req_pq:', enc.hex);
    this.ws.send(enc); */
    
    //if (msg instanceof PlainMessage) this.lastNonce = msg.nonce;
    
    /* if(this.ws && this.ws.readyState === 1) {
      const authKey = this.svc.getAuthKey(this.cfg.dc);
      const { dc, thread } = this.cfg;
      const payload = {
        msg, dc, thread, transport: this.transport, authKey: authKey ? authKey.key : '',
      };
      
      async('transport_encrypt', payload, (data: Bytes) => {
        if (this.ws) this.ws.send(data.buffer.buffer);
      });
      
      this.releasePending();
      return;
    } */
      
    //this.pending.push(msg);
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
        let toEncode = abridgetPacketCodec.encodePacket(body);

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
  