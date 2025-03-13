import {ParentProps} from 'solid-js';

import PasswordInputField from '../../components/passwordInputField';
import PasswordMonkey from '../../components/monkeys/password';
import {InputFieldTsx} from '../../components/inputFieldTsx';
import themeController from '../../helpers/themeController';

import apiManagerProxy from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';

import {LockScreenHotReloadGuardContext} from './hotReloadGuard';


export default function LockScreenHotReloadGuardProvider(props: ParentProps) {
  return (
    <LockScreenHotReloadGuardContext.Provider value={{
      rootScope,
      themeController,
      apiManagerProxy,
      InputFieldTsx,
      PasswordInputField,
      PasswordMonkey
    }}>
      {props.children}
    </LockScreenHotReloadGuardContext.Provider>
  );
}
