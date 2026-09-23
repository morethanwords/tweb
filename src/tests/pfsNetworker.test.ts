import '../lib/crypto/crypto.worker';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import MTPNetworker from '@lib/mtproto/networker';
import TempAuthKeys, {TEMP_AUTH_KEY_EXPIRES_IN} from '@lib/mtproto/tempAuthKeys';
import {MTAuthKey} from '@lib/mtproto/authKey';
import {TimeManager} from '@lib/mtproto/timeManager';
import {MessageKeyUtils} from '@lib/mtproto/messageKeyUtils';
import {TLDeserialization} from '@lib/mtproto/tl_utils';
import Schema from '@lib/mtproto/schema';
import longFromBytes from '@helpers/long/longFromBytes';
import bytesCmp from '@helpers/bytes/bytesCmp';
import {randomBytes} from '@helpers/random';
import tsNow from '@helpers/tsNow';

// Perfect Forward Secrecy in the networker, without a server: the binding
// message, and how a networker moves between temporary keys.

const makePermAuthKey = () => MTAuthKey.fromKey(randomBytes(256));

async function makeTempAuthKey() {
  const authKey = await makePermAuthKey();
  authKey.expiresAt = tsNow(true) + TEMP_AUTH_KEY_EXPIRES_IN;
  authKey.serverSalt = randomBytes(8);
  return authKey;
}

function makeNetworker(options: Partial<ConstructorParameters<typeof MTPNetworker>[0]>) {
  return new MTPNetworker({
    timeManager: new TimeManager(),
    dcId: 2,
    permAuthKey: undefined,
    isFileUpload: false,
    isFileDownload: false,
    getInitConnectionParams: () => ({id: 1}),
    getBaseDcId: async() => 2,
    ...options
  });
}

function makeTempAuthKeys(permAuthKey: MTAuthKey) {
  return new TempAuthKeys({
    permAuthKey,
    timeManager: new TimeManager(),
    log: Object.assign(() => {}, {warn: () => {}, error: () => {}}) as any,
    createTransport: () => {
      throw new Error('no network here');
    },
    authTemp: undefined,
    createNetworker: undefined
  });
}

// * a networker over temporary keys, handed `authKey` by its holder of keys
async function makePfsNetworker(authKey?: MTAuthKey) {
  const permAuthKey = await makePermAuthKey();
  const tempAuthKeys = makeTempAuthKeys(permAuthKey);
  const getAuthKey = vi.spyOn(tempAuthKeys, 'getAuthKey').mockReturnValue(authKey);
  const networker = makeNetworker({permAuthKey, tempAuthKeys});
  return {networker, tempAuthKeys, getAuthKey};
}

const sentMessages = (networker: MTPNetworker) => (networker as any).sentMessages as Record<string, any>;
const pendingMessages = (networker: MTPNetworker) => (networker as any).pendingMessages as Record<string, number>;
const authKeyOf = (networker: MTPNetworker) => (networker as any).authKey as MTAuthKey;
const hasAuthKey = (networker: MTPNetworker) => (networker as any).hasAuthKey() as boolean;

describe('auth.bindTempAuthKey', () => {
  test('carries the MTProto 1.0 binding message sealed with the permanent key', async() => {
    const permAuthKey = await makePermAuthKey();
    const authKey = await makeTempAuthKey();
    const networker = makeNetworker({permAuthKey, authKey, serverSalt: authKey.serverSalt});
    const sessionId: Uint8Array = (networker as any).sessionId;

    networker.bindTempAuthKey().catch(() => {});
    const message = await vi.waitFor(() => {
      const message = Object.values(sentMessages(networker)).find((message) => message.bindTempAuthKey);
      expect(message).toBeDefined();
      return message;
    });
    expect(message.resultType).toBe('Bool');
    expect(message.seq_no % 2).toBe(1);

    const outer = new TLDeserialization<MTLong>(message.body, {mtproto: true});
    const method = Schema.API.methods.find((method) => method.method === 'auth.bindTempAuthKey');
    expect(outer.fetchInt()).toBe(+method.id);
    const permAuthKeyId = outer.fetchLong();
    const nonce = outer.fetchLong();
    const expiresAt = outer.fetchInt();
    const encrypted: Uint8Array = outer.fetchBytes();
    expect(permAuthKeyId).toBe(longFromBytes(permAuthKey.id));
    expect(expiresAt).toBe(authKey.expiresAt);

    // * auth_key_id + msg_key + AES-IGE, keys derived the 1.0 way (x = 0)
    expect(bytesCmp(encrypted.slice(0, 8), permAuthKey.id)).toBe(true);
    const msgKey = encrypted.slice(8, 24);
    const {aesKey, aesIv} = await MessageKeyUtils.getAesKeyIv(permAuthKey.key, msgKey, false, true);
    const plain = new Uint8Array(await cryptoWorker.invokeCrypto('aes-decrypt', encrypted.slice(24), aesKey, aesIv));
    expect(plain.length % 16).toBe(0);

    const inner = new TLDeserialization<MTLong>(plain, {mtproto: true});
    inner.fetchIntBytes(128, true, 'random');
    expect(inner.fetchLong()).toBe(message.msg_id);
    expect(inner.fetchInt()).toBe(0);
    const length = inner.fetchInt();
    const bind = inner.fetchObject('BindAuthKeyInner');
    expect(bind).toEqual({
      _: 'bind_auth_key_inner',
      nonce,
      temp_auth_key_id: longFromBytes(authKey.id),
      perm_auth_key_id: longFromBytes(permAuthKey.id),
      temp_session_id: longFromBytes(sessionId),
      expires_at: authKey.expiresAt
    });

    // * msg_key of 1.0: SHA1 of the plaintext without the padding
    const hash = await cryptoWorker.invokeCrypto('sha1', plain.slice(0, 32 + length));
    expect(bytesCmp(hash.slice(4, 20), msgKey)).toBe(true);
  });
});

