import {ParentProps} from 'solid-js';

import {EmoticonsDropdown} from '../../components/emoticonsDropdown';
import EmoticonsSearch from '../../components/emoticonsDropdown/search';
import EmojiTab from '../../components/emoticonsDropdown/tabs/emoji';
import {InputFieldTsx} from '../../components/inputFieldTsx';
import PasswordMonkey from '../../components/monkeys/password';
import PasswordInputField from '../../components/passwordInputField';
import {setQuizHint} from '../../components/poll';
import showLimitPopup from '../../components/popups/limit';
import PopupPremium from '../../components/popups/premium';
import appSidebarLeft from '../../components/sidebarLeft';
import AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import themeController from '../../helpers/themeController';
import appDialogsManager, {AutonomousMonoforumThreadList} from '../appManagers/appDialogsManager';
import appImManager from '../appManagers/appImManager';
import apiManagerProxy from '../mtproto/mtprotoworker';
import lottieLoader from '../rlottie/lottieLoader';
import rootScope from '../rootScope';
import {SolidJSHotReloadGuardContext} from './hotReloadGuard';


export default function SolidJSHotReloadGuardProvider(props: ParentProps) {
  return (
    <SolidJSHotReloadGuardContext.Provider value={{
      HotReloadGuard: SolidJSHotReloadGuardProvider,
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
      PopupPremium,
      EmoticonsDropdown,
      EmojiTab,
      appDialogsManager,
      AutonomousMonoforumThreadList
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
