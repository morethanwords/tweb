import {render} from 'solid-js/web';

import {MOUNT_CLASS_TO} from '../../config/debug';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';

import PasscodeLockScreen from './passcodeLockScreen';


export default class PasscodeLockScreenControler {
  private mountedElement: HTMLDivElement;
  private dispose?: () => void;

  public lock() {
    if(this.mountedElement) return;

    this.mountedElement = document.createElement('div');
    this.mountedElement.classList.add('passcode-lock-screen');
    document.body.append(this.mountedElement);

    this.dispose = render(() => (
      <SolidJSHotReloadGuardProvider>
        <PasscodeLockScreen />
      </SolidJSHotReloadGuardProvider>
    ), this.mountedElement);
  }

  public unlock() {

  }
}

MOUNT_CLASS_TO['PasscodeLockScreenControler'] = PasscodeLockScreenControler;
