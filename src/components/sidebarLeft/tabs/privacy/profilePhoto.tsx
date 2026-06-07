import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {i18n, LangPackKey} from '@lib/langPack';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import {SliderSuperTabEventable} from '@components/sliderTab';
import SettingSection from '@components/settingSection';
import Row from '@components/row';
import {pickAvatarAndUpload} from '@components/avatarEdit';
import confirmationPopup from '@components/confirmationPopup';
import rootScope from '@lib/rootScope';
import {avatarNew, wrapPhotoToAvatar} from '@components/avatarNew';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {UserFull, Photo} from '@layer';
import ProgressivePreloader from '@components/preloader';
import type {CancellablePromise} from '@helpers/cancellablePromise';

const caption: LangPackKey = 'PrivacySettingsController.ProfilePhoto.CustomHelp';

// Public (fallback) profile photo: a standalone photo shown to peers restricted
// from seeing the real one. Set / Update / Remove, with the remove control
// doubling as an upload-progress + cancel slot. Lives below the privacy section.
function buildFallbackSection(tab: SliderSuperTabEventable) {
  let avatarMiddleware: MiddlewareHelper;
  let uploadPreloader: ProgressivePreloader;
  let uploadProgress: CancellablePromise<any>;

  const renderRemoveAvatar = (fallback: Photo.photo | undefined) => {
    avatarMiddleware?.destroy();
    removeMedia.replaceChildren();
    if(!fallback) return;

    avatarMiddleware = getMiddleware();
    const avatar = avatarNew({
      middleware: avatarMiddleware.get(),
      size: 36,
      isDialog: false
    });
    removeMedia.appendChild(avatar.node);

    // The fallback (public) photo is a standalone Photo, NOT one of the peer's
    // listed profile photos, so it must be downloaded via inputPhotoFileLocation
    // (its own access_hash + file_reference) — which is what wrapPhoto does.
    // Rendering it through a synthetic userProfilePhoto builds an
    // inputPeerPhotoFileLocation the server can't resolve for a fallback photo
    // → FILE_ID_INVALID. Show the static cover (strip video_sizes); a 36px
    // control doesn't need the ~2MB animated variant.
    wrapPhotoToAvatar(avatar, {...fallback, video_sizes: undefined}, 36);
  };

  const refreshFallback = async() => {
    // An in-flight upload owns the row (progress + cancel) — don't disturb it.
    if(uploadProgress) return;

    const userFull = await tab.managers.appProfileManager.getProfile(rootScope.myId.toUserId());
    const fallback = (userFull as UserFull.userFull)?.fallback_photo as Photo.photo | undefined;
    const hasFallback = !!fallback;

    removeRow.container.classList.toggle('hide', !hasFallback);
    fallbackRow.title.replaceChildren(i18n(hasFallback ?
      'PrivacySettingsController.UpdatePublicPhoto' :
      'PrivacySettingsController.SetPublicPhoto'));

    renderRemoveAvatar(hasFallback ? fallback : undefined);
  };

  const endUploadProgress = () => {
    uploadProgress = undefined;
    removeRow.container.classList.remove('is-uploading');
    uploadPreloader?.detach();
    refreshFallback();
  };

  const showUploadProgress = (progress: CancellablePromise<any>) => {
    uploadProgress = progress;

    // Switch the row into "uploading" mode: a progress ring over the avatar slot
    // (overlays the previous photo if any), and a click cancels (onRemoveRowClick).
    removeRow.container.classList.remove('hide');
    removeRow.container.classList.add('is-uploading');

    uploadPreloader ??= new ProgressivePreloader({isUpload: true, cancelable: false});
    uploadPreloader.attach(removeMedia, true, progress);

    // Cancel / failure reverts the row; success is handled via onUploaded.
    progress.catch(() => {
      if(uploadProgress === progress) endUploadProgress();
    });
  };

  const onSetFallbackClick = () => {
    pickAvatarAndUpload({
      managers: tab.managers,
      mode: 'fallback',
      onUploadStart: (progress) => showUploadProgress(progress),
      onUploaded: () => endUploadProgress()
    });
  };

  const onRemoveFallbackClick = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'PrivacySettingsController.RemovePublicPhotoConfirmTitle',
        descriptionLangKey: 'PrivacySettingsController.RemovePublicPhotoConfirmDescription',
        button: {langKey: 'Remove', isDanger: true}
      });
    } catch{ return; }

    await tab.managers.appProfileManager.clearFallbackProfilePhoto();
    refreshFallback();
  };

  const onRemoveRowClick = () => {
    if(uploadProgress) {
      uploadProgress.cancel();
      return;
    }

    onRemoveFallbackClick();
  };

  const section = new SettingSection({
    name: 'PrivacySettingsController.PublicPhoto',
    caption: 'PrivacySettingsController.PublicPhoto.Help'
  });

  const fallbackRow = new Row({
    icon: 'cameraadd',
    titleLangKey: 'PrivacySettingsController.SetPublicPhoto',
    clickable: () => onSetFallbackClick(),
    listenerSetter: tab.listenerSetter
  });

  // The remove control is a transparent-danger Row whose media is the
  // currently-set public photo (instead of a delete icon). While an upload is
  // running it shows a progress ring in that slot, and a click cancels it.
  const removeRow = new Row({
    titleLangKey: 'PrivacySettingsController.RemovePublicPhoto',
    clickable: () => onRemoveRowClick(),
    listenerSetter: tab.listenerSetter
  });
  removeRow.container.classList.add('danger', 'privacy-public-photo-remove');
  const removeMedia = removeRow.createMedia('medium');

  section.content.append(fallbackRow.container, removeRow.container);
  tab.scrollable.append(section.container);

  refreshFallback();
  tab.listenerSetter.add(rootScope)('user_full_update', (userId) => {
    if(userId === rootScope.myId.toUserId()) refreshFallback();
  });
}

export default privacyTab('privacy-profile-photo', (tab) => {
  new PrivacySection({
    tab,
    title: 'PrivacyProfilePhotoTitle',
    inputKey: 'inputPrivacyKeyProfilePhoto',
    captions: [caption, caption, caption],
    exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
    appendTo: tab.scrollable,
    skipTypes: [PrivacyType.Nobody],
    managers: tab.managers
  });

  buildFallbackSection(tab);
});
