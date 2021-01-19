import { TLSerialization, TLDeserialization } from "./tl_utils";
import dcConfigurator from "./dcConfigurator";
import rsaKeysManager from "./rsaKeysManager";
import timeManager from "./timeManager";

// @ts-ignore
import { BigInteger } from "jsbn";

import CryptoWorker from "../crypto/cryptoworker";

import { logger, LogLevels } from "../logger";
import { bytesCmp, bytesToHex, bytesFromHex, bytesXor } from "../../helpers/bytes";
import { DEBUG } from "./mtproto_config";
//import { bigInt2str, greater, int2bigInt, one, powMod, str2bigInt, sub } from "../../vendor/leemon";

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
  p?: number[],
  q?: number[],
  
  newNonce?: Uint8Array,
  
  retry?: number,
  
  b?: number[],
  g?: number,
  gA?: Uint8Array,
  dhPrime?: Uint8Array,
  
  tmpAesKey?: Uint8Array,
  tmpAesIv?: Uint8Array,
  
  authKeyId?: Uint8Array,
  authKey?: number[],
  serverSalt?: number[],

  localTime?: number,
  serverTime?: any
};

export class Authorizer {
  private cached: {
    [dcId: number]: Promise<AuthOptions>
  } = {};
  
  private log: ReturnType<typeof logger>;
  
  constructor() {
    this.log = logger(`AUTHORIZER`, LogLevels.error | LogLevels.log);
  }
  
  public mtpSendPlainRequest(dcId: number, requestArray: Uint8Array) {
    var requestLength = requestArray.byteLength;
    //requestArray = new /* Int32Array */Uint8Array(requestBuffer);
    
    var header = new TLSerialization();
    header.storeLongP(0, 0, 'auth_key_id'); // Auth key
    header.storeLong(timeManager.generateId(), 'msg_id'); // Msg_id
    header.storeInt(requestLength, 'request_length');
    
    let headerArray = header.getBytes(true) as Uint8Array;
    let resultArray = new Uint8Array(headerArray.byteLength + requestLength);
    resultArray.set(headerArray);
    resultArray.set(requestArray, headerArray.length);
    
    /* var headerBuffer = header.getBuffer(),
    headerArray = new Int32Array(headerBuffer);
    var headerLength = headerBuffer.byteLength;
    
    var resultBuffer = new ArrayBuffer(headerLength + requestLength),
    resultArray = new Int32Array(resultBuffer);
    
    resultArray.set(headerArray);
    resultArray.set(requestArray, headerArray.length);
    
    let requestData = xhrSendBuffer ? resultBuffer : resultArray; */
    let transport = dcConfigurator.chooseServer(dcId);
    let baseError = {
      code: 406,
      type: 'NETWORK_BAD_RESPONSE',
      transport: transport
    };
    
    if(DEBUG) {
      this.log('mtpSendPlainRequest: creating requestPromise');
    }
    
    return transport.send(resultArray).then(result => {
      if(DEBUG) {
        this.log('mtpSendPlainRequest: in good sector', result);
      }
      
      if(!result || !result.byteLength) {
        return Promise.reject(baseError);
      }
      
      try {
        /* result = fResult ? fResult : result;
        fResult = new Uint8Array(0); */
        
        let deserializer = new TLDeserialization(result, {mtproto: true});
        let auth_key_id = deserializer.fetchLong('auth_key_id');
        if(auth_key_id != 0) this.log.error('auth_key_id != 0', auth_key_id);
        
        let msg_id = deserializer.fetchLong('msg_id');
        if(msg_id == 0) this.log.error('msg_id == 0', msg_id);
        
        let msg_len = deserializer.fetchInt('msg_len');
        if(!msg_len) this.log.error('no msg_len', msg_len);
        
        return deserializer;
      } catch(e) {
        this.log.error('mtpSendPlainRequest: deserialization went bad', e);
        let error = Object.assign(baseError, {originalError: e});
        throw error;
      }
    }, error => {
      if(!error.message && !error.type) {
        error = Object.assign(baseError, {
          originalError: error
        });
      }
      
      return Promise.reject(error);
    });
  }
  
