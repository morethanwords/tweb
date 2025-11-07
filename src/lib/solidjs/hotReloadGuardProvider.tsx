import {ParentProps} from 'solid-js';

import {AutonomousMonoforumThreadList} from '../../components/autonomousDialogList/monoforumThreads';
import {EmoticonsDropdown} from '../../components/emoticonsDropdown';
import EmoticonsSearch from '../../components/emoticonsDropdown/search';
import EmojiTab from '../../components/emoticonsDropdown/tabs/emoji';
import {InputFieldTsx} from '../../components/inputFieldTsx';
import PasswordMonkey from '../../components/monkeys/password';
import PasswordInputField from '../../components/passwordInputField';
import {PeerTitleTsx} from '../../components/peerTitleTsx';
import {setQuizHint} from '../../components/poll';
import showLimitPopup from '../../components/popups/limit';
import PopupPremium from '../../components/popups/premium';
import appSidebarLeft from '../../components/sidebarLeft';
import AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import wrapStickerSetThumb from '../../components/wrappers/stickerSetThumb';
import themeController from '../../helpers/themeController';
import appDialogsManager from '../appManagers/appDialogsManager';
import appImManager from '../appManagers/appImManager';
import uiNotificationsManager from '../appManagers/uiNotificationsManager';
import apiManagerProxy from '../mtproto/mtprotoworker';
import lottieLoader from '../rlottie/lottieLoader';
import rootScope from '../rootScope';
import {SolidJSHotReloadGuardContext} from './hotReloadGuard';
import I18n, {i18n, join} from '../langPack';
import PopupElement from '../../components/popups';
import PopupTranslate from '../../components/popups/translate';
import PopupToggleReadDate from '../../components/popups/toggleReadDate';
import wrapSticker from '../../components/wrappers/sticker';
import wrapTopicNameButton from '../../components/wrappers/topicNameButton';
import wrapRichText from '../richTextProcessor/wrapRichText';
import wrapPeerTitle from '../../components/wrappers/peerTitle';
import wrapPhoto from '../../components/wrappers/photo';
import wrapEmojiText from '../richTextProcessor/wrapEmojiText';
import {wrapAdaptiveCustomEmoji} from '../../components/wrappers/customEmojiSimple';
import confirmationPopup from '../../components/confirmationPopup';
import PeerProfileAvatars from '../../components/peerProfileAvatars';
import showStarsRatingPopup from '../../components/popups/starsRating';
import {toast, toastNew} from '../../components/toast';
import BusinessHours from '../../components/businessHours';
import {avatarNew} from '../../components/avatarNew';


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
      PeerTitleTsx
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
