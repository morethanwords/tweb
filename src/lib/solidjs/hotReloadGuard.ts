import {createContext, useContext} from 'solid-js';

import AppMediaViewer, {onMediaCaptionClick} from '@components/appMediaViewer';
import AppMediaViewerStatic from '@components/appMediaViewerStatic';
import {AutonomousMonoforumThreadList} from '@components/autonomousDialogList/monoforumThreads';
import {avatarNew, AvatarNewTsx, StoriesSegments} from '@components/avatarNew';
import BusinessHours from '@components/businessHours';
import ButtonMenu, {ButtonMenuSync} from '@components/buttonMenu';
import {ChatType} from '@components/chat/chatType';
import PaidMessagesInterceptor from '@components/chat/paidMessagesInterceptor';
import {pickLanguage} from '@components/chat/translation';
import confirmationPopup from '@components/confirmationPopup';
import {default as createEmojiDropdownButton, useEmojiDropdown} from '@components/emojiDropdownButton';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmoticonsSearch from '@components/emoticonsDropdown/search';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {InputFieldTsx} from '@components/inputFieldTsx';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import PeerProfileAvatars from '@components/peerProfileAvatars';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import PopupElement from '@components/popups';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import {useStickersDropdown} from '@components/popups/createPoll/stickersDropdown';
import showLimitPopup from '@components/popups/limit';
import showMyQrCodePopup from '@components/popups/myQrCode';
import {showSharingPickerPopup} from '@components/popups/pickUser';
import PopupPremium from '@components/popups/premium';
import PopupSendGift from '@components/popups/sendGift';
import showStarsRatingPopup from '@components/popups/starsRating';
import PopupToggleReadDate from '@components/popups/toggleReadDate';
import {setQuizHint} from '@components/quizHint';
import Row from '@components/rowTsx';
import {AppSidebarLeft} from '@components/sidebarLeft';
import {AppSidebarRight} from '@components/sidebarRight';
import AppPollResultsTab from '@components/sidebarRight/tabs/pollResults';
import Slideshow from '@components/slideshow';
import {AppChatFoldersTab, AppEditFolderTab} from '@components/solidJsTabs/tabs';
import {StoriesProvider, useStories} from '@components/stories/store';
import {hideToast, toast, toastNew} from '@components/toast';
import {TranslatableMessageTsx} from '@components/translatableMessage';
import {wrapAdaptiveCustomEmoji} from '@components/wrappers/customEmojiSimple';
import DocumentTsx from '@components/wrappers/documentTsx';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import wrapGeo from '@components/wrappers/geo';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {wrapTopicIcon} from '@components/wrappers/messageActionTextNewUnsafe';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import wrapPhoto from '@components/wrappers/photo';
import PhotoTsx from '@components/wrappers/photoTsx';
import wrapReply from '@components/wrappers/reply';
import wrapSticker from '@components/wrappers/sticker';
import wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import wrapTopicNameButton from '@components/wrappers/topicNameButton';
import VideoTsx from '@components/wrappers/videoTsx';
import {formatDate} from '@helpers/date';
import {getFileAndOpenEditor} from '@helpers/getFileAndOpenEditor';
import {ThemeController} from '@helpers/themeController';
import usePeerTranslation from '@hooks/usePeerTranslation';
import apiManagerProxy from '@lib/apiManagerProxy';
import {AppDialogsManager} from '@lib/appDialogsManager';
import {AppImManager} from '@lib/appImManager';
import I18n, {i18n, join} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import lottieLoader from '@lib/rlottie/lottieLoader';
import {RootScope} from '@lib/rootScope';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import {useAppSettings} from '@stores/appSettings';
import {useAppConfig} from '@stores/appState';
import usePremium from '@stores/premium';


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
  PopupToggleReadDate: typeof PopupToggleReadDate;
  wrapSticker: typeof wrapSticker;
  wrapTopicNameButton: typeof wrapTopicNameButton;
  wrapRichText: typeof wrapRichText;
  getPeerTitle: typeof getPeerTitle;
  wrapPeerTitle: typeof wrapPeerTitle;
  wrapPhoto: typeof wrapPhoto;
  wrapEmojiText: typeof wrapEmojiText;
  wrapGeo: typeof wrapGeo;
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
  showMyQrCodePopup: typeof showMyQrCodePopup;
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
  onMediaCaptionClick: typeof onMediaCaptionClick;
  formatDate: typeof formatDate;
  wrapFolderTitle: typeof wrapFolderTitle;
  ButtonMenu: typeof ButtonMenu;
  ButtonMenuSync: typeof ButtonMenuSync;
  StoriesProvider: typeof StoriesProvider;
  useStories: typeof useStories;
  StoriesSegments: typeof StoriesSegments;
  appSidebarRight: AppSidebarRight;
  createEmojiDropdownButton: typeof createEmojiDropdownButton;
  useEmojiDropdown: typeof useEmojiDropdown;
  useStickersDropdown: typeof useStickersDropdown;
  getFileAndOpenEditor: typeof getFileAndOpenEditor;
  AvatarNewTsx: typeof AvatarNewTsx;
  AppMediaViewerStatic: typeof AppMediaViewerStatic;
  AppPollResultsTab: typeof AppPollResultsTab;
  TranslatableMessageTsx: typeof TranslatableMessageTsx;
  useAppConfig: typeof useAppConfig;
  usePremium: typeof usePremium;
  pickLanguage: typeof pickLanguage;
  usePeerTranslation: typeof usePeerTranslation;
  showSharingPickerPopup: typeof showSharingPickerPopup;
  PaidMessagesInterceptor: typeof PaidMessagesInterceptor;
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
