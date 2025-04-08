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

import transportController from './transports/controller';
import {TLSerialization, TLDeserialization} from './tl_utils';
import {TransportType} from './dcConfigurator';
import rsaKeysManager from './rsaKeysManager';
import CryptoWorker from '../crypto/cryptoMessagePort';
import {logger, LogTypes} from '../logger';
import DEBUG from '../../config/debug';
import {Awaited, DcId} from '../../types';
import addPadding from '../../helpers/bytes/addPadding';
import bytesCmp from '../../helpers/bytes/bytesCmp';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import bytesXor from '../../helpers/bytes/bytesXor';
import {bigIntFromBytes} from '../../helpers/bigInt/bigIntConversion';
import bigInt from 'big-integer';
import randomize from '../../helpers/array/randomize';
import {AppManager} from '../appManagers/manager';
import Modes from '../../config/modes';

/* let fNewNonce: any = bytesFromHex('8761970c24cb2329b5b2459752c502f3057cb7e8dbab200e526e8767fdc73b3c').reverse();
let fNonce: any = bytesFromHex('b597720d11faa5914ef485c529cde414').reverse();
let fResult: any = new Uint8Array(bytesFromHex('000000000000000001b473a0661b285e480000006324160514e4cd29c585f44e91a5fa110d7297b5c0c4134c84893db5715ecd56af5ed618082182053cc5de91cd00000015c4b51c02000000a5b7f709355fc30b216be86c022bb4c3'));

fNewNonce = false;
fNonce = false;
fResult = false; */

type AuthOptions = {
  dcId: number,
  nonce: Uint8Array,

  serverNonce?: Uint8Array,
  pq?: Uint8Array,
  fingerprints?: string[],
  publicKey?: {
    modulus: string,
    exponent: string,
    fingerprint: string
  },

  // good
  p?: Uint8Array,
  q?: Uint8Array,

  newNonce?: Uint8Array,

  retry?: number,

  b?: Uint8Array,
  g?: number,
  gA?: Uint8Array,
  dhPrime?: Uint8Array,

  tmpAesKey?: Uint8Array,
  tmpAesIv?: Uint8Array,

  authKeyId?: Uint8Array,
  authKey?: Uint8Array,
  serverSalt?: Uint8Array,

  localTime?: number,
  serverTime?: any,
};

type ResPQ = {
  _: 'resPQ';
  nonce: Uint8Array;
  pq: Uint8Array;
  server_nonce: Uint8Array;
  server_public_key_fingerprints: string[];
};

type P_Q_inner_data = {
  _: 'p_q_inner_data_dc';
  pq: Uint8Array;
  p: Uint8Array;
  q: Uint8Array;
  nonce: Uint8Array;
  server_nonce: Uint8Array;
  new_nonce: Uint8Array;
  dc: number;
};

type req_DH_params = {
  nonce: Uint8Array;
  server_nonce: Uint8Array;
  p: Uint8Array;
  q: Uint8Array;
  public_key_fingerprint: string;
  encrypted_data: Uint8Array;
};

export class Authorizer extends AppManager {
  private cached: {
    [dcId: DcId]: Promise<AuthOptions>
  };

  private log: ReturnType<typeof logger>;

  private transportType: TransportType;

  private getTransportTypePromise: Promise<void>;

  protected after() {
    this.cached = {};
    this.log = logger(`AUTHORIZER`, LogTypes.Error | LogTypes.Log);
  }

