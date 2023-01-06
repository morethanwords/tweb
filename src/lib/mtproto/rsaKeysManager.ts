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

import {TLSerialization} from './tl_utils';
import cryptoWorker from '../crypto/cryptoMessagePort';
import Modes from '../../config/modes';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import bytesToHex from '../../helpers/bytes/bytesToHex';
import bigInt from 'big-integer';

export type RSAPublicKeyHex = {
  modulus: string,
  exponent: string
};

export class RSAKeysManager {
  /**
   *  Server public key, obtained from here: https://core.telegram.org/api/obtaining_api_id
   *
   *
   *  -----BEGIN RSA PUBLIC KEY-----
   *  MIIBCgKCAQEA6LszBcC1LGzyr992NzE0ieY+BSaOW622Aa9Bd4ZHLl+TuFQ4lo4g
   *  5nKaMBwK/BIb9xUfg0Q29/2mgIR6Zr9krM7HjuIcCzFvDtr+L0GQjae9H0pRB2OO
   *  62cECs5HKhT5DZ98K33vmWiLowc621dQuwKWSQKjWf50XYFw42h21P2KXUGyp2y/
   *  +aEyZ+uVgLLQbRA1dEjSDZ2iGRy12Mk5gpYc397aYp438fsJoHIgJ2lgMv5h7WY9
   *  t6N/byY9Nw9p21Og3AoXSL2q/2IJ1WRUhebgAdGVMlV1fkuOQoEzR7EdpqtQD9Cs
   *  5+bfo3Nhmcyvk5ftB0WkJ9z6bNZ7yxrP8wIDAQAB
   *  -----END RSA PUBLIC KEY-----
   *
   *  -----BEGIN RSA PUBLIC KEY-----
   *  MIIBCgKCAQEBadMIUYSKhyznMh+Pg+OxTLyDZrWEjQIPZC3oJCtuZX7qUxgcWqFX
   *  Q1952TSY8S8NYuz12sK9Fvp+lil1hIG0U/cuPsK08VB1hB4VA+p0S46fGwVsRovq
   *  4qUiUIzQSjSHDASuXTOinlYEHwmg/GaLc5G7qhePWa0p9YmqYR5Ha3xHJywcXZrn
   *  yE3nC9igL96Aanqv+Prbu1N+r9vAgZeHh9cfbtbV8WWwruOANOTEv2ctQLR0dfr9
   *  MwQXNePTPQlYsO9HNIGS1LWe7hZFtGBAVJH92F7Kig68WqHM3PIZ6Sq7N0VSzfzL
   *  b11Z/YHz2UXYtXADwL/m5pTpKBUtJBXkOQIDAQAB
   *  -----END RSA PUBLIC KEY-----
   *
   * Bytes can be got via
   * $ openssl rsa -in rsa.pem -RSAPublicKey_in -pubout > pub.pem
   * $ openssl rsa -pubin -in pub.pem -text -noout
   */