describe('networker over temporary keys', () => {
  test('holds everything until there is a key, then sends it under fresh ids', async() => {
    const {networker, getAuthKey} = await makePfsNetworker();

    networker.wrapApiCall('help.getConfig').catch(() => {});
    const [msgId] = Object.keys(sentMessages(networker));
    expect(pendingMessages(networker)[msgId]).toBe(0);
    expect(authKeyOf(networker)).toBeUndefined();

    const authKey = await makeTempAuthKey();
    getAuthKey.mockReturnValue(authKey);
    const sessionId = (networker as any).sessionId;
    hasAuthKey(networker);

    expect(authKeyOf(networker)).toBe(authKey);
    expect((networker as any).serverSalt).toBe(authKey.serverSalt);
    expect((networker as any).sessionId).not.toBe(sessionId);
    expect(networker.connectionInited).toBe(false);
    const [newMsgId] = Object.keys(sentMessages(networker));
    expect(newMsgId).not.toBe(msgId);
    expect(sentMessages(networker)[newMsgId].seq_no).toBe(1);
    expect(pendingMessages(networker)[newMsgId]).toBeDefined();
    expect(pendingMessages(networker)[msgId]).toBeUndefined();
  });

  test('stays on its key while it is good and moves on once it expires or is gone', async() => {
    const firstAuthKey = await makeTempAuthKey();
    const {networker, getAuthKey} = await makePfsNetworker(firstAuthKey);
    hasAuthKey(networker);
    expect(authKeyOf(networker)).toBe(firstAuthKey);

    const secondAuthKey = await makeTempAuthKey();
    getAuthKey.mockReturnValue(secondAuthKey);
    expect(hasAuthKey(networker)).toBe(true);
    expect(authKeyOf(networker)).toBe(firstAuthKey);

    firstAuthKey.expiresAt = tsNow(true) - 1;
    hasAuthKey(networker);
    expect(authKeyOf(networker)).toBe(secondAuthKey);

    const thirdAuthKey = await makeTempAuthKey();
    getAuthKey.mockReturnValue(thirdAuthKey);
    secondAuthKey.invalid = true;
    hasAuthKey(networker);
    expect(authKeyOf(networker)).toBe(thirdAuthKey);
  });

  test('-404 and AUTH_KEY_PERM_EMPTY give the key up and keep the request', async() => {
    const authKey = await makeTempAuthKey();
    const {networker, tempAuthKeys} = await makePfsNetworker(authKey);
    const invalidate = vi.spyOn(tempAuthKeys, 'invalidate').mockImplementation(() => {});
    hasAuthKey(networker);

    const promise = networker.wrapApiCall('help.getConfig');
    let settled = false;
    promise.then(() => settled = true, () => settled = true);
    const [msgId] = Object.keys(sentMessages(networker));

    networker.processMessage({
      _: 'rpc_result',
      req_msg_id: msgId,
      result: {_: 'rpc_error', error_code: 401, error_message: 'AUTH_KEY_PERM_EMPTY'}
    }, '7000000000000000000', undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(invalidate).toHaveBeenCalledWith(authKey);
    expect(sentMessages(networker)[msgId]).toBeDefined();
    expect(settled).toBe(false);

    invalidate.mockClear();
    await networker.onTransportData(new Uint8Array(new Int32Array([-404]).buffer));
    expect(invalidate).toHaveBeenCalledWith(authKey);
  });
});

describe('TempAuthKeys', () => {
  test('makes a new key once the current one expires or is gone', async() => {
    const tempAuthKeys = makeTempAuthKeys(await makePermAuthKey());
    const make = vi.spyOn(tempAuthKeys as any, 'make').mockResolvedValue(undefined);
    const settle = () => vi.waitFor(() => expect((tempAuthKeys as any).making).toBeUndefined());
    const authKey = await makeTempAuthKey();
    (tempAuthKeys as any).authKey = authKey;

    expect(tempAuthKeys.getAuthKey()).toBe(authKey);
    expect(make).not.toHaveBeenCalled();

    authKey.expiresAt = tsNow(true) - 1;
    expect(tempAuthKeys.getAuthKey()).toBeUndefined();
    expect(make).toHaveBeenCalledTimes(1);
    await settle();

    const nextAuthKey = await makeTempAuthKey();
    (tempAuthKeys as any).authKey = nextAuthKey;
    tempAuthKeys.invalidate(nextAuthKey);
    expect(nextAuthKey.invalid).toBe(true);
    expect(tempAuthKeys.isUsable(nextAuthKey)).toBe(false);
    expect(make).toHaveBeenCalledTimes(2);
    expect(tempAuthKeys.getAuthKey()).toBeUndefined();
  });
});
