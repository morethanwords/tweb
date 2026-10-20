// The value behind <SolidJSHotReloadGuardProvider>: the app's imperative singletons and the components that would
// otherwise import them, collected here once — only the app's root imports this module (pages/bootstrapIm, the popup
// sandbox) — and handed to the provider, which stays light enough for any component to mount.
import AppMediaViewer, {onMediaCaptionClick} from '@components/mediaViewer';
import AppMediaViewerStatic from '@components/mediaViewer/static';
import {AutonomousMonoforumThreadList} from '@components/autonomousDialogList/monoforumThreads';
import {openInstantViewInAppBrowser} from '@components/browser';
import {avatarNew, AvatarNewTsx, StoriesSegments} from '@components/avatarNew';
import BusinessHours from '@components/businessHours';
import ButtonMenu, {ButtonMenuSync} from '@components/buttonMenu';
import {ChatType} from '@components/chat/chatType';
import PaidMessagesInterceptor from '@components/chat/paidMessagesInterceptor';
import {pickLanguage} from '@components/chat/translation';
import CommunityLinkSection from '@components/communities/communityLinkSection';
import confirmationPopup from '@components/confirmationPopup';
import confirmOpenGoogleMaps from '@components/confirmOpenGoogleMaps';
import createEmojiDropdownButton, {useEmojiDropdown} from '@components/emojiDropdownButton';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmoticonsSearch from '@components/emoticonsDropdown/search';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {InputFieldTsx} from '@components/inputFieldTsx';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import PeerProfileAvatars from '@components/peerProfileAvatars';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import {useStickersDropdown} from '@components/popups/createPoll/stickersDropdown';
import showLimitPopup from '@components/popups/limit';
import showForwardPopup from '@components/popups/forward';
import showMyQrCodePopup from '@components/popups/myQrCode';
import showPeerProfilePopup from '@components/popups/peerProfile';
import {showSharingPickerPopup} from '@components/popups/pickUser';
import showPremiumPopup, {showBusinessPopup} from '@components/popups/premium';
import showSendGiftPopup from '@components/popups/sendGift';
import showStarGiftInfoPopup from '@components/popups/starGiftInfo';
import showStarsRatingPopup from '@components/popups/starsRating';
import showStarsPopup from '@components/popups/stars';
import showToggleReadDatePopup from '@components/popups/toggleReadDate';
import {setQuizHint} from '@components/quizHint';
import Row from '@components/rowTsx';
import appSidebarLeft from '@components/sidebarLeft';
import {openEmojiStatusPicker} from '@components/sidebarLeft/emojiStatusPicker';
import appSidebarRight from '@components/sidebarRight';
import AppPollResultsTab from '@components/sidebarRight/tabs/pollResults';
import Slideshow from '@components/slideshow';
import * as tabs from '@components/solidJsTabs/tabs';
import {AppChatFoldersTab, AppEditFolderTab} from '@components/solidJsTabs/tabs';
import '@components/solidJsTabs';
import {StoriesProvider, useStories} from '@components/stories/store';
import {createStoriesViewer, createStoriesViewerWithPeer, createStoriesViewerWithProvider} from '@components/stories/viewer';
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
import themeController from '@helpers/themeController';
import usePeerTranslation from '@hooks/usePeerTranslation';
import apiManagerProxy from '@lib/apiManagerProxy';
import appDialogsManager from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import I18n, {i18n, join} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import lottieLoader from '@lib/lottie/lottieLoader';
import rootScope from '@lib/rootScope';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import switchAccount from '@lib/accounts/switchAccount';
import {useAppSettings} from '@stores/appSettings';
import {useAppConfig} from '@stores/appState';
import usePremium from '@stores/premium';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {SliderSuperTab} from '@components/slider';

registerHotReloadGuard({
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
  showPremiumPopup,
  showBusinessPopup,
  EmoticonsDropdown,
  EmojiTab,
  appDialogsManager,
  AutonomousMonoforumThreadList,
  uiNotificationsManager,
  I18n,
  i18n,
  join,
  showToggleReadDatePopup,
  wrapSticker,
  wrapTopicNameButton,
  wrapRichText,
  getPeerTitle,
  wrapPeerTitle,
  wrapPhoto,
  wrapEmojiText,
  wrapGeo,
  wrapAdaptiveCustomEmoji,
  confirmationPopup,
  confirmOpenGoogleMaps,
  PeerProfileAvatars,
  showStarsRatingPopup,
  showStarsPopup,
  toast,
  toastNew,
  BusinessHours,
  avatarNew,
  PeerTitleTsx,
  showSendGiftPopup,
  showStarGiftInfoPopup,
  openEmojiStatusPicker,
  showBirthdayPopup,
  saveMyBirthday,
  showMyQrCodePopup,
  useAppSettings,
  ChatType,
  wrapReply,
  wrapTopicIcon,
  VideoTsx,
  Row,
  PhotoTsx,
  DocumentTsx,
  Slideshow,
  AppMediaViewer,
  onMediaCaptionClick,
  formatDate,
  hideToast,
  wrapFolderTitle,
  ButtonMenu,
  ButtonMenuSync,
  StoriesProvider,
  useStories,
  StoriesSegments,
  appSidebarRight,
  createEmojiDropdownButton,
  useEmojiDropdown,
  useStickersDropdown,
  getFileAndOpenEditor,
  AvatarNewTsx,
  AppMediaViewerStatic,
  AppPollResultsTab,
  TranslatableMessageTsx,
  useAppConfig,
  usePremium,
  pickLanguage,
  usePeerTranslation,
  showSharingPickerPopup,
  PaidMessagesInterceptor,
  CommunityLinkSection,
  showForwardPopup,
  showPeerProfilePopup,
  createStoriesViewer,
  createStoriesViewerWithPeer,
  createStoriesViewerWithProvider,
  openInstantViewInAppBrowser,
  switchAccount,
  tabs
});

// An edit below a popup or a tab registered here runs this module again and registers the new one, which the code
// that reads the registry at call time picks up. The singletons and the tab classes (solidJsTabs/tabs's top-level
// values, which `SidebarSlider.getTab()` matches the open tabs with by `instanceof`) are the same across that: the dev
// server keeps them (see @helpers/hotRegistry).
if(import.meta.hot) import.meta.hot.accept();
