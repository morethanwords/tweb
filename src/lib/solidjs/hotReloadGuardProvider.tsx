import {ParentProps} from 'solid-js';

import AppMediaViewer from '@components/appMediaViewer';
import {AutonomousMonoforumThreadList} from '@components/autonomousDialogList/monoforumThreads';
import {avatarNew} from '@components/avatarNew';
import BusinessHours from '@components/businessHours';
import ButtonMenu from '@components/buttonMenu';
import {ChatType} from '@components/chat/chat';
import confirmationPopup from '@components/confirmationPopup';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmoticonsSearch from '@components/emoticonsDropdown/search';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {InputFieldTsx} from '@components/inputFieldTsx';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import PeerProfileAvatars from '@components/peerProfileAvatars';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {setQuizHint} from '@components/poll';
import PopupElement from '@components/popups';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import showLimitPopup from '@components/popups/limit';
import PopupPremium from '@components/popups/premium';
import PopupSendGift from '@components/popups/sendGift';
import showStarsRatingPopup from '@components/popups/starsRating';
import PopupToggleReadDate from '@components/popups/toggleReadDate';
import PopupTranslate from '@components/popups/translate';
import Row from '@components/rowTsx';
import appSidebarLeft from '@components/sidebarLeft';
import AppChatFoldersTab from '@components/sidebarLeft/tabs/chatFolders';
import AppEditFolderTab from '@components/sidebarLeft/tabs/editFolder';
import Slideshow from '@components/slideshow'; // Added import
import {hideToast, toast, toastNew} from '@components/toast';
import {wrapAdaptiveCustomEmoji} from '@components/wrappers/customEmojiSimple';
import DocumentTsx from '@components/wrappers/documentTsx';
import wrapFolderTitle from '@components/wrappers/folderTitle';
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
import themeController from '@helpers/themeController';
import {useAppSettings} from '@stores/appSettings';
import appDialogsManager from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import I18n, {i18n, join} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import lottieLoader from '@lib/rlottie/lottieLoader';
import rootScope from '@lib/rootScope';
import {SolidJSHotReloadGuardContext} from '@lib/solidjs/hotReloadGuard';
import {formatDate} from '@helpers/date';


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
      PopupTranslate,
      PopupToggleReadDate,
      wrapSticker,
      wrapTopicNameButton,
      wrapRichText,
      getPeerTitle,
      wrapPeerTitle,
      wrapPhoto,
      wrapEmojiText,
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
      formatDate,
      hideToast,
      wrapFolderTitle,
      ButtonMenu
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
