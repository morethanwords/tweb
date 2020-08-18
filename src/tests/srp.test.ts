import { salt1, salt2, g, p, srp_id, secure_random, srp_B, password, A, M1, passwordHashed } from '../mock/srp';
import { computeSRP, makePasswordHash } from '../lib/crypto/srp';

test('2FA hash', async() => {
  const bytes = await makePasswordHash(password, salt1, salt2);
  expect(bytes).toEqual(passwordHashed);
});

test('2FA whole (with negative)', async() => {
  return await computeSRP(password, {
    current_algo: {
      salt1, 
      salt2,
      p,
      g
    },
    srp_id,
    srp_B,
    secure_random
  }).then(res => {
    expect(res.srp_id).toEqual(srp_id);
    expect(res.A).toEqual(A);
    expect(res.M1).toEqual(M1);

    return res;
  }).catch(err => {
    throw err;
  });
});