  /* private publisKeysHex = [{
    modulus: 'c150023e2f70db7985ded064759cfecf0af328e69a41daf4d6f01b538135a6f91f8f8b2a0ec9ba9720ce352efcf6c5680ffc424bd634864902de0b4bd6d49f4e580230e3ae97d95c8b19442b3c0a10d8f5633fecedd6926a7f6dab0ddb7d457f9ea81b8465fcd6fffeed114011df91c059caedaf97625f6c96ecc74725556934ef781d866b34f011fce4d835a090196e9a5f0e4449af7eb697ddb9076494ca5f81104a305b6dd27665722c46b60e5df680fb16b210607ef217652e60236c255f6a28315f4083a96791d7214bf64c1df4fd0db1944fb26a2a57031b32eee64ad15a8ba68885cde74a5bfc920f6abf59ba5c75506373e7130f9042da922179251f',
    exponent: '010001'
  }, {
    modulus: 'aeec36c8ffc109cb099624685b97815415657bd76d8c9c3e398103d7ad16c9bba6f525ed0412d7ae2c2de2b44e77d72cbf4b7438709a4e646a05c43427c7f184debf72947519680e651500890c6832796dd11f772c25ff8f576755afe055b0a3752c696eb7d8da0d8be1faf38c9bdd97ce0a77d3916230c4032167100edd0f9e7a3a9b602d04367b689536af0d64b613ccba7962939d3b57682beb6dae5b608130b2e52aca78ba023cf6ce806b1dc49c72cf928a7199d22e3d7ac84e47bc9427d0236945d10dbd15177bab413fbf0edfda09f014c7a7da088dde9759702ca760af2b8e4e97cc055c617bd74c3d97008635b98dc4d621b4891da9fb0473047927',
    exponent: '010001'
  }, {
    modulus: 'bdf2c77d81f6afd47bd30f29ac76e55adfe70e487e5e48297e5a9055c9c07d2b93b4ed3994d3eca5098bf18d978d54f8b7c713eb10247607e69af9ef44f38e28f8b439f257a11572945cc0406fe3f37bb92b79112db69eedf2dc71584a661638ea5becb9e23585074b80d57d9f5710dd30d2da940e0ada2f1b878397dc1a72b5ce2531b6f7dd158e09c828d03450ca0ff8a174deacebcaa22dde84ef66ad370f259d18af806638012da0ca4a70baa83d9c158f3552bc9158e69bf332a45809e1c36905a5caa12348dd57941a482131be7b2355a5f4635374f3bd3ddf5ff925bf4809ee27c1e67d9120c5fe08a9de458b1b4a3c5d0a428437f2beca81f4e2d5ff',
    exponent: '010001'
  }, {
    modulus: 'b3f762b739be98f343eb1921cf0148cfa27ff7af02b6471213fed9daa0098976e667750324f1abcea4c31e43b7d11f1579133f2b3d9fe27474e462058884e5e1b123be9cbbc6a443b2925c08520e7325e6f1a6d50e117eb61ea49d2534c8bb4d2ae4153fabe832b9edf4c5755fdd8b19940b81d1d96cf433d19e6a22968a85dc80f0312f596bd2530c1cfb28b5fe019ac9bc25cd9c2a5d8a0f3a1c0c79bcca524d315b5e21b5c26b46babe3d75d06d1cd33329ec782a0f22891ed1db42a1d6c0dea431428bc4d7aabdcf3e0eb6fda4e23eb7733e7727e9a1915580796c55188d2596d2665ad1182ba7abf15aaa5a8b779ea996317a20ae044b820bff35b6e8a1',
    exponent: '010001'
  }, {
    modulus: 'be6a71558ee577ff03023cfa17aab4e6c86383cff8a7ad38edb9fafe6f323f2d5106cbc8cafb83b869cffd1ccf121cd743d509e589e68765c96601e813dc5b9dfc4be415c7a6526132d0035ca33d6d6075d4f535122a1cdfe017041f1088d1419f65c8e5490ee613e16dbf662698c0f54870f0475fa893fc41eb55b08ff1ac211bc045ded31be27d12c96d8d3cfc6a7ae8aa50bf2ee0f30ed507cc2581e3dec56de94f5dc0a7abee0be990b893f2887bd2c6310a1e0a9e3e38bd34fded2541508dc102a9c9b4c95effd9dd2dfe96c29be647d6c69d66ca500843cfaed6e440196f1dbe0e2e22163c61ca48c79116fa77216726749a976a1c4b0944b5121e8c01',
    exponent: '010001'
  }]; */

  private testPublicKeysHex: RSAPublicKeyHex[] = [{
    modulus: 'c8c11d635691fac091dd9489aedced2932aa8a0bcefef05fa800892d9b52ed03200865c9e97211cb2ee6c7ae96d3fb0e15aeffd66019b44a08a240cfdd2868a85e1f54d6fa5deaa041f6941ddf302690d61dc476385c2fa655142353cb4e4b59f6e5b6584db76fe8b1370263246c010c93d011014113ebdf987d093f9d37c2be48352d69a1683f8f6e6c2167983c761e3ab169fde5daaa12123fa1beab621e4da5935e9c198f82f35eae583a99386d8110ea6bd1abb0f568759f62694419ea5f69847c43462abef858b4cb5edc84e7b9226cd7bd7e183aa974a712c079dde85b9dc063b8a5c08e8f859c0ee5dcd824c7807f20153361a7f63cfd2a433a1be7f5',
    exponent: '010001'
  }];