  private sendPlainRequest(dcId: DcId, requestArray: Uint8Array) {
    const requestLength = requestArray.byteLength;

    const header = new TLSerialization();
    header.storeLongP(0, 0, 'auth_key_id');
    header.storeLong(this.timeManager.generateId(), 'msg_id');
    header.storeInt(requestLength, 'request_length');

    const headerArray = header.getBytes(true) as Uint8Array;
    const resultArray = new Uint8Array(headerArray.byteLength + requestLength);
    resultArray.set(headerArray);
    resultArray.set(requestArray, headerArray.length);

    const transport = this.dcConfigurator.chooseServer(dcId, 'client', this.transportType);
    const baseError = {
      code: 406,
      type: 'NETWORK_BAD_RESPONSE'
    };

    if(DEBUG) {
      this.log('mtpSendPlainRequest: creating requestPromise');
    }

    const promise = transport.send(resultArray) as any as Promise<Uint8Array>;
    return promise.then((result) => {
      if(DEBUG) {
        this.log('mtpSendPlainRequest: in good sector', result);
      }

      if(!result || !result.byteLength) {
        throw baseError;
      }

      try {
        /* result = fResult ? fResult : result;
        fResult = new Uint8Array(0); */

        const deserializer = new TLDeserialization<MTLong>(result, {mtproto: true});

        if(result.length === 4) {
          const errorCode = deserializer.fetchInt();
          this.log.error('mtpSendPlainRequest: wrong response, error code:', errorCode);
          throw errorCode;
        }

        const auth_key_id = deserializer.fetchLong('auth_key_id');
        if(auth_key_id !== '0') this.log.error('auth_key_id !== 0', auth_key_id);

        const msg_id = deserializer.fetchLong('msg_id');
        if(msg_id === '0') this.log.error('msg_id === 0', msg_id);

        const msg_len = deserializer.fetchInt('msg_len');
        if(!msg_len) this.log.error('no msg_len', msg_len);

        return deserializer;
      } catch(e) {
        this.log.error('mtpSendPlainRequest: deserialization went bad', e);
        const error = Object.assign(baseError, {originalError: e});
        throw error;
      }
    }, (error) => {
      if(!error.message && !error.type) {
        error = Object.assign(baseError, {
          originalError: error
        });
      }

      throw error;
    });
  }

  private async sendReqPQ(auth: AuthOptions) {
    const request = new TLSerialization({mtproto: true});

    request.storeMethod('req_pq_multi', {nonce: auth.nonce});

    if(DEBUG) {
      this.log('Send req_pq', bytesToHex(auth.nonce));
    }

    let deserializer: Awaited<ReturnType<Authorizer['sendPlainRequest']>>;
    try {
      const promise = this.sendPlainRequest(auth.dcId, request.getBytes(true));
      rsaKeysManager.prepare();
      deserializer = await promise;
    } catch(error) {
      this.log.error('req_pq error', (error as Error).message);
      throw error;
    }

    const response: ResPQ = deserializer.fetchObject('ResPQ');

    if(response._ !== 'resPQ') {
      throw new Error('[MT] resPQ response invalid: ' + response._);
    }

    if(!bytesCmp(auth.nonce, response.nonce)) {
      this.log.error(auth.nonce, response.nonce);
      throw new Error('[MT] resPQ nonce mismatch');
    }

    auth.serverNonce = response.server_nonce; // need
    auth.pq = response.pq;
    auth.fingerprints = response.server_public_key_fingerprints;

    if(DEBUG) {
      this.log('Got ResPQ', bytesToHex(auth.serverNonce), bytesToHex(auth.pq), auth.fingerprints);
    }

    const publicKey = await rsaKeysManager.select(auth.fingerprints);
    if(!publicKey) {
      throw new Error('[MT] No public key found');
    }

    auth.publicKey = publicKey;

    if(DEBUG) {
      this.log('PQ factorization start', auth.pq);
    }

    // let pAndQ: Awaited<ReturnType<typeof CryptoWorker['factorize']>>;
    try {
      var pAndQ = await CryptoWorker.invokeCrypto('factorize', auth.pq);
    } catch(error) {
      this.log.error('worker error factorize', error);
      throw error;
    }

    auth.p = pAndQ[0];
    auth.q = pAndQ[1];

    if(DEBUG) {
      this.log('PQ factorization done', pAndQ);
    }

    return this.sendReqDhParams(auth);
  }

