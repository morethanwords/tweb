import apiManager from "./apiManager";
import { bufferConcats, bytesToHex, bytesFromHex, bufferConcat, bytesXor } from "../bin_utils";
import CryptoWorker from "../crypto/cryptoworker";
import {str2bigInt, greater, isZero,
  // @ts-ignore
  bigInt2str, powMod, int2bigInt, mult, mod, sub, bitSize, negative, mult, add} from 'leemon';

export class PasswordManager {
  public getState(options: any = {}) {
    return apiManager.invokeApi('account.getPassword', {}, options).then((result) => {
      return result
    });
  }

  /* public updateSettings(state: any, settings: any) {
    var currentHashPromise;
    var newHashPromise;
    var params: any = {
      new_settings: {
        _: 'account.passwordInputSettings',
        flags: 0,
        hint: settings.hint || ''
      }
    };

    if(typeof settings.cur_password === 'string' &&
      settings.cur_password.length > 0) {
      currentHashPromise = this.makePasswordHash(state.current_salt, settings.cur_password);
    } else {
      currentHashPromise = Promise.resolve([]);
    }

    if (typeof settings.new_password === 'string' &&
      settings.new_password.length > 0) {
      var saltRandom = new Array(8);
      var newSalt = bufferConcat(state.new_salt, saltRandom);
      secureRandom.nextBytes(saltRandom);
      newHashPromise = this.makePasswordHash(newSalt, settings.new_password);
      params.new_settings.new_salt = newSalt;
      params.new_settings.flags |= 1;
    } else {
      if(typeof settings.new_password === 'string') {
        params.new_settings.flags |= 1;
        params.new_settings.new_salt = [];
      }
      newHashPromise = Promise.resolve([]);
    }

    if(typeof settings.email === 'string') {
      params.new_settings.flags |= 2;
      params.new_settings.email = settings.email || '';
    }

    return Promise.all([currentHashPromise, newHashPromise]).then((hashes) => {
      params.current_password_hash = hashes[0];
      params.new_settings.new_password_hash = hashes[1];

      return apiManager.invokeApi('account.updatePasswordSettings', params);
    });
  } */

  public check(state: any, password: string, options: any = {}) {
    return this.computeCheck(password, state).then((inputCheckPassword) => {
      return apiManager.invokeApi('auth.checkPassword', {
        password: inputCheckPassword
      }, options);
    });
  }

  public requestRecovery(options: any = {}) {
    return apiManager.invokeApi('auth.requestPasswordRecovery', {}, options);
  }

  public recover(code: any, options: any = {}) {
    return apiManager.invokeApi('auth.recoverPassword', {
      code: code
    }, options);
  }

  public makePasswordHash(password: string, client_salt: Uint8Array, server_salt: Uint8Array) {
    var passwordUTF8 = unescape(encodeURIComponent(password));

    // @ts-ignore
    const textEncoder = new TextEncoder("utf-8");
    const passwordBuffer = textEncoder.encode(passwordUTF8);

    // right

    let buffer = bufferConcats(client_salt, passwordBuffer, client_salt);

    return CryptoWorker.sha256Hash(buffer).then((buffer: any) => {
      console.log('encoded 1', bytesToHex(new Uint8Array(buffer)));

      buffer = bufferConcats(server_salt, buffer, server_salt);
      return CryptoWorker.sha256Hash(buffer).then((buffer: any) => {

        console.log('encoded 2', buffer, bytesToHex(new Uint8Array(buffer)));

        return CryptoWorker.pbkdf2(new Uint8Array(buffer), client_salt, 100000).then((hash: any) => {
          console.log('encoded 3', hash, bytesToHex(new Uint8Array(hash)));

          hash = bufferConcats(server_salt, hash, server_salt);
          return CryptoWorker.sha256Hash(hash).then((buffer: any) => {
            console.log('got password hash:', buffer, bytesToHex(new Uint8Array(buffer)));

            return buffer;
          });
        });
      });
    });
  }

