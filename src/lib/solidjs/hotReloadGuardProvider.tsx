import {ParentProps} from 'solid-js';

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
import createEmojiDropdownButton, {useEmojiDropdown} from '@components/emojiDropdownButton';
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
import appSidebarLeft from '@components/sidebarLeft';
import appSidebarRight from '@components/sidebarRight';
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
import themeController from '@helpers/themeController';
import usePeerTranslation from '@hooks/usePeerTranslation';
import apiManagerProxy from '@lib/apiManagerProxy';
import appDialogsManager from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import I18n, {i18n, join} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import lottieLoader from '@lib/rlottie/lottieLoader';
import rootScope from '@lib/rootScope';
import {SolidJSHotReloadGuardContext} from '@lib/solidjs/hotReloadGuard';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import {useAppSettings} from '@stores/appSettings';
import {useAppConfig} from '@stores/appState';
import usePremium from '@stores/premium';


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
      AutonomousMonoforumThreadList,
      uiNotificationsManager,
      I18n,
      i18n,
      join,
      PopupElement,
      PopupToggleReadDate,
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
      PeerProfileAvatars,
      showStarsRatingPopup,
      toast,
      toastNew,
      BusinessHours,
      avatarNew,
      PeerTitleTsx,
      PopupSendGift,
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
      PaidMessagesInterceptor
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