  public async mtpSendReqPQ(auth: AuthOptions) {
    var request = new TLSerialization({mtproto: true});
    
    request.storeMethod('req_pq_multi', {nonce: auth.nonce});
    
    // need
    rsaKeysManager.prepare().then(() => {});
    
    if(DEBUG) {
      this.log('Send req_pq', auth.nonce.hex);
    }
    try {
      var deserializer = await this.mtpSendPlainRequest(auth.dcId, request.getBytes(true));
    } catch(error) {
      this.log.error('req_pq error', error.message);
      throw error;
    }
    
    var response = deserializer.fetchObject('ResPQ');
    
    if(response._ != 'resPQ') {
      throw new Error('[MT] resPQ response invalid: ' + response._);
    }
    
    if(!bytesCmp(auth.nonce, response.nonce)) {
      this.log.error(auth.nonce, response.nonce);
      throw new Error('[MT] resPQ nonce mismatch');
    }
    
    //auth.serverNonce = response.server_nonce;
    auth.serverNonce = new Uint8Array(response.server_nonce); // need
    auth.pq = response.pq;
    auth.fingerprints = response.server_public_key_fingerprints;
    
    if(DEBUG) {
      this.log('Got ResPQ', bytesToHex(auth.serverNonce), bytesToHex(auth.pq), auth.fingerprints);
    }
    
    let publicKey = await rsaKeysManager.select(auth.fingerprints);
    if(!publicKey) {
      throw new Error('[MT] No public key found');
    }
    
    auth.publicKey = publicKey;
    
    if(DEBUG) {
      this.log('PQ factorization start', auth.pq);
    }
    
    try {
      var pAndQ = await CryptoWorker.factorize(auth.pq);
    } catch(error) {
      this.log.error('worker error factorize', error);
      throw error;
    }
    
    auth.p = pAndQ[0];
    auth.q = pAndQ[1];
    
    if(DEBUG) {
      this.log('PQ factorization done', pAndQ);
    }
    /* let p = new Uint32Array(new Uint8Array(auth.p).buffer)[0];
    let q = new Uint32Array(new Uint8Array(auth.q).buffer)[0];
    console.log(dT(), 'PQ factorization done', pAndQ, p.toString(16), q.toString(16)); */
    
    return this.mtpSendReqDhParams(auth);
  }
  
  public async mtpSendReqDhParams(auth: AuthOptions) {
    auth.newNonce = new Uint8Array(32).randomize();
    /* auth.newNonce = new Array(32); // need array, not uint8array!
    MTProto.secureRandom.nextBytes(auth.newNonce); */
    
    //console.log("TCL: Authorizer -> mtpSendReqDhParams -> auth.newNonce", auth.newNonce)
    
    // remove
    // auth.newNonce = fNewNonce ? fNewNonce : auth.newNonce;
    // console.log("TCL: Authorizer -> mtpSendReqDhParams -> auth.newNonce", auth.newNonce);
    
    let p_q_inner_data = {
      _: 'p_q_inner_data',
      pq: auth.pq,
      p: auth.p,
      q: auth.q,
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      new_nonce: auth.newNonce
    };
    
    let data = new TLSerialization({mtproto: true});
    data.storeObject(p_q_inner_data, 'P_Q_inner_data', 'DECRYPTED_DATA');
    /* console.log('p_q_inner_data', p_q_inner_data, 
    bytesToHex(bytesFromArrayBuffer(data.getBuffer())), 
    sha1BytesSync(data.getBuffer()),
    bytesFromArrayBuffer(await CryptoWorker.sha1Hash(data.getBuffer()))); */
    
    let uint8Data = data.getBytes(true);
    let sha1Hashed = await CryptoWorker.sha1Hash(uint8Data);
    
    //var dataWithHash = sha1BytesSync(data.getBuffer()).concat(data.getBytes() as number[]);
    let dataWithHash = sha1Hashed.concat(uint8Data);
    
    //dataWithHash = addPadding(dataWithHash, 255);
    //dataWithHash = dataWithHash.concat(bytesFromHex('96228ea7790e71caaabc2ab67f4412e9aa224c664d232cc08617a32ce1796aa052da4a737083211689858f461e4473fd6394afd3aa0c8014840dc13f47beaf4fc3b9229aea9cfa83f9f6e676e50ee7676542fb75606879ee7e65cf3a2295b4ba0934ceec1011560c62395a6e9593bfb117cd0da75ba56723672d100ac17ec4d805aa59f7852e3a25a79ee4'));
    //console.log('sha1Hashed', bytesToHex(sha1Hashed), 'dataWithHash', bytesToHex(dataWithHash), dataWithHash.length);
    
    let rsaEncrypted = await CryptoWorker.rsaEncrypt(auth.publicKey, dataWithHash);
    //let rsaEncrypted = await CryptoWorker.rsaEncrypt(auth.publicKey, dataWithHash);
    
    //console.log('rsaEncrypted', rsaEncrypted, new Uint8Array(rsaEncrypted).hex);
    
    let req_DH_params = {
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      p: auth.p,
      q: auth.q,
      public_key_fingerprint: auth.publicKey.fingerprint,
      encrypted_data: rsaEncrypted
    };
    
    var request = new TLSerialization({mtproto: true});
    request.storeMethod('req_DH_params', req_DH_params);
    
    let requestBytes = request.getBytes(true);
    
    if(DEBUG) {
      this.log('Send req_DH_params', req_DH_params/* , requestBytes.hex */);
    }
    
    try {
      var deserializer = await this.mtpSendPlainRequest(auth.dcId, requestBytes);
    } catch(error) {
      this.log.error('Send req_DH_params FAIL!', error);
      throw error;
    }
    
    var response = deserializer.fetchObject('Server_DH_Params', 'RESPONSE');
    
    if(DEBUG) {
      this.log('Sent req_DH_params, response:', response);
    }
    
    if(response._ != 'server_DH_params_fail' && response._ != 'server_DH_params_ok') {
      throw new Error('[MT] Server_DH_Params response invalid: ' + response._);
    }
    
    if(!bytesCmp(auth.nonce, response.nonce)) {
      throw new Error('[MT] Server_DH_Params nonce mismatch');
    }
    
    if(!bytesCmp(auth.serverNonce, response.server_nonce)) {
      throw new Error('[MT] Server_DH_Params server_nonce mismatch');
    }
    
    if(response._ == 'server_DH_params_fail') {
      //var newNonceHash = sha1BytesSync(auth.newNonce).slice(-16);
      var newNonceHash = (await CryptoWorker.sha1Hash(auth.newNonce)).slice(-16);
      if(!bytesCmp(newNonceHash, response.new_nonce_hash)) {
        throw new Error('[MT] server_DH_params_fail new_nonce_hash mismatch');
      }
      
      throw new Error('[MT] server_DH_params_fail');
    }
    
    // fill auth object
    try {
      await this.mtpDecryptServerDhDataAnswer(auth, response.encrypted_answer);
    } catch(e) {
      this.log.error('mtpDecryptServerDhDataAnswer FAILED!', e);
      throw e;
    }
    
    //console.log(dT(), 'mtpSendReqDhParams: executing mtpSendSetClientDhParams...');
    
    return this.mtpSendSetClientDhParams(auth as any); // костыль
  }
  