  public async computeCheck(password: string, state: any) {
    let algo = state.current_algo;

    let p = str2bigInt(bytesToHex(algo.p), 16);
    let B = str2bigInt(bytesToHex(state.srp_B), 16);
    let g = int2bigInt(algo.g, 32, 256);

    console.log('p', bigInt2str(p, 16));
    console.log('B', bigInt2str(B, 16));

    /* if(B.compareTo(BigInteger.ZERO) < 0) {
      console.error('srp_B < 0')
    }

    if(B.compareTo(p) <= 0) {
      console.error('srp_B <= p');
    } */

    /* let check_prime_and_good = (bytes: any, g: number) => {
      let good_prime = 'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b';
      
      if(bytesToHex(bytes) == good_prime && [3, 4, 5, 7].indexOf(g) !== -1) {
        return true;
      }

      // TO-DO check_prime_and_good_check
    }; */

    //check_prime_and_good(algo.p, g);

    let pw_hash = await this.makePasswordHash(password, new Uint8Array(algo.salt1), 
      new Uint8Array(algo.salt2)) as ArrayBuffer;
    let x = str2bigInt(bytesToHex(new Uint8Array(pw_hash)), 16);

    console.warn('computed pw_hash:', pw_hash, x, bytesToHex(new Uint8Array(pw_hash)));


    var padArray = function(arr: any[], len: number, fill = 0) {
      return Array(len).fill(fill).concat(arr).slice(-len);
    };

    let pForHash = padArray(bytesFromHex(bigInt2str(p, 16)), 256);
    let gForHash = padArray(bytesFromHex(bigInt2str(g, 16)), 256); // like uint8array
    let b_for_hash = padArray(bytesFromHex(bigInt2str(B, 16)), 256);

    console.log(bytesToHex(pForHash));
    console.log(bytesToHex(gForHash));
    console.log(bytesToHex(b_for_hash));

    let g_x = powMod(g, x, p);

    console.log('g_x', bigInt2str(g_x, 16));

    let k: any = await CryptoWorker.sha256Hash(bufferConcat(pForHash, gForHash));
    k = str2bigInt(bytesToHex(new Uint8Array(k)), 16);

    console.log('k', bigInt2str(k, 16));

    // kg_x = (k * g_x) % p
    let kg_x = mod(mult(k, g_x), p);

    // good

    console.log('kg_x', bigInt2str(kg_x, 16));

    let is_good_mod_exp_first = (modexp: any, prime: any) => {
      let diff = sub(prime, modexp);
      let min_diff_bits_count = 2048 - 64;
      let max_mod_exp_size = 256;
      if(negative(diff) ||
        bitSize(diff) < min_diff_bits_count || 
        bitSize(modexp) < min_diff_bits_count || 
        Math.floor((bitSize(modexp) + 7) / 8) > max_mod_exp_size)
          return false;
      return true;
    };

    let generate_and_check_random = async() => {
      //let random_size = 256;
      while(true) {
        /* let a = addPadding([], random_size, false, true);
        a = str2bigInt(bytesToHex(a), 16); */
        //let a = randBigInt(random_size, 1);
        let a = str2bigInt(bytesToHex(state.secure_random), 16);

        /* console.log('a', bigInt2str(a, 16));
        break; */

        let A = powMod(g, a, p);
        //console.log('A', bigInt2str(A, 16));
        if(is_good_mod_exp_first(A, p)) {
          // a_for_hash = big_num_for_hash(A)
          let a_for_hash = bytesFromHex(bigInt2str(A, 16));

          let s: any = await CryptoWorker.sha256Hash(
            bufferConcat(new Uint8Array(a_for_hash), new Uint8Array(b_for_hash)));
          let u = str2bigInt(bytesToHex(new Uint8Array(s)), 16);
          //if(u > 0)
          if(!isZero(u) && !negative(u))
            return {a, a_for_hash, u};
        } 
      }
    }
      

    let {a, a_for_hash, u} = await generate_and_check_random();

    console.log('a', bigInt2str(a, 16));
    console.log('a_for_hash', bytesToHex(a_for_hash));
    console.log('u', bigInt2str(u, 16));

    // g_b = (B - kg_x) % p
    console.log('B - kg_x', bigInt2str(sub(B, kg_x), 16));
    //let g_b = mod(sub(B, kg_x), p);
    /* let g_b = sub(B, kg_x);
    if(negative(g_b)) g_b = add(g_b, p);
    else g_b = mod(g_b, p); */
    /* let g_b; // g_b = sub(mod(B, p), kg_x);
    if(!negative(sub(B, kg_x))) g_b = sub(mod(B, p), kg_x);
    else g_b = mod(sub(B, kg_x), p); */
    /* let lol = trim(sub(B, kg_x), 10);
    console.log('llalala', bigInt2str(lol, 16)); */
    let g_b;
    if(!greater(B, kg_x)) {
      console.log('negative');
      g_b = add(B, p);
    } else g_b = B;
    g_b = mod(sub(g_b, kg_x), p);
    //g_b = mod(g_b, p);
    //console.log('g_b', bigInt2str(g_b, 16));

    /* if(!is_good_mod_exp_first(g_b, p))
      throw new Error('bad g_b'); */

    let ux = mult(u, x);
    let a_ux = add(a, ux);
    let S = powMod(g_b, a_ux, p);

    let K: any = await CryptoWorker.sha256Hash(padArray(bytesFromHex(bigInt2str(S, 16)), 256));

    let h1: any = await CryptoWorker.sha256Hash(pForHash);
    let h2: any = await CryptoWorker.sha256Hash(gForHash);
    h1 = bytesXor(new Uint8Array(h1), new Uint8Array(h2));

    /* let buff = bufferConcat(h1, await CryptoWorker.sha256Hash(algo.salt1));
    buff = bufferConcat(buff, await CryptoWorker.sha256Hash(algo.salt2));
    buff = bufferConcat(buff, a_for_hash);
    buff = bufferConcat(buff, b_for_hash);
    buff = bufferConcat(buff, K); */
    let buff = bufferConcats(h1, 
      await CryptoWorker.sha256Hash(algo.salt1),
      await CryptoWorker.sha256Hash(algo.salt2),
      a_for_hash,
      b_for_hash,
      K
    );

    let M1: any = await CryptoWorker.sha256Hash(buff);

    let out = {
      _: 'inputCheckPasswordSRP', 
      srp_id: state.srp_id, 
      A: new Uint8Array(a_for_hash), 
      M1: new Uint8Array(M1) 
    };


    console.log('out', bytesToHex(out.A), bytesToHex(out.M1));
    return out;
    
    /* console.log(gForHash, pForHash, bForHash); */
  }
}

export default new PasswordManager();
