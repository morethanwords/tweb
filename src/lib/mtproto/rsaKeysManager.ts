/*
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {TLSerialization} from '@lib/mtproto/tl_utils';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import Modes from '@config/modes';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bigInt from 'big-integer';

export type RSAPublicKeyHex = {
  modulus: string,
  exponent: string
};

export class RSAKeysManager {
  private testPublicKeysHex: RSAPublicKeyHex[] = [{
    modulus: import.meta.env.VITE_RSA_TEST_MODULUS || 'C45FFFD0CD3EFF93F381D35A8135FE27E74982BEF96424EE886F22E31ED8C26245FA388E1828E6ED7EC12C268C735FA13996032F7F86BE57BF00ACA45B5AA8B9A089315C7F1FEDA5F0B1572DE959D8F2DAC136FC03B0654EA5B32F775BE41BA030D5B388BF53BA147C227D5BC0A634ED056947D8A7E738C0B0018B064FA61ADD039D5C8C7F55E8A7694B0853669B4178CA470079A2C20883DB19675D9622D8F31104848E063B697553791933020E74E9C018916D8140284DEF851D1E85D6CF5A742559075B5E2FF85FF51F9699E909C32815CF4318107EF2E94E3D4F8E7EFD6ECE17A5FA8345B48F5B924ABB18E2A37BB70C5B4DA77DCDD199EF2B3EF6FF8FB9',
    exponent: import.meta.env.VITE_RSA_TEST_EXPONENT || '010001'
  }];

  private publisKeysHex: RSAPublicKeyHex[] = [{
    modulus: import.meta.env.VITE_RSA_MODULUS || 'C45FFFD0CD3EFF93F381D35A8135FE27E74982BEF96424EE886F22E31ED8C26245FA388E1828E6ED7EC12C268C735FA13996032F7F86BE57BF00ACA45B5AA8B9A089315C7F1FEDA5F0B1572DE959D8F2DAC136FC03B0654EA5B32F775BE41BA030D5B388BF53BA147C227D5BC0A634ED056947D8A7E738C0B0018B064FA61ADD039D5C8C7F55E8A7694B0853669B4178CA470079A2C20883DB19675D9622D8F31104848E063B697553791933020E74E9C018916D8140284DEF851D1E85D6CF5A742559075B5E2FF85FF51F9699E909C32815CF4318107EF2E94E3D4F8E7EFD6ECE17A5FA8345B48F5B924ABB18E2A37BB70C5B4DA77DCDD199EF2B3EF6FF8FB9',
    exponent: import.meta.env.VITE_RSA_EXPONENT || '010001'
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
