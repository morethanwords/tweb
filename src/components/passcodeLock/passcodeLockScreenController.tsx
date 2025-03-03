import {render} from 'solid-js/web';

import {MOUNT_CLASS_TO} from '../../config/debug';
import LockScreenHotReloadGuardProvider from '../../lib/solidjs/lockScreenHotReloadGuardProvider';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import StaticUtilityClass from '../../lib/staticUtilityClass';
import pause from '../../helpers/schedulers/pause';
import deferredPromise from '../../helpers/cancellablePromise';


export default class PasscodeLockScreenController extends StaticUtilityClass {
  private static mountedElement: HTMLDivElement;
  private static dispose?: () => void;

  private static appStartupDeferred = deferredPromise<void>();

  private static async checkLockState(isLockedCallback: () => Promise<void>) {
    const isLocked = await apiManagerProxy.invoke('isLocked', undefined);
    console.log('isLocked :>> ', isLocked);
    if(isLocked) {
      await isLockedCallback();
      await this.lock();
    } else this.appStartupDeferred.resolve();
  }

  public static async waitForUnlock(isLockedCallback: () => Promise<void>) {
    this.checkLockState(isLockedCallback);
    await this.appStartupDeferred;
    this.appStartupDeferred = undefined;
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
