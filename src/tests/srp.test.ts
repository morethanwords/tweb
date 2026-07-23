import nodeCrypto from 'crypto';
import '../lib/crypto/crypto.worker';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import computeSRP, {makePasswordHash} from '@lib/crypto/srp';
import {salt1, salt2, p as pBytes, g as gNum} from '../mock/srp';
import {AccountPassword, InputCheckPasswordSRP} from '@layer';
import bigInt from 'big-integer';
import {bigIntFromBytes, bigIntToBytes} from '@helpers/bigInt/bigIntConversion';
import addPadding from '@helpers/bytes/addPadding';
import bufferConcats from '@helpers/bytes/bufferConcats';
import bytesXor from '@helpers/bytes/bytesXor';
import bytesToHex from '@helpers/bytes/bytesToHex';
import assumeType from '@helpers/assumeType';
import {randomBytes} from '@helpers/random';

// Keep the whole @helpers/random module real, but make randomBytes a spy so a
// single computeSRP run can be fed a chosen ephemeral `a` (leading-zero-A test).
vi.mock('@helpers/random', async(importOriginal) => {
  const actual: any = await importOriginal();
  return {...actual, randomBytes: vi.fn(actual.randomBytes)};
});

const TIMEOUT = 60000;

// The mock prime is the well-known 2048-bit safe prime, g = 3 — exactly what
// verifyDhPrimeAndGenerator fast-accepts, so the SRP config check passes.
const p = bigIntFromBytes(pBytes);
const g = bigInt(gNum);

const sha256 = (data: Uint8Array) => cryptoWorker.invokeCrypto('sha256', data);
const pad256 = (bi: bigInt.BigInteger) => addPadding(bigIntToBytes(bi), 256, true, true, true);

function makeState(srp_B: Uint8Array): AccountPassword.accountPassword {
  return {
    _: 'account.password',
    current_algo: {
      _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
      salt1,
      salt2,
      p: pBytes,
      g: gNum
    },
    srp_id: '14665952836034598759',
    srp_B,
    secure_random: new Uint8Array(256), // no longer used by computeSRP
    pFlags: {},
    new_algo: null,
    new_secure_algo: null
  };
}

const password = 'correct horse battery staple';

let x: bigInt.BigInteger; // password hash
let v: bigInt.BigInteger; // verifier g^x mod p (server-stored)
let k: bigInt.BigInteger; // sha256(p | g)

beforeAll(async() => {
  x = bigIntFromBytes(await makePasswordHash(password, salt1, salt2));
  v = g.modPow(x, p);
  k = bigIntFromBytes(await sha256(bufferConcats(pad256(p), pad256(g))));
}, TIMEOUT);

// Spec-correct (tdlib) server: pick secret b, publish B = (k*v + g^b) mod p.
function serverPublishB(): {b: bigInt.BigInteger, B: bigInt.BigInteger, srp_B: Uint8Array} {
  for(;;) {
    const b = bigIntFromBytes(randomBytes(256));
    const B = k.multiply(v).add(g.modPow(b, p)).mod(p);
    const len = bigIntToBytes(B).length;
    if(B.greater(bigInt.zero) && B.lesser(p) && len >= 248 && len <= 256) {
      return {b, B, srp_B: pad256(B)};
    }
  }
}

// Server side of the check: recompute M1 from the canonical 256-byte A/B and
// compare to what the client sent. This is what Telegram does server-side.
async function serverAccepts(out: InputCheckPasswordSRP.inputCheckPasswordSRP, b: bigInt.BigInteger, B: bigInt.BigInteger) {
  const A = bigIntFromBytes(out.A);
  // The server also rejects degenerate A; mirror the essential bound.
  if(!A.greater(bigInt.one) || !A.lesser(p)) return false;

  const u = bigIntFromBytes(await sha256(bufferConcats(pad256(A), pad256(B))));
  const S = A.multiply(v.modPow(u, p)).mod(p).modPow(b, p);
  const K = await sha256(pad256(S));

  const h1 = bytesXor(await sha256(pad256(p)), await sha256(pad256(g)));
  const M1s = await sha256(bufferConcats(
    h1,
    await sha256(salt1),
    await sha256(salt2),
    pad256(A),
    pad256(B),
    K
  ));

  return bytesToHex(M1s) === bytesToHex(out.M1);
}