  public async mtpDecryptServerDhDataAnswer(auth: AuthOptions, encryptedAnswer: any) {
    auth.localTime = Date.now();
    
    // can't concat Array with Uint8Array!
    //auth.tmpAesKey = sha1BytesSync(auth.newNonce.concat(auth.serverNonce)).concat(sha1BytesSync(auth.serverNonce.concat(auth.newNonce)).slice(0, 12));
    //auth.tmpAesIv = sha1BytesSync(auth.serverNonce.concat(auth.newNonce)).slice(12).concat(sha1BytesSync([].concat(auth.newNonce, auth.newNonce)), auth.newNonce.slice(0, 4));
    auth.tmpAesKey = (await CryptoWorker.sha1Hash(auth.newNonce.concat(auth.serverNonce)))
    .concat((await CryptoWorker.sha1Hash(auth.serverNonce.concat(auth.newNonce))).slice(0, 12));
    
    auth.tmpAesIv = (await CryptoWorker.sha1Hash(auth.serverNonce.concat(auth.newNonce))).slice(12)
    .concat(await CryptoWorker.sha1Hash(auth.newNonce.concat(auth.newNonce)), auth.newNonce.slice(0, 4));
    
    
    /* console.log(auth.serverNonce.concat(auth.newNonce));
    console.log(auth.newNonce.concat(auth.serverNonce));
    console.log(auth.newNonce.concat(auth.newNonce)); */
    
    
    //var answerWithHash = aesDecryptSync(encryptedAnswer, auth.tmpAesKey, auth.tmpAesIv);
    var answerWithHash = new Uint8Array(await CryptoWorker.aesDecrypt(encryptedAnswer, auth.tmpAesKey, auth.tmpAesIv));
    
    var hash = answerWithHash.slice(0, 20);
    var answerWithPadding = answerWithHash.slice(20);
    
    // console.log('hash', hash);
    
    var deserializer = new TLDeserialization(answerWithPadding, {mtproto: true});
    var response = deserializer.fetchObject('Server_DH_inner_data');
    
    if(response._ != 'server_DH_inner_data') {
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
    
    this.mtpVerifyDhParams(auth.g, auth.dhPrime, auth.gA);
    
    var offset = deserializer.getOffset();
    
    //if(!bytesCmp(hash, sha1BytesSync(answerWithPadding.slice(0, offset)))) {
    if(!bytesCmp(hash, await CryptoWorker.sha1Hash(answerWithPadding.slice(0, offset)))) {
      throw new Error('[MT] server_DH_inner_data SHA1-hash mismatch');
    }
    
    timeManager.applyServerTime(auth.serverTime, auth.localTime);
  }
  
  public mtpVerifyDhParams(g: number, dhPrime: Uint8Array, gA: Uint8Array) {
    if(DEBUG) {
      this.log('Verifying DH params', g, dhPrime, gA);
    }

    var dhPrimeHex = bytesToHex(dhPrime);
    if(g != 3 || dhPrimeHex !== 'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b') {
      // The verified value is from https://core.telegram.org/mtproto/security_guidelines
      throw new Error('[MT] DH params are not verified: unknown dhPrime');
    }

    if(DEBUG) {
      this.log('dhPrime cmp OK');
    }
    
    var gABigInt = new BigInteger(bytesToHex(gA), 16);
    //const _gABigInt = str2bigInt(bytesToHex(gA), 16);
    var dhPrimeBigInt = new BigInteger(dhPrimeHex, 16);
    //const _dhPrimeBigInt = str2bigInt(dhPrimeHex, 16);
    
    //this.log('gABigInt.compareTo(BigInteger.ONE) <= 0', gABigInt.compareTo(BigInteger.ONE), BigInteger.ONE.compareTo(BigInteger.ONE), greater(_gABigInt, one));
    if(gABigInt.compareTo(BigInteger.ONE) <= 0) {
    //if(!greater(_gABigInt, one)) {
      throw new Error('[MT] DH params are not verified: gA <= 1');
    }
      
    /* this.log('gABigInt.compareTo(dhPrimeBigInt.subtract(BigInteger.ONE)) >= 0', gABigInt.compareTo(dhPrimeBigInt.subtract(BigInteger.ONE)),
      greater(gABigInt, sub(_dhPrimeBigInt, one))); */
    if(gABigInt.compareTo(dhPrimeBigInt.subtract(BigInteger.ONE)) >= 0) {
    //if(greater(gABigInt, sub(_dhPrimeBigInt, one))) {
      throw new Error('[MT] DH params are not verified: gA >= dhPrime - 1');
    }

    if(DEBUG) {
      this.log('1 < gA < dhPrime-1 OK');
    }
    
    
    var two = new BigInteger(/* null */'');
    two.fromInt(2);
    //const _two = int2bigInt(2, 10, 0);
    //this.log('_two:', bigInt2str(_two, 16), two.toString(16));
    var twoPow = two.pow(2048 - 64);
    //const _twoPow = powMod(_two, int2bigInt(2048 - 64, 10, 0), null);
    //this.log('twoPow:', twoPow.toString(16), bigInt2str(_twoPow, 16));
    
   // this.log('gABigInt.compareTo(twoPow) < 0');
    if(gABigInt.compareTo(twoPow) < 0) {
      throw new Error('[MT] DH params are not verified: gA < 2^{2048-64}');
    }
    if(gABigInt.compareTo(dhPrimeBigInt.subtract(twoPow)) >= 0) {
      throw new Error('[MT] DH params are not verified: gA > dhPrime - 2^{2048-64}');
    }

    if(DEBUG) {
      this.log('2^{2048-64} < gA < dhPrime-2^{2048-64} OK');
    }
    
    return true;
  }
  
  public async mtpSendSetClientDhParams(auth: AuthOptions): Promise<AuthOptions> {
    var gBytes = bytesFromHex(auth.g.toString(16));
    
    auth.b = new Array(256);
    auth.b = [...new Uint8Array(auth.b.length).randomize()];
    //MTProto.secureRandom.nextBytes(auth.b);
    
    try {
      var gB = await CryptoWorker.modPow(gBytes, auth.b, auth.dhPrime);
    } catch(error) {
      throw error;
    }
    
    var data = new TLSerialization({mtproto: true});
    data.storeObject({
      _: 'client_DH_inner_data',
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      retry_id: [0, auth.retry++],
      g_b: gB
    }, 'Client_DH_Inner_Data');
    
    //var dataWithHash = sha1BytesSync(data.getBuffer()).concat(data.getBytes());
    var dataWithHash = (await CryptoWorker.sha1Hash(data.getBuffer())).concat(data.getBytes());
    
    //var encryptedData = aesEncryptSync(dataWithHash, auth.tmpAesKey, auth.tmpAesIv);
    var encryptedData = await CryptoWorker.aesEncrypt(dataWithHash, auth.tmpAesKey, auth.tmpAesIv);
    
    var request = new TLSerialization({mtproto: true});
    request.storeMethod('set_client_DH_params', {
      nonce: auth.nonce,
      server_nonce: auth.serverNonce,
      encrypted_data: encryptedData
    });
    
    if(DEBUG) {
      this.log('Send set_client_DH_params');
    }
    
    try {
      var deserializer = await this.mtpSendPlainRequest(auth.dcId, request.getBytes(true));
    } catch(err) {
      throw err;
    }
    
    let response = deserializer.fetchObject('Set_client_DH_params_answer');
    
    if(response._ != 'dh_gen_ok' && response._ != 'dh_gen_retry' && response._ != 'dh_gen_fail') {
      throw new Error('[MT] Set_client_DH_params_answer response invalid: ' + response._);
    }
    
    if(!bytesCmp(auth.nonce, response.nonce)) {
      throw new Error('[MT] Set_client_DH_params_answer nonce mismatch');
    }
    
    if(!bytesCmp(auth.serverNonce, response.server_nonce)) {
      throw new Error('[MT] Set_client_DH_params_answer server_nonce mismatch');
    }
    
    try {
      var authKey = await CryptoWorker.modPow(auth.gA, auth.b, auth.dhPrime);
    } catch(err) {
      throw authKey;
    }
    
    //var authKeyHash = sha1BytesSync(authKey),
    let authKeyHash = await CryptoWorker.sha1Hash(authKey),
    authKeyAux = authKeyHash.slice(0, 8),
    authKeyId = authKeyHash.slice(-8);
    
    if(DEBUG) {
      this.log('Got Set_client_DH_params_answer', response._, authKey);
    }
    switch(response._) {
      case 'dh_gen_ok':
        var newNonceHash1 = (await CryptoWorker.sha1Hash(auth.newNonce.concat([1], authKeyAux))).slice(-16);
        //var newNonceHash1 = sha1BytesSync(auth.newNonce.concat([1], authKeyAux)).slice(-16);
        
        if(!bytesCmp(newNonceHash1, response.new_nonce_hash1)) {
          throw new Error('[MT] Set_client_DH_params_answer new_nonce_hash1 mismatch');
        }
        
        var serverSalt = bytesXor(auth.newNonce.slice(0, 8), auth.serverNonce.slice(0, 8));
        if(DEBUG) {
          this.log('Auth successfull!', authKeyId, authKey, serverSalt);
        }
        
        auth.authKeyId = authKeyId;
        auth.authKey = authKey;
        auth.serverSalt = serverSalt;
        
        return auth;
        break;
      
      case 'dh_gen_retry':
        //var newNonceHash2 = sha1BytesSync(auth.newNonce.concat([2], authKeyAux)).slice(-16);
        var newNonceHash2 = (await CryptoWorker.sha1Hash(auth.newNonce.concat([2], authKeyAux))).slice(-16);
        if(!bytesCmp(newNonceHash2, response.new_nonce_hash2)) {
          throw new Error('[MT] Set_client_DH_params_answer new_nonce_hash2 mismatch');
        }
        
        return this.mtpSendSetClientDhParams(auth);
      
      case 'dh_gen_fail':
        //var newNonceHash3 = sha1BytesSync(auth.newNonce.concat([3], authKeyAux)).slice(-16);
        var newNonceHash3 = (await CryptoWorker.sha1Hash(auth.newNonce.concat([3], authKeyAux))).slice(-16);
        if(!bytesCmp(newNonceHash3, response.new_nonce_hash3)) {
          throw new Error('[MT] Set_client_DH_params_answer new_nonce_hash3 mismatch');
        }
        
        throw new Error('[MT] Set_client_DH_params_answer fail');
    }
  }
  
  // mtpAuth
  public async auth(dcId: number): Promise<AuthOptions> {
    if(dcId in this.cached) {
      return this.cached[dcId];
    }
    
    let nonce = /* fNonce ? fNonce :  */new Uint8Array(16).randomize();
    /* var nonce = new Array(16);
    MTProto.secureRandom.nextBytes(nonce); */
    
    if(!dcConfigurator.chooseServer(dcId)) {
      return Promise.reject(new Error('[MT] No server found for dc ' + dcId));
    }

    try {
      let promise = this.mtpSendReqPQ({dcId, nonce});
      this.cached[dcId] = promise;
      return await promise;
    } catch(err) {
      delete this.cached[dcId];
      throw err;
    }
  }
}

export default new Authorizer();
