import {createContext, useContext} from 'solid-js';

/**
 * `import type` is mandatory to avoid reloading the page (not really 😀, vite handles it even without the `import type`)
 */

import type {AutonomousMonoforumThreadList} from '../../components/autonomousDialogList/monoforumThreads';
import type {avatarNew} from '../../components/avatarNew';
import type BusinessHours from '../../components/businessHours';
import type {ChatType} from '../../components/chat/chat';
import type confirmationPopup from '../../components/confirmationPopup';
import type {EmoticonsDropdown} from '../../components/emoticonsDropdown';
import type EmoticonsSearch from '../../components/emoticonsDropdown/search';
import type EmojiTab from '../../components/emoticonsDropdown/tabs/emoji';
import type {InputFieldTsx} from '../../components/inputFieldTsx';
import type PasswordMonkey from '../../components/monkeys/password';
import type PasswordInputField from '../../components/passwordInputField';
import type PeerProfileAvatars from '../../components/peerProfileAvatars';
import type {PeerTitleTsx} from '../../components/peerTitleTsx';
import type {setQuizHint} from '../../components/poll';
import type PopupElement from '../../components/popups';
import type showBirthdayPopup from '../../components/popups/birthday';
import type {saveMyBirthday} from '../../components/popups/birthday';
import type showLimitPopup from '../../components/popups/limit';
import type PopupPremium from '../../components/popups/premium';
import type PopupSendGift from '../../components/popups/sendGift';
import type showStarsRatingPopup from '../../components/popups/starsRating';
import type PopupToggleReadDate from '../../components/popups/toggleReadDate';
import type PopupTranslate from '../../components/popups/translate';
import type Row from '../../components/rowTsx';
import type {AppSidebarLeft} from '../../components/sidebarLeft';
import type AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import type AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import type {toast, toastNew} from '../../components/toast';
import type {wrapAdaptiveCustomEmoji} from '../../components/wrappers/customEmojiSimple';
import type wrapPeerTitle from '../../components/wrappers/peerTitle';
import type wrapPhoto from '../../components/wrappers/photo';
import type wrapReply from '../../components/wrappers/reply';
import type wrapSticker from '../../components/wrappers/sticker';
import type wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import type wrapTopicNameButton from '../../components/wrappers/topicNameButton';
import type {ThemeController} from '../../helpers/themeController';
import type {useAppSettings} from '../../stores/appSettings';
import type {AppDialogsManager} from '../appManagers/appDialogsManager';
import type {AppImManager} from '../appManagers/appImManager';
import type uiNotificationsManager from '../appManagers/uiNotificationsManager';
import type I18n from '../langPack';
import type {i18n, join} from '../langPack';
import type apiManagerProxy from '../mtproto/mtprotoworker';
import type wrapEmojiText from '../richTextProcessor/wrapEmojiText';
import type wrapRichText from '../richTextProcessor/wrapRichText';
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
  uiNotificationsManager: typeof uiNotificationsManager;
  I18n: typeof I18n;
  i18n: typeof i18n;
  join: typeof join;
  PopupElement: typeof PopupElement;
  PopupTranslate: typeof PopupTranslate;
  PopupToggleReadDate: typeof PopupToggleReadDate;
  wrapSticker: typeof wrapSticker;
  wrapTopicNameButton: typeof wrapTopicNameButton;
  wrapRichText: typeof wrapRichText;
  wrapPeerTitle: typeof wrapPeerTitle;
  wrapPhoto: typeof wrapPhoto;
  wrapEmojiText: typeof wrapEmojiText;
  wrapAdaptiveCustomEmoji: typeof wrapAdaptiveCustomEmoji;
  confirmationPopup: typeof confirmationPopup;
  PeerProfileAvatars: typeof PeerProfileAvatars;
  showStarsRatingPopup: typeof showStarsRatingPopup;
  toast: typeof toast;
  toastNew: typeof toastNew;
  BusinessHours: typeof BusinessHours;
  avatarNew: typeof avatarNew;
  PeerTitleTsx: typeof PeerTitleTsx;
  PopupSendGift: typeof PopupSendGift;
  showBirthdayPopup: typeof showBirthdayPopup;
  saveMyBirthday: typeof saveMyBirthday;
  Row: typeof Row;
  useAppSettings: typeof useAppSettings;
  ChatType: typeof ChatType;
  wrapReply: typeof wrapReply;
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