  private async sendReqDhParams(auth: AuthOptions): Promise<AuthOptions> {
    auth.newNonce = randomize(new Uint8Array(32));

    const p_q_inner_data_dc: P_Q_inner_data = {
      _: 'p_q_inner_data_dc',
      pq: auth.pq,
      p: auth.p,
      q: auth.q,
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      new_nonce: auth.newNonce,
      dc: 0
    };

    const pQInnerDataSerialization = new TLSerialization({mtproto: true});
    pQInnerDataSerialization.storeObject(p_q_inner_data_dc, 'P_Q_inner_data', 'DECRYPTED_DATA');

    const data = pQInnerDataSerialization.getBytes(true);
    if(data.length > 144) {
      throw 'DH_params: data is more than 144 bytes!';
    }

    const dataWithPadding = addPadding(data, 192, false, true, false);
    const dataPadReversed = dataWithPadding.slice().reverse();

    const getKeyAesEncrypted = async() => {
      for(;;) {
        const tempKey = randomize(new Uint8Array(32));
        const dataWithHash = dataPadReversed.concat(await CryptoWorker.invokeCrypto('sha256', tempKey.concat(dataWithPadding)));
        if(dataWithHash.length !== 224) {
          throw 'DH_params: dataWithHash !== 224 bytes!';
        }

        const aesEncrypted = await CryptoWorker.invokeCrypto('aes-encrypt', dataWithHash, tempKey, new Uint8Array([0]));
        const tempKeyXor = bytesXor(tempKey, await CryptoWorker.invokeCrypto('sha256', aesEncrypted));
        const keyAesEncrypted = tempKeyXor.concat(aesEncrypted);

        const keyAesEncryptedBigInt = bigIntFromBytes(keyAesEncrypted);
        const publicKeyModulusBigInt = bigInt(auth.publicKey.modulus, 16);

        if(keyAesEncryptedBigInt.compare(publicKeyModulusBigInt) === -1) {
          return keyAesEncrypted;
        }
      }
    };

    const keyAesEncrypted = await getKeyAesEncrypted();
    const encryptedData = addPadding(await CryptoWorker.invokeCrypto('rsa-encrypt', keyAesEncrypted, auth.publicKey), 256, true, true, true);

    const req_DH_params: req_DH_params = {
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      p: auth.p,
      q: auth.q,
      public_key_fingerprint: auth.publicKey.fingerprint,
      encrypted_data: encryptedData
    };

    const request = new TLSerialization({mtproto: true});
    request.storeMethod('req_DH_params', req_DH_params);

    const requestBytes = request.getBytes(true);

    if(DEBUG) {
      this.log('Send req_DH_params', req_DH_params/* , requestBytes.hex */);
    }

    let deserializer: Awaited<ReturnType<Authorizer['sendPlainRequest']>>;
    try {
      deserializer = await this.sendPlainRequest(auth.dcId, requestBytes);
    } catch(error) {
      this.log.error('Send req_DH_params FAIL!', error);
      throw error;
    }

    const response = deserializer.fetchObject('Server_DH_Params', 'RESPONSE');

    if(DEBUG) {
      this.log('Sent req_DH_params, response:', response);
    }

    if(response._ !== 'server_DH_params_fail' && response._ !== 'server_DH_params_ok') {
      throw new Error('[MT] Server_DH_Params response invalid: ' + response._);
    }

    if(!bytesCmp(auth.nonce, response.nonce)) {
      throw new Error('[MT] Server_DH_Params nonce mismatch');
    }

    if(!bytesCmp(auth.serverNonce, response.server_nonce)) {
      throw new Error('[MT] Server_DH_Params server_nonce mismatch');
    }

    if(response._ === 'server_DH_params_fail') {
      const newNonceHash = (await CryptoWorker.invokeCrypto('sha1', auth.newNonce)).slice(-16);
      if(!bytesCmp(newNonceHash, response.new_nonce_hash)) {
        throw new Error('[MT] server_DH_params_fail new_nonce_hash mismatch');
      }

      throw new Error('[MT] server_DH_params_fail');
    }

    // fill auth object
    try {
      await this.decryptServerDhDataAnswer(auth, response.encrypted_answer);
    } catch(e) {
      this.log.error('mtpDecryptServerDhDataAnswer FAILED!', e);
      throw e;
    }

    // console.log(dT(), 'mtpSendReqDhParams: executing mtpSendSetClientDhParams...');

    return this.sendSetClientDhParams(auth);
  }

