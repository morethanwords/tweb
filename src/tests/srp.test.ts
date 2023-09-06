import '../lib/crypto/crypto.worker';
import '../lib/polyfill';
import {salt1, salt2, srp_id, password, A, M1, passwordHashed, accountPassword} from '../mock/srp';
import computeSRP, {makePasswordHash} from '../lib/crypto/srp';
import assumeType from '../helpers/assumeType';
import {InputCheckPasswordSRP} from '../layer';

test('2FA hash', async() => {
  const bytes = await makePasswordHash(password, salt1, salt2);
  expect(bytes).toEqual(passwordHashed);
}, 1000);

test('2FA whole (with negative)', () => {
  return computeSRP(password, accountPassword, false).then((res) => {
    assumeType<InputCheckPasswordSRP.inputCheckPasswordSRP>(res);

    expect(res.srp_id).toEqual(srp_id);
    expect(res.A).toEqual(A);
    expect(res.M1).toEqual(M1);

    return res;
  }).catch((err) => {
    throw err;
  });
}, 10000);
