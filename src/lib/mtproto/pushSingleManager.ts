import {MOUNT_CLASS_TO} from '../../config/debug';
import randomize from '../../helpers/array/randomize';
import deepEqual from '../../helpers/object/deepEqual';
import base64ToBytes from '../../helpers/string/base64ToBytes';
import {AccountRegisterDevice, AccountUnregisterDevice} from '../../layer';
import appManagersManager from '../appManagers/appManagersManager';
import {logger} from '../logger';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';
import CryptoWorker from '../crypto/cryptoMessagePort';
import type {PushSubscriptionNotify} from './webPushApiManager';
import bytesCmp from '../../helpers/bytes/bytesCmp';

export class PushSingleManager {
  private log: ReturnType<typeof logger>;
  private registeredDevice: PushSubscriptionNotify;
  private secret: Promise<Uint8Array>;
  public name: string;

  constructor() {
    this.log = logger('PUSH');
    this.name = 'pushSingleManager';
  }

  private generateSecret(isUsingPasscode: boolean) {
    return isUsingPasscode ? randomize(new Uint8Array(256)) : new Uint8Array();
  }

  public getSecret() {
    return this.secret ??= DeferredIsUsingPasscode.isUsingPasscode().then((isUsingPasscode) => {
      return this.generateSecret(isUsingPasscode);
    });
  }

  public onIsUsingPasscodeChange(isUsingPasscode: boolean) {
    this.secret = undefined;
    if(this.registeredDevice) {
      this.registerDevice(this.registeredDevice, true);
    }
  }

  public isRegistered() {
    return !!this.registeredDevice;
  }

  private async getLoggedInManagers() {
    const managersByAccount = await appManagersManager.getManagersByAccount();
    const out: Map<UserId, typeof managersByAccount[keyof typeof managersByAccount]> = new Map();
    Object.values(managersByAccount).forEach((managers) => {
      const peerId = managers.appPeersManager.peerId;
      if(!!peerId) {
        out.set(peerId.toUserId(), managers);
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

    const [managers, secret] = await Promise.all([this.getLoggedInManagers(), this.getSecret()]);
    const userIds = [...managers.keys()];

    this.registeredDevice = tokenData;
    this.log('register device', this.registeredDevice, tokenData, userIds);

    const params: AccountRegisterDevice = {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: userIds,
      app_sandbox: false,
      secret,
      no_muted: true
    };

    const promises = [...managers.values()].map((managers) => {
      return managers.apiManager.invokeApi('account.registerDevice', params)/* .then(() => {
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
    if(!this.registeredDevice) {
      return;
    }

    const managers = await this.getLoggedInManagers();
    const userIds = [...managers.keys()];

    this.registeredDevice = undefined;
    this.log('unregister device', tokenData);

    const params: AccountUnregisterDevice = {
      token_type: tokenData.tokenType,
      token: tokenData.tokenValue,
      other_uids: userIds
    };

    const promises = [...managers.values()].map((managers) => {
      return managers.apiManager.invokeApi('account.unregisterDevice', params);
    });

    await Promise.all(promises);
    if(this.registeredDevice) {
      return;
    }

    this.log('unregistered device');
  }

  // * https://github.com/DrKLO/Telegram/blob/3708e9847a96ed681ff811d391749cc4535b03f2/TMessagesProj/src/main/java/org/telegram/messenger/GcmPushListenerService.java#L56
  public async decryptPush(pString: string, authKey: Uint8Array) {
    const bytes = base64ToBytes(pString);
    const authKeyHash = await CryptoWorker.invokeCrypto('sha1', authKey),
      authKeyAux = authKeyHash.slice(0, 8),
      authKeyId = authKeyHash.slice(-8);

    const inAuthKeyId = bytes.slice(0, 8);
    if(!bytesCmp(inAuthKeyId, authKeyId)) {
      throw new Error('Invalid auth key id');
    }

    const messageKey = bytes.slice(8, 8 + 16);

    return {};
  }
}

const pushSingleManager = new PushSingleManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.pushSingleManager = pushSingleManager);
export default pushSingleManager;
