import {ParentProps} from 'solid-js';

import themeController from '../../helpers/themeController';

import apiManagerProxy from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';


import {LockScreenHotReloadGuardContext} from './hotReloadGuard';

export default function LockScreenHotReloadGuardProvider(props: ParentProps) {
  return (
    <LockScreenHotReloadGuardContext.Provider value={{
      rootScope,
      themeController,
      apiManagerProxy
    }}>
      {props.children}
    </LockScreenHotReloadGuardContext.Provider>
  );
}
