import {render} from 'solid-js/web';

import {MOUNT_CLASS_TO} from '../../config/debug';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import pause from '../../helpers/schedulers/pause';


export default class PasscodeLockScreenController {
  private mountedElement: HTMLDivElement;
  private dispose?: () => void;

  public async lock() {
    if(this.mountedElement) return;

    const importPasscodeLockScreen = () => import('./passcodeLockScreen');

    await Promise.race([pause(100), importPasscodeLockScreen()]);

    this.mountedElement = document.createElement('div');
    this.mountedElement.classList.add('passcode-lock-screen');
    document.body.append(this.mountedElement);

    const {default: PasscodeLockScreen} = await importPasscodeLockScreen();

    this.dispose = render(() => (
      <SolidJSHotReloadGuardProvider>
        <PasscodeLockScreen />
      </SolidJSHotReloadGuardProvider>
    ), this.mountedElement);
  }

  public unlock() {

  }
}

MOUNT_CLASS_TO['PasscodeLockScreenControler'] = PasscodeLockScreenController;