  private publisKeysHex: RSAPublicKeyHex[] = [{
    // modulus: '00e8bb3305c0b52c6cf2afdf7637313489e63e05268e5badb601af417786472e5f93b85438968e20e6729a301c0afc121bf7151f834436f7fda680847a66bf64accec78ee21c0b316f0edafe2f41908da7bd1f4a5107638eeb67040ace472a14f90d9f7c2b7def99688ba3073adb5750bb02964902a359fe745d8170e36876d4fd8a5d41b2a76cbff9a13267eb9580b2d06d10357448d20d9da2191cb5d8c93982961cdfdeda629e37f1fb09a0722027696032fe61ed663db7a37f6f263d370f69db53a0dc0a1748bdaaff6209d5645485e6e001d1953255757e4b8e42813347b11da6ab500fd0ace7e6dfa3736199ccaf9397ed0745a427dcfa6cd67bcb1acff3',
    modulus: 'e8bb3305c0b52c6cf2afdf7637313489e63e05268e5badb601af417786472e5f93b85438968e20e6729a301c0afc121bf7151f834436f7fda680847a66bf64accec78ee21c0b316f0edafe2f41908da7bd1f4a5107638eeb67040ace472a14f90d9f7c2b7def99688ba3073adb5750bb02964902a359fe745d8170e36876d4fd8a5d41b2a76cbff9a13267eb9580b2d06d10357448d20d9da2191cb5d8c93982961cdfdeda629e37f1fb09a0722027696032fe61ed663db7a37f6f263d370f69db53a0dc0a1748bdaaff6209d5645485e6e001d1953255757e4b8e42813347b11da6ab500fd0ace7e6dfa3736199ccaf9397ed0745a427dcfa6cd67bcb1acff3',
    exponent: '010001'
  }];

  private publicKeysParsed: {
    [hex: string]: RSAPublicKeyHex
  } = {};
  private prepared = false;
  private preparePromise: Promise<void> = null;

  constructor() {
    if(Modes.test) {
      this.publisKeysHex = this.testPublicKeysHex;
    }
  }

  public prepare(): Promise<void> {
    if(this.preparePromise) return this.preparePromise;
    else if(this.prepared) {
      return Promise.resolve();
    }

    return this.preparePromise = Promise.all(this.publisKeysHex.map((keyParsed) => {
      const RSAPublicKey = new TLSerialization();
      RSAPublicKey.storeBytes(bytesFromHex(keyParsed.modulus), 'n');
      RSAPublicKey.storeBytes(bytesFromHex(keyParsed.exponent), 'e');

      const buffer = RSAPublicKey.getBuffer();

      return cryptoWorker.invokeCrypto('sha1', buffer).then((bytes) => {
        const fingerprintBytes = bytes.slice(-8);
        fingerprintBytes.reverse();

        this.publicKeysParsed[bytesToHex(fingerprintBytes).toLowerCase()] = {
          modulus: keyParsed.modulus,
          exponent: keyParsed.exponent
        };
      });
    })).then(() => {
      this.prepared = true;

      // console.log('[MT] Prepared keys');
      this.preparePromise = null;
    });
  }

  public async select(fingerprints: Array<string>) {
    await this.prepare();

    for(let i = 0; i < fingerprints.length; ++i) {
      let fingerprintHex = bigInt(fingerprints[i]).toString(16).toLowerCase();

      if(fingerprintHex.length < 16) {
        fingerprintHex = new Array(16 - fingerprintHex.length).fill('0').join('') + fingerprintHex;
      }

      // console.log(fingerprintHex, this.publicKeysParsed);
      const foundKey = this.publicKeysParsed[fingerprintHex];
      if(foundKey) {
        return Object.assign({
          fingerprint: fingerprints[i]
        }, foundKey);
      }
    }
  }
}

export default new RSAKeysManager();
