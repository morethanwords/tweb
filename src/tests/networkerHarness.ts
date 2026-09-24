import MTPNetworker from '@lib/mtproto/networker';
import {MTAuthKey} from '@lib/mtproto/authKey';
import {TimeManager} from '@lib/mtproto/timeManager';
import {randomBytes} from '@helpers/random';

// A networker with no network behind it, for the tests that drive one directly.

export function makeNetworker(options: Partial<ConstructorParameters<typeof MTPNetworker>[0]> = {}) {
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

export const makePermAuthKey = () => MTAuthKey.fromKey(randomBytes(256));

/** One that can encrypt: a key of its own and a salt, no keys of any holder. */
export async function makeAuthorizedNetworker() {
  const authKey = await makePermAuthKey();
  return makeNetworker({permAuthKey: authKey, authKey, serverSalt: randomBytes(8)});
}
