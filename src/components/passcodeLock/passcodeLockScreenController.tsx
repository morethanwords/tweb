import {render} from 'solid-js/web';

import {MOUNT_CLASS_TO} from '../../config/debug';
import pause from '../../helpers/schedulers/pause';
import deferredPromise from '../../helpers/cancellablePromise';
import LockScreenHotReloadGuardProvider from '../../lib/solidjs/lockScreenHotReloadGuardProvider';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import StaticUtilityClass from '../../lib/staticUtilityClass';
import sessionStorage from '../../lib/sessionStorage';
import EncryptionKeyStore from '../../lib/passcode/keyStore';


export default class PasscodeLockScreenController extends StaticUtilityClass {
  private static mountedElement: HTMLDivElement;
  private static dispose?: () => void;

  private static appStartupDeferred = deferredPromise<void>();


  private static async tryGetStoredEncryptionHash() {
    const storedBase64Key = await sessionStorage.get('encryption_key');

    if(storedBase64Key) {
      sessionStorage.delete('encryption_key');

      const isValid = typeof storedBase64Key === 'string'; // storedEncryptionHash instanceof Array && storedEncryptionHash.every((num) => typeof num === 'number');
      if(!isValid) return false;

      const keyAsBuffer = new Uint8Array(atob(storedBase64Key).split('').map(c => c.charCodeAt(0)));
      const importedKey =  await crypto.subtle.importKey(
        'raw',
        keyAsBuffer,
        {name: 'AES-GCM'},
        true,
        ['encrypt', 'decrypt']
      );

      await apiManagerProxy.invoke('saveEncryptionKey', importedKey);
      EncryptionKeyStore.save(importedKey);

      return true;
    }

    return false;
  }

  private static async checkLockState(isLockedCallback: () => Promise<void>) {
    const hasStoredEncryptionHash = await this.tryGetStoredEncryptionHash();

    const isLocked = hasStoredEncryptionHash ?
      false :
      await apiManagerProxy.invoke('isLocked', undefined);

    if(isLocked) {
      await isLockedCallback();
      await this.lock();
    } else {
      this.appStartupDeferred.resolve();
      this.appStartupDeferred = undefined;
    }
  }

  public static async waitForUnlock(isLockedCallback: () => Promise<void>) {
    this.checkLockState(isLockedCallback);
    await this.appStartupDeferred;
  }

  public static async lock() {
    if(this.mountedElement) return;

    const importPasscodeLockScreen = () => import('./passcodeLockScreen');

    await Promise.race([pause(100), importPasscodeLockScreen()]);

    this.mountedElement = document.createElement('div');
    this.mountedElement.classList.add('passcode-lock-screen');
    document.body.append(this.mountedElement);

    const {default: PasscodeLockScreen} = await importPasscodeLockScreen();

    this.dispose = render(() => (
      <LockScreenHotReloadGuardProvider>
        <PasscodeLockScreen onUnlock={() => this.unlock()} />
      </LockScreenHotReloadGuardProvider>
    ), this.mountedElement);
  }

  public static unlock() {
    this.dispose?.();
    this.mountedElement?.remove();
    this.appStartupDeferred?.resolve();
    this.appStartupDeferred = undefined;
  }
}

MOUNT_CLASS_TO['PasscodeLockScreenControler'] = PasscodeLockScreenController;
