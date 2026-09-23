import type {logger} from '@lib/logger';
import type {TimeManager} from '@lib/mtproto/timeManager';
import type MTPNetworker from '@lib/mtproto/networker';
import type MTTransport from '@lib/mtproto/transports/transport';
import type {MTAuthKey} from '@lib/mtproto/authKey';
import bytesToHex from '@helpers/bytes/bytesToHex';
import makeError from '@helpers/makeError';
import pause from '@helpers/schedulers/pause';
import withTimeout from '@helpers/schedulers/withTimeout';

// * the lifetime asked for a temporary key (tdesktop asks the same)
export const TEMP_AUTH_KEY_EXPIRES_IN = 86400;
// * making, binding and introducing a key, all over one connection
const MAKE_TIMEOUT = 30000;
const MAX_RETRY_DELAY = 16000;

export type TempAuthKeysOptions = {
  permAuthKey: MTAuthKey,
  timeManager: TimeManager,
  log: ReturnType<typeof logger>,
  // * a connection of its own for every key: the plain handshake and the binding go over it
  createTransport: () => MTTransport,
  authTemp: (transport: MTTransport, expiresIn: number) => Promise<{authKey?: MTAuthKey, serverSalt?: Uint8Array}>,
  // * a networker for one job, out of the pool: no status, no updates
  createNetworker: (options: {authKey: MTAuthKey, permAuthKey: MTAuthKey}) => MTPNetworker
};

/**
 * Perfect Forward Secrecy for one DC (or its media cluster) of one account:
 * the temporary key every networker there talks over, bound to the
 * permanent one.
 *
 * A key is made, bound (auth.bindTempAuthKey) and introduced with
 * initConnection over a connection and a session of its own, so networkers
 * only ever see ready keys. A new one is made once the current one expires or
 * the server forgets it (-404) or its binding (AUTH_KEY_PERM_EMPTY), and the
 * networkers move to it. Temporary keys live in memory only.
 */
export default class TempAuthKeys {
  private authKey: MTAuthKey;
  private making: Promise<void>;
  private networkers: Set<MTPNetworker> = new Set();
  private failures = 0;
  private log: ReturnType<typeof logger>;

  constructor(private options: TempAuthKeysOptions) {
    this.log = options.log;
  }

  public attach(networker: MTPNetworker) {
    this.networkers.add(networker);
  }

  public detach(networker: MTPNetworker) {
    this.networkers.delete(networker);
  }

  public isUsable(authKey: MTAuthKey) {
    return !!authKey && !authKey.invalid && this.options.timeManager.getServerTime() < authKey.expiresAt;
  }

  /**
   * The ready key to talk over, if there is one; otherwise the next one is
   * being made.
   */
  public getAuthKey() {
    if(this.isUsable(this.authKey)) {
      return this.authKey;
    }

    this.authKey = undefined;
    this.making ??= this.make().finally(() => {
      this.making = undefined;
    });
  }

  /**
   * The server knows nothing of `authKey` or of its binding anymore.
   */
  public invalidate(authKey: MTAuthKey) {
    if(!authKey || authKey.invalid) {
      return;
    }

    this.log.warn('temporary auth key is gone', bytesToHex(authKey.id));
    authKey.invalid = true;
    this.getAuthKey();
  }

  private async make() {
    for(;;) {
      try {
        const authKey = await this.makeOne();
        this.failures = 0;
        this.authKey = authKey;
        this.log('temporary auth key is ready', bytesToHex(authKey.id), authKey.expiresAt);
        // * the waiting networkers go on over it
        this.networkers.forEach((networker) => networker.scheduleRequest());
        return;
      } catch(err) {
        const delay = Math.min(MAX_RETRY_DELAY, 1000 * 2 ** this.failures++);
        this.log.error('can\'t make temporary auth key, retrying in', delay, err);
        await pause(delay);
      }
    }
  }

  private async makeOne() {
    const {options} = this;
    const transport = options.createTransport();
    let networker: MTPNetworker;

    const make = async() => {
      const {authKey, serverSalt} = await options.authTemp(transport, TEMP_AUTH_KEY_EXPIRES_IN);
      authKey.serverSalt = serverSalt;
      networker = options.createNetworker({authKey, permAuthKey: options.permAuthKey});
      networker.changeTransport(transport);

      if(!(await networker.bindTempAuthKey())) {
        throw makeError('BIND_FAILED');
      }

      // * the client info has to be given again after every binding
      await networker.wrapApiCall('help.getNearestDc');
      return authKey;
    };

    try {
      const authKey = await withTimeout(make(), MAKE_TIMEOUT);
      if(!authKey) {
        throw makeError('TIMEOUT');
      }

      return authKey;
    } finally {
      // * the networker takes its connection down with it
      (networker ?? transport).destroy();
    }
  }
}
