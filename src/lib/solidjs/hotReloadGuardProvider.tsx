import {ParentProps} from 'solid-js';

import AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import EmoticonsSearch from '../../components/emoticonsDropdown/search';
import PasswordInputField from '../../components/passwordInputField';
import PasswordMonkey from '../../components/monkeys/password';
import {InputFieldTsx} from '../../components/inputFieldTsx';
import themeController from '../../helpers/themeController';
import showLimitPopup from '../../components/popups/limit';
import PopupPremium from '../../components/popups/premium';
import appSidebarLeft from '../../components/sidebarLeft';
import {setQuizHint} from '../../components/poll';

import apiManagerProxy from '../mtproto/mtprotoworker';
import appImManager from '../appManagers/appImManager';
import lottieLoader from '../rlottie/lottieLoader';
import rootScope from '../rootScope';


import {SolidJSHotReloadGuardContext} from './hotReloadGuard';

export default function SolidJSHotReloadGuardProvider(props: ParentProps) {
  return (
    <SolidJSHotReloadGuardContext.Provider value={{
      rootScope,
      appSidebarLeft,
      AppEditFolderTab,
      AppChatFoldersTab,
      EmoticonsSearch,
      wrapStickerSetThumb,
      showLimitPopup,
      lottieLoader,
      themeController,
      appImManager,
      apiManagerProxy,
      setQuizHint,
      InputFieldTsx,
      PasswordInputField,
      PasswordMonkey,
      PopupPremium
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