  private async decryptServerDhDataAnswer(auth: AuthOptions, encryptedAnswer: any) {
    auth.localTime = Date.now();

    // ! can't concat Array with Uint8Array!
    auth.tmpAesKey = (await CryptoWorker.invokeCrypto('sha1', auth.newNonce.concat(auth.serverNonce)))
    .concat((await CryptoWorker.invokeCrypto('sha1', auth.serverNonce.concat(auth.newNonce))).slice(0, 12));

    auth.tmpAesIv = (await CryptoWorker.invokeCrypto('sha1', auth.serverNonce.concat(auth.newNonce))).slice(12)
    .concat(await CryptoWorker.invokeCrypto('sha1', auth.newNonce.concat(auth.newNonce)), auth.newNonce.slice(0, 4));

    const answerWithHash = new Uint8Array(await CryptoWorker.invokeCrypto('aes-decrypt', encryptedAnswer, auth.tmpAesKey, auth.tmpAesIv));

    const hash = answerWithHash.slice(0, 20);
    const answerWithPadding = answerWithHash.slice(20);

    const deserializer = new TLDeserialization<MTLong>(answerWithPadding, {mtproto: true});
    const response = deserializer.fetchObject('Server_DH_inner_data');

    if(response._ !== 'server_DH_inner_data') {
      throw new Error('[MT] server_DH_inner_data response invalid: ' + response);
    }

    if(!bytesCmp(auth.nonce, response.nonce)) {
      throw new Error('[MT] server_DH_inner_data nonce mismatch');
    }

    if(!bytesCmp(auth.serverNonce, response.server_nonce)) {
      throw new Error('[MT] server_DH_inner_data serverNonce mismatch');
    }

    if(DEBUG) {
      this.log('Done decrypting answer');
    }
    auth.g = response.g;
    auth.dhPrime = response.dh_prime;
    auth.gA = response.g_a;
    auth.serverTime = response.server_time;
    auth.retry = 0;

    this.verifyDhParams(auth.g, auth.dhPrime, auth.gA);

    const offset = deserializer.getOffset();

    if(!bytesCmp(hash, await CryptoWorker.invokeCrypto('sha1', answerWithPadding.slice(0, offset)))) {
      throw new Error('[MT] server_DH_inner_data SHA1 mismatch');
    }

    this.timeManager.applyServerTime(auth.serverTime, auth.localTime);
  }

  private verifyDhParams(g: number, dhPrime: Uint8Array, gA: Uint8Array) {
    if(DEBUG) {
      this.log('Verifying DH params', g, dhPrime, gA);
    }

    const dhPrimeHex = bytesToHex(dhPrime);
    if(g !== 3 || dhPrimeHex !== 'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b') {
      // The verified value is from https://core.telegram.org/mtproto/security_guidelines
      throw new Error('[MT] DH params are not verified: unknown dhPrime');
    }

    if(DEBUG) {
      this.log('dhPrime cmp OK');
    }

    const gABigInt = bigIntFromBytes(gA);
    const dhPrimeBigInt = bigInt(dhPrimeHex, 16);

    if(gABigInt.compare(bigInt.one) <= 0) {
      throw new Error('[MT] DH params are not verified: gA <= 1');
    }

    if(gABigInt.compare(dhPrimeBigInt.subtract(bigInt.one)) >= 0) {
      throw new Error('[MT] DH params are not verified: gA >= dhPrime - 1');
    }

    if(DEBUG) {
      this.log('1 < gA < dhPrime-1 OK');
    }

    const twoPow = bigInt(2).pow(2048 - 64);

    if(gABigInt.compare(twoPow) < 0) {
      throw new Error('[MT] DH params are not verified: gA < 2^{2048-64}');
    }
    if(gABigInt.compare(dhPrimeBigInt.subtract(twoPow)) >= 0) {
      throw new Error('[MT] DH params are not verified: gA > dhPrime - 2^{2048-64}');
    }

    if(DEBUG) {
      this.log('2^{2048-64} < gA < dhPrime-2^{2048-64} OK');
    }

    return true;
  }

