import {render} from 'solid-js/web';

import {MOUNT_CLASS_TO} from '../../config/debug';
import pause from '../../helpers/schedulers/pause';
import deferredPromise from '../../helpers/cancellablePromise';
import {doubleRaf} from '../../helpers/schedulers';
import LockScreenHotReloadGuardProvider from '../../lib/solidjs/lockScreenHotReloadGuardProvider';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import StaticUtilityClass from '../../lib/staticUtilityClass';
import sessionStorage from '../../lib/sessionStorage';
import EncryptionKeyStore from '../../lib/passcode/keyStore';
import appNavigationController from '../appNavigationController';


export default class PasscodeLockScreenController extends StaticUtilityClass {
  private static mountedElement: HTMLDivElement;
  private static dispose?: () => void;

  private static appStartupDeferred = deferredPromise<void>();

  private static isLocked?: boolean;
  private static savedHash: string = '';

  public static getIsLocked() {
    return this.isLocked;
  }

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

    this.isLocked = isLocked;

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
    this.isLocked = false;
  }

  public static async lockOtherTabs() {
    await apiManagerProxy.invoke('toggleLockOthers', true);
  }

  public static async lock(fromLockIcon?: HTMLElement | boolean, onAnimationEnd?: () => void) {
    if(this.mountedElement) return;

    this.isLocked = true;

    if(this.appStartupDeferred) {
      this.savedHash = window.location.hash;
      window.location.hash = '';
    }

    const shouldAnimateIn = !!fromLockIcon;

    const importPasscodeLockScreen = () => import('./passcodeLockScreen');

    await Promise.race([pause(100), importPasscodeLockScreen()]);

    this.mountedElement = document.createElement('div');
    this.mountedElement.classList.add('passcode-lock-screen');


    const clonedLockIcon = fromLockIcon instanceof HTMLElement ? this.cloneLockIcon(fromLockIcon) : undefined;
    if(clonedLockIcon) this.mountedElement.append(clonedLockIcon);

    if(shouldAnimateIn) {
      this.mountedElement.classList.add('passcode-lock-screen--hidden');
    }
    document.body.append(this.mountedElement);

    const {default: PasscodeLockScreen} = await importPasscodeLockScreen();

    this.dispose = render(() => (
      <LockScreenHotReloadGuardProvider>
        <PasscodeLockScreen
          onUnlock={() => this.unlock()}
          fromLockIcon={clonedLockIcon}
          onAnimationEnd={onAnimationEnd}
        />
      </LockScreenHotReloadGuardProvider>
    ), this.mountedElement);

    if(shouldAnimateIn) {
      doubleRaf().then(async() => {
        this.mountedElement.classList.remove('passcode-lock-screen--hidden');

        if(!clonedLockIcon) pause(200).then(() => {
          onAnimationEnd();
        });
      });
    }
  }

  private static cloneLockIcon(icon?: HTMLElement) {
    const clonedLockIcon = icon.cloneNode(true) as HTMLElement;
    clonedLockIcon.classList.add('passcode-lock-screen__animated-lock-icon');

    const rect = icon.getBoundingClientRect();

    clonedLockIcon.style.setProperty('--x', (rect.left + rect.width / 2) + 'px');
    clonedLockIcon.style.setProperty('--y', (rect.top + rect.height / 2) + 'px');

    return clonedLockIcon;
  }

  public static unlock() {
    const element = this.mountedElement;
    this.mountedElement = undefined;

    this.isLocked = false;
    if(this.savedHash) {
      // window.location.hash = this.savedHash;
      appNavigationController.overrideHash(this.savedHash)
      appNavigationController.replaceState();
    }

    if(element) (async() => {
      element.style.setProperty('transition-time', '.12s');
      await pause(120);

      const next = async() => {
        await pause(250);
        element.classList.add('passcode-lock-screen--hidden');
        await pause(120);

        this.dispose?.();
        element?.remove();
      };

      if(document.startViewTransition) document.startViewTransition(next);
      else next();
    })();

    this.appStartupDeferred?.resolve();
    this.appStartupDeferred = undefined;
  }
}

MOUNT_CLASS_TO['PasscodeLockScreenControler'] = PasscodeLockScreenController;
