import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import {cryptoMethodsRegistry} from '@lib/crypto/cryptoMethodsRegistry';

let registered = false;

export function registerInlineCrypto() {
  if(registered) return;
  registered = true;

  cryptoMessagePort.addEventListener('invoke', ({method, args}) => {
    // @ts-ignore
    const result: any = cryptoMethodsRegistry[method](...args);
    return result;
  });
}
