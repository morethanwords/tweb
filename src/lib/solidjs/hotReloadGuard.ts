import {createContext, useContext} from 'solid-js';

/**
 * `import type` is mandatory to avoid reloading the page (not really 😀, vite handles it even without the `import type`)
 */

import type {EmoticonsDropdown} from '../../components/emoticonsDropdown';
import type EmoticonsSearch from '../../components/emoticonsDropdown/search';
import type EmojiTab from '../../components/emoticonsDropdown/tabs/emoji';
import type {InputFieldTsx} from '../../components/inputFieldTsx';
import type PasswordMonkey from '../../components/monkeys/password';
import type PasswordInputField from '../../components/passwordInputField';
import type {setQuizHint} from '../../components/poll';
import type showLimitPopup from '../../components/popups/limit';
import type PopupPremium from '../../components/popups/premium';
import type {AppSidebarLeft} from '../../components/sidebarLeft';
import type AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import type AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import type wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import type {ThemeController} from '../../helpers/themeController';
import type {AppDialogsManager, AutonomousMonoforumThreadList} from '../appManagers/appDialogsManager';
import type {AppImManager} from '../appManagers/appImManager';
import type apiManagerProxy from '../mtproto/mtprotoworker';
import type lottieLoader from '../rlottie/lottieLoader';
import type {RootScope} from '../rootScope';
import type SolidJSHotReloadGuardProvider from './hotReloadGuardProvider';


export type SolidJSHotReloadGuardContextValue = {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  rootScope: RootScope;
  appSidebarLeft: AppSidebarLeft;
  AppChatFoldersTab: typeof AppChatFoldersTab;
  AppEditFolderTab: typeof AppEditFolderTab;
  EmoticonsSearch: typeof EmoticonsSearch;
  wrapStickerSetThumb: typeof wrapStickerSetThumb;
  showLimitPopup: typeof showLimitPopup;
  lottieLoader: typeof lottieLoader;
  themeController: ThemeController;
  appImManager: AppImManager;
  apiManagerProxy: typeof apiManagerProxy;
  setQuizHint: typeof setQuizHint;
  PasswordInputField: typeof PasswordInputField;
  InputFieldTsx: typeof InputFieldTsx;
  PasswordMonkey: typeof PasswordMonkey;
  PopupPremium: typeof PopupPremium;
  EmoticonsDropdown: typeof EmoticonsDropdown;
  EmojiTab: typeof EmojiTab;
  appDialogsManager: AppDialogsManager;
  AutonomousMonoforumThreadList: typeof AutonomousMonoforumThreadList;
};

export type LockScreenHotReloadGuardContextValue = Pick<
  SolidJSHotReloadGuardContextValue,
  | 'rootScope'
  | 'apiManagerProxy'
  | 'themeController'
  | 'InputFieldTsx'
  | 'PasswordInputField'
  | 'PasswordMonkey'
>;

export const SolidJSHotReloadGuardContext = createContext<SolidJSHotReloadGuardContextValue>(null);
export const LockScreenHotReloadGuardContext = createContext<LockScreenHotReloadGuardContextValue>(null);

/**
 * If importing a module causes the page to reload when you make changes in your SolidJS component
 * provide the values through the SolidJSHotReloadGuardProvider
 */
export function useHotReloadGuard() {
  const contextValue = useContext(SolidJSHotReloadGuardContext);
  if(!contextValue) throw new Error('useHotReloadGuard should not be used outside a <SolidJSHotReloadGuardProvider />');

  return contextValue;
}

export function useLockScreenHotReloadGuard() {
  const contextValue = useContext(LockScreenHotReloadGuardContext) || useContext(SolidJSHotReloadGuardContext);
  if(!contextValue) throw new Error('useLockScreenHotReloadGuard should not be used outside a <LockScreenHotReloadGuardProvider />');

  return contextValue;
}
