import {createContext, useContext} from 'solid-js';

/**
 * `import type` is mandatory to avoid reloading the page (not really 😀, vite handles it even without the `import type`)
 */

import type AppMediaViewer from '@components/appMediaViewer';
import type {AutonomousMonoforumThreadList} from '@components/autonomousDialogList/monoforumThreads';
import type {avatarNew} from '@components/avatarNew';
import type BusinessHours from '@components/businessHours';
import type ButtonMenu from '@components/buttonMenu';
import type {ChatType} from '@components/chat/chat';
import type confirmationPopup from '@components/confirmationPopup';
import type {EmoticonsDropdown} from '@components/emoticonsDropdown';
import type EmoticonsSearch from '@components/emoticonsDropdown/search';
import type EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import type {InputFieldTsx} from '@components/inputFieldTsx';
import type PasswordMonkey from '@components/monkeys/password';
import type PasswordInputField from '@components/passwordInputField';
import type PeerProfileAvatars from '@components/peerProfileAvatars';
import type {PeerTitleTsx} from '@components/peerTitleTsx';
import type {setQuizHint} from '@components/poll';
import type PopupElement from '@components/popups';
import type showBirthdayPopup from '@components/popups/birthday';
import type {saveMyBirthday} from '@components/popups/birthday';
import type showLimitPopup from '@components/popups/limit';
import type PopupPremium from '@components/popups/premium';
import type PopupSendGift from '@components/popups/sendGift';
import type showStarsRatingPopup from '@components/popups/starsRating';
import type PopupToggleReadDate from '@components/popups/toggleReadDate';
import type PopupTranslate from '@components/popups/translate';
import type Row from '@components/rowTsx';
import type {AppSidebarLeft} from '@components/sidebarLeft';
import type AppChatFoldersTab from '@components/sidebarLeft/tabs/chatFolders';
import type AppEditFolderTab from '@components/sidebarLeft/tabs/editFolder';
import type Slideshow from '@components/slideshow';
import type {hideToast, toast, toastNew} from '@components/toast';
import type {wrapAdaptiveCustomEmoji} from '@components/wrappers/customEmojiSimple';
import type DocumentTsx from '@components/wrappers/documentTsx';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import type getPeerTitle from '@components/wrappers/getPeerTitle';
import type {wrapTopicIcon} from '@components/wrappers/messageActionTextNewUnsafe';
import type wrapPeerTitle from '@components/wrappers/peerTitle';
import type wrapPhoto from '@components/wrappers/photo';
import type PhotoTsx from '@components/wrappers/photoTsx';
import type wrapReply from '@components/wrappers/reply';
import type wrapSticker from '@components/wrappers/sticker';
import type wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import type wrapTopicNameButton from '@components/wrappers/topicNameButton';
import type VideoTsx from '@components/wrappers/videoTsx';
import type {ThemeController} from '@helpers/themeController';
import type {useAppSettings} from '@stores/appSettings';
import type {AppDialogsManager} from '@lib/appDialogsManager';
import type {AppImManager} from '@lib/appImManager';
import type uiNotificationsManager from '@lib/uiNotificationsManager';
import type I18n from '@lib/langPack';
import type {i18n, join} from '@lib/langPack';
import type apiManagerProxy from '@lib/apiManagerProxy';
import type wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import type wrapRichText from '@lib/richTextProcessor/wrapRichText';
import type lottieLoader from '@lib/rlottie/lottieLoader';
import type {RootScope} from '@lib/rootScope';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import type {formatDate} from '@helpers/date';


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
  getPeerTitle: typeof getPeerTitle;
  wrapPeerTitle: typeof wrapPeerTitle;
  wrapPhoto: typeof wrapPhoto;
  wrapEmojiText: typeof wrapEmojiText;
  wrapAdaptiveCustomEmoji: typeof wrapAdaptiveCustomEmoji;
  confirmationPopup: typeof confirmationPopup;
  PeerProfileAvatars: typeof PeerProfileAvatars;
  showStarsRatingPopup: typeof showStarsRatingPopup;
  toast: typeof toast;
  toastNew: typeof toastNew;
  hideToast: typeof hideToast;
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
  wrapTopicIcon: typeof wrapTopicIcon;
  VideoTsx: typeof VideoTsx;
  DocumentTsx: typeof DocumentTsx;
  PhotoTsx: typeof PhotoTsx;
  Slideshow: typeof Slideshow;
  AppMediaViewer: typeof AppMediaViewer;
  formatDate: typeof formatDate;
  wrapFolderTitle: typeof wrapFolderTitle;
  ButtonMenu: typeof ButtonMenu;
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