test('makePasswordHash matches an independent Node-crypto reference', async() => {
  const ref = (() => {
    const sha = (d: Uint8Array) => Uint8Array.from(nodeCrypto.createHash('sha256').update(d).digest());
    const cat = (...parts: Uint8Array[]) => {
      const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
      let off = 0;
      for(const x of parts) {
        out.set(x, off);
        off += x.length;
      }
      return out;
    };
    let buf = sha(cat(salt1, new TextEncoder().encode(password), salt1));
    buf = sha(cat(salt2, buf, salt2));
    const hash = cat(salt2, Uint8Array.from(nodeCrypto.pbkdf2Sync(buf, salt1, 100000, 64, 'sha512')), salt2);
    return sha(hash);
  })();

  const got = await makePasswordHash(password, salt1, salt2);
  expect(bytesToHex(got)).toEqual(bytesToHex(ref));
}, TIMEOUT);

test('SRP round-trip: the server accepts every freshly computed M1', async() => {
  for(let i = 0; i < 25; ++i) {
    const {b, B, srp_B} = serverPublishB();
    const out = await computeSRP(password, makeState(srp_B), false);
    assumeType<InputCheckPasswordSRP.inputCheckPasswordSRP>(out);

    expect(out._).toEqual('inputCheckPasswordSRP');
    expect(out.A.length).toEqual(256); // always padded to 256 bytes
    expect(await serverAccepts(out, b, B)).toBe(true);
  }
}, TIMEOUT);

test('SRP accepts even when g^a mod p has a leading zero byte (padding regression)', async() => {
  // Find an `a` whose public value A = g^a mod p is < 2^2040, i.e. its minimal
  // big-endian form is shorter than 256 bytes (a leading zero). This is the
  // ~1/256 case that, unpadded, made a correct password fail. modPow only, no
  // PBKDF2, so the search is cheap.
  let forcedA: ReturnType<typeof randomBytes>;
  for(let i = 0; ; ++i) {
    const candidate = randomBytes(256);
    const A = g.modPow(bigIntFromBytes(candidate), p);
    if(bigIntToBytes(A).length < 256) {
      forcedA = candidate;
      break;
    }
    if(i > 5000) throw new Error('could not find a leading-zero A');
  }

  // Sanity: confirm the forced A really is short, so the test exercises the bug.
  const shortA = bigIntToBytes(g.modPow(bigIntFromBytes(forcedA), p));
  expect(shortA.length).toBeLessThan(256);

  const {b, B, srp_B} = serverPublishB();
  vi.mocked(randomBytes).mockReturnValueOnce(forcedA); // computeSRP's only randomBytes call
  const out = await computeSRP(password, makeState(srp_B), false);
  assumeType<InputCheckPasswordSRP.inputCheckPasswordSRP>(out);

  expect(out.A.length).toEqual(256);   // padded back up to 256
  expect(out.A[0]).toEqual(0);         // the leading zero is preserved, not stripped
  expect(await serverAccepts(out, b, B)).toBe(true); // would be false with the old unpadded A
}, TIMEOUT);

test('isNew path returns the verifier v padded to 256 bytes', async() => {
  const state = makeState(new Uint8Array(256));
  state.new_algo = state.current_algo;
  const out = await computeSRP(password, state, true);
  assumeType<Uint8Array>(out);
  expect(out.length).toEqual(256);
  expect(bytesToHex(out)).toEqual(bytesToHex(pad256(v)));
}, TIMEOUT);

describe('validation (matches tdlib get_input_check_password)', () => {
  test('rejects out-of-range srp_B (0)', async() => {
    await expect(computeSRP(password, makeState(new Uint8Array(256)), false)).rejects.toThrow(/out of range/);
  }, TIMEOUT);

  test('rejects srp_B with an invalid length', async() => {
    await expect(computeSRP(password, makeState(new Uint8Array(100)), false)).rejects.toThrow(/length/);
  }, TIMEOUT);

  test('rejects a tampered prime', async() => {
    const {srp_B} = serverPublishB();
    const state = makeState(srp_B);
    const badP = new Uint8Array(pBytes);
    badP[badP.length - 1] ^= 1; // make it even => composite, and != known prime
    (state.current_algo as any).p = badP;
    await expect(computeSRP(password, state, false)).rejects.toThrow(/\[DH\]/);
  }, TIMEOUT);
});
