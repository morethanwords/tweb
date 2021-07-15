import { salt1, salt2, g, p, srp_id, secure_random, srp_B, password, A, M1, passwordHashed } from '../mock/srp';
import { computeSRP, makePasswordHash } from '../lib/crypto/srp';
import '../lib/polyfill';
import assumeType from '../helpers/assumeType';
import { InputCheckPasswordSRP } from '../layer';

test('2FA hash', async() => {
  const bytes = await makePasswordHash(password, salt1, salt2);
  expect(bytes).toEqual(passwordHashed);
});

test('2FA whole (with negative)', async() => {
  return await computeSRP(password, {
    _: 'account.password',
    current_algo: {
      _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
      salt1, 
      salt2,
      p,
      g
    },
    srp_id,
    srp_B,
    secure_random,
    
    new_algo: null,
    new_secure_algo: null
  }, false).then((res) => {
    assumeType<InputCheckPasswordSRP.inputCheckPasswordSRP>(res);
    
    expect(res.srp_id).toEqual(srp_id);
    expect(res.A).toEqual(A);
    expect(res.M1).toEqual(M1);

    return res;
  }).catch(err => {
    throw err;
  });
});
