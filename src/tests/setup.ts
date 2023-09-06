import crypto from 'crypto';

Object.defineProperty(global.self, 'crypto', {
  value: {
    subtle: crypto.webcrypto.subtle,
    getRandomValues: crypto.webcrypto.getRandomValues.bind(crypto.webcrypto)
  }
});