  private async sendSetClientDhParams(auth: AuthOptions): Promise<AuthOptions> {
    const gBytes = bytesFromHex(auth.g.toString(16));

    auth.b = randomize(new Uint8Array(256));
    // MTProto.secureRandom.nextBytes(auth.b);

    // let gB: Awaited<ReturnType<typeof CryptoWorker['modPow']>>;
    try {
      var gB = await CryptoWorker.invokeCrypto('mod-pow', gBytes, auth.b, auth.dhPrime);
    } catch(error) {
      throw error;
    }

    const data = new TLSerialization({mtproto: true});
    data.storeObject({
      _: 'client_DH_inner_data',
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      retry_id: [0, auth.retry++],
      g_b: gB
    }, 'Client_DH_Inner_Data');

    const dataWithHash = (await CryptoWorker.invokeCrypto('sha1', data.getBuffer())).concat(data.getBytes(true));
    const encryptedData = await CryptoWorker.invokeCrypto('aes-encrypt', dataWithHash, auth.tmpAesKey, auth.tmpAesIv);

    const request = new TLSerialization({mtproto: true});
    request.storeMethod('set_client_DH_params', {
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      encrypted_data: encryptedData
    });

    if(DEBUG) {
      this.log('Send set_client_DH_params');
    }

    let deserializer: Awaited<ReturnType<Authorizer['sendPlainRequest']>>;
    try {
      deserializer = await this.sendPlainRequest(auth.dcId, request.getBytes(true));
    } catch(err) {
      throw err;
    }

    const response = deserializer.fetchObject('Set_client_DH_params_answer');

    if(response._ !== 'dh_gen_ok' && response._ !== 'dh_gen_retry' && response._ !== 'dh_gen_fail') {
      throw new Error('[MT] Set_client_DH_params_answer response invalid: ' + response._);
    }

    if(!bytesCmp(auth.nonce, response.nonce)) {
      throw new Error('[MT] Set_client_DH_params_answer nonce mismatch');
    }

    if(!bytesCmp(auth.serverNonce, response.server_nonce)) {
      throw new Error('[MT] Set_client_DH_params_answer server_nonce mismatch');
    }

    // let authKey: Uint8Array;
    try {
      var authKey = await CryptoWorker.invokeCrypto('mod-pow', auth.gA, auth.b, auth.dhPrime);
    } catch(err) {
      throw authKey;
    }

    const authKeyHash = await CryptoWorker.invokeCrypto('sha1', authKey),
      authKeyAux = authKeyHash.slice(0, 8),
      authKeyId = authKeyHash.slice(-8);

    if(DEBUG) {
      this.log('Got Set_client_DH_params_answer', response._, authKey);
    }
    switch(response._) {
      case 'dh_gen_ok': {
        const newNonceHash1 = (await CryptoWorker.invokeCrypto('sha1', auth.newNonce.concat([1], authKeyAux))).slice(-16);

        if(!bytesCmp(newNonceHash1, response.new_nonce_hash1)) {
          this.log.error('Set_client_DH_params_answer new_nonce_hash1 mismatch', newNonceHash1, response);
          throw new Error('new_nonce_hash1 mismatch');
        }

        const serverSalt = bytesXor(auth.newNonce.slice(0, 8), auth.serverNonce.slice(0, 8));
        if(DEBUG) {
          this.log('Auth successfull!', authKeyId, authKey, serverSalt);
        }

        auth.authKeyId = authKeyId;
        auth.authKey = authKey;
        auth.serverSalt = serverSalt;

        return auth;
      }

      case 'dh_gen_retry': {
        const newNonceHash2 = (await CryptoWorker.invokeCrypto('sha1', auth.newNonce.concat([2], authKeyAux))).slice(-16);
        if(!bytesCmp(newNonceHash2, response.new_nonce_hash2)) {
          throw new Error('[MT] Set_client_DH_params_answer new_nonce_hash2 mismatch');
        }

        return this.sendSetClientDhParams(auth);
      }

      case 'dh_gen_fail': {
        const newNonceHash3 = (await CryptoWorker.invokeCrypto('sha1', auth.newNonce.concat([3], authKeyAux))).slice(-16);
        if(!bytesCmp(newNonceHash3, response.new_nonce_hash3)) {
          throw new Error('[MT] Set_client_DH_params_answer new_nonce_hash3 mismatch');
        }

        throw new Error('[MT] Set_client_DH_params_answer fail');
      }
    }
  }

  private getTransportType = () => {
    if(!import.meta.env.VITE_MTPROTO_AUTO || !Modes.multipleTransports) {
      return;
    }

    if(this.getTransportTypePromise) return this.getTransportTypePromise;
    return this.getTransportTypePromise = transportController.pingTransports().then(({websocket}) => {
      this.transportType = websocket ? 'websocket' : 'https';
      this.log('will use transport:', this.transportType);
    });
  };

  public auth(dcId: DcId) {
    let promise = this.cached[dcId];
    if(promise) {
      return promise;
    }

    promise = new Promise(async(resolve, reject) => {
      await this.getTransportType();

      let error: ApiError;
      let _try = 1;
      while(_try++ <= 3) {
        try {
          const auth: AuthOptions = {
            dcId,
            nonce: randomize(new Uint8Array(16))
          };

          const promise = this.sendReqPQ(auth);
          resolve(await promise);
          return;
        } catch(err) {
          error = err as ApiError;
        }
      }

      reject(error);
    });

    return this.cached[dcId] = promise;
  }
}
