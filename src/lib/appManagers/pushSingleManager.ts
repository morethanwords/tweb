import {MOUNT_CLASS_TO} from '../../config/debug';
import deepEqual from '../../helpers/object/deepEqual';
import base64ToBytes from '../../helpers/string/base64ToBytes';
import {AccountRegisterDevice, AccountUnregisterDevice} from '../../layer';
import appManagersManager from './appManagersManager';
import {logger} from '../logger';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
import CryptoWorker from '../crypto/cryptoMessagePort';
import type {PushSubscriptionNotify} from '../webPushApiManager';
import bytesCmp from '../../helpers/bytes/bytesCmp';
import {MessageKeyUtils} from '../mtproto/messageKeyUtils';
import {TLDeserialization} from '../mtproto/tl_utils';
import type {PushNotificationObject} from '../serviceWorker/push';
import {ActiveAccountNumber} from '../accounts/types';
import bytesToBase64 from '../../helpers/bytes/bytesToBase64';
import AccountController from '../accounts/accountController';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import rootScope from '../rootScope';

export type PushKey = {
  key: Uint8Array,
  id: Uint8Array,
  idBase64?: string
};

export class PushSingleManager {
  private log: ReturnType<typeof logger>;
  private registeredDevice: PushSubscriptionNotify;
  private keys: Promise<PushKey[]>;
  public name: string;

  constructor() {
    this.log = logger('PUSH');
    this.name = 'pushSingleManager';

    rootScope.addEventListener('account_logged_in', () => {
      this.registerAgain();
    });
  }

  private getKeys(): Promise<PushKey[]> {
    return this.keys ??= Promise.all([
      DeferredIsUsingPasscode.isUsingPasscode(),
      this.getLoggedInAccounts()
    ]).then(([isUsingPasscode, accounts]) => {
      return Promise.all(accounts.map(({accountNumber}) => {
        return this.getKeyForAccountNumber(accountNumber, isUsingPasscode);
      }));
    });
  }

  private async getKeyForAccountNumber(accountNumber: ActiveAccountNumber, isUsingPasscode: boolean): Promise<PushKey> {
    const accountData = await AccountController.get(accountNumber);
    const key = isUsingPasscode ? bytesFromHex(accountData.push_key) : new Uint8Array();
    const keyHash = key.length ? await CryptoWorker.invokeCrypto('sha1', key) : new Uint8Array(),
      keyId = keyHash.slice(-8);

    // * slice last character because key is not divisible by 3
    // * this way we can easily compare base64 strings
    const keyIdBase64 = bytesToBase64(keyId)
    .replace(/=+$/, '')
    .slice(0, -1);

    return {key: key, id: keyId, idBase64: keyIdBase64};
  }

  public getKeysIdsBase64(): Promise<string[]> {
    return this.getKeys().then((keys) => keys.map((key) => key.idBase64));
  }

  public registerAgain() {
    this.keys = undefined;
    if(this.registeredDevice) {
      this.registerDevice(this.registeredDevice, true);
    }
  }

  public isRegistered() {
    return !!this.registeredDevice;
  }

  private async getLoggedInAccounts() {
    const managersByAccount = await appManagersManager.getManagersByAccount();
    const out: {
      accountNumber: ActiveAccountNumber,
      userId: UserId,
      managers: typeof managersByAccount[keyof typeof managersByAccount]
    }[] = [];

    Object.values(managersByAccount).forEach((managers, idx) => {
      const peerId = managers.appPeersManager.peerId;
      if(!!peerId) {
        out.push({
          accountNumber: idx + 1 as ActiveAccountNumber,
          userId: peerId.toUserId(),
          managers
        });
      }
    });

    return out;
  }

  public async registerDevice(tokenData: PushSubscriptionNotify, override?: boolean) {
    if(
      !override &&
      this.registeredDevice &&
      deepEqual(this.registeredDevice, tokenData)
    ) {
      return false;
    }

    const [accounts, keys] = await Promise.all([this.getLoggedInAccounts(), this.getKeys()]);
    const userIds = accounts.map((account) => account.userId);

    this.registeredDevice = tokenData;
    this.log('register device', this.registeredDevice, tokenData, userIds);

    const params: AccountRegisterDevice = {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: userIds,
      app_sandbox: false,
      secret: undefined,
      no_muted: true
    };

    const promises = accounts.map(async({managers}, idx) => {
      return managers.apiManager.invokeApi('account.registerDevice', {
        ...params,
        secret: keys[idx].key
      })/* .then(() => {
        return managers.apiManager.invokeApi('account.updateDeviceLocked', {
          period: 5
        });
      }); */
    });

    await Promise.all(promises);
    if(this.registeredDevice !== tokenData) {
      return;
    }

    this.log('registered device');
  }

  public async unregisterDevice(tokenData: PushSubscriptionNotify) {
    if(!this.registeredDevice || !tokenData) {
      return;
    }

    const accounts = await this.getLoggedInAccounts();
    const userIds = accounts.map((account) => account.userId);

    this.registeredDevice = undefined;
    this.log('unregister device', tokenData);

    const params: AccountUnregisterDevice = {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: userIds
    };

    const promises = accounts.map(({managers}) => {
      return managers.apiManager.invokeApi('account.unregisterDevice', params);
    });

    await Promise.all(promises);
    if(this.registeredDevice) {
      return;
    }

    this.log('unregistered device');
  }

  // * https://github.com/DrKLO/Telegram/blob/3708e9847a96ed681ff811d391749cc4535b03f2/TMessagesProj/src/main/java/org/telegram/messenger/GcmPushListenerService.java#L56
  public async decryptPush(pString: string, idBase64: string): Promise<PushNotificationObject> {
    const pushKey = await this.getKeys().then((keys) => keys.find((key) => key.idBase64 === idBase64));
    if(!pushKey) {
      throw new Error('no push key found');
    }

    const {key: authKey, id: authKeyId} = pushKey;
    const bytes = base64ToBytes(pString);
    let deserializer = new TLDeserialization(bytes);

    const inAuthKeyId = deserializer.fetchIntBytes(64, true, 'auth_key_id');
    if(!bytesCmp(inAuthKeyId, authKeyId)) {
      throw new Error('invalid auth key id');
    }

    const messageKey = deserializer.fetchIntBytes(128, true, 'msg_key');
    const messageKeyData = await MessageKeyUtils.getAesKeyIv(authKey, messageKey, true);

    const decrypted = await CryptoWorker.invokeCrypto(
      'aes-decrypt',
      bytes.slice(deserializer.getOffset()),
      messageKeyData.aesKey,
      messageKeyData.aesIv
    );

    const calcMessageKey = await MessageKeyUtils.getMsgKey(authKey, decrypted, true);
    if(!bytesCmp(messageKey, calcMessageKey)) {
      throw new Error('server messageKey mismatch');
    }

    deserializer = new TLDeserialization(decrypted);
    const length = deserializer.fetchInt('length');
    const data = deserializer.fetchStringWithLength(length, 'data');

    return JSON.parse(data);
  }
}

const pushSingleManager = new PushSingleManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.pushSingleManager = pushSingleManager);
export default pushSingleManager;
