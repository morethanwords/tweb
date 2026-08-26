import privacyTab from './privacyTab';
import PrivacySection from '@components/privacySection';
import {i18n, LangPackKey} from '@lib/langPack';
import {SliderSuperTabEventable} from '@components/sliderTab';
import SettingSection from '@components/settingSection';
import RowTsx from '@components/rowTsx';
import {pickAvatarAndUpload} from '@components/avatarEdit';
import confirmationPopup from '@components/confirmationPopup';
import rootScope from '@lib/rootScope';
import {avatarNew, wrapPhotoToAvatar} from '@components/avatarNew';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {UserFull, Photo} from '@layer';
import ProgressivePreloader from '@components/preloader';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

const caption: LangPackKey = 'PrivacySettingsController.ProfilePhoto.CustomHelp';

// Public (fallback) profile photo: a standalone photo shown to peers restricted
// from seeing the real one. Set / Update / Remove, with the remove control
// doubling as an upload-progress + cancel slot. Lives below the privacy section.
function buildFallbackSection(tab: SliderSuperTabEventable) {
  let avatarMiddleware: MiddlewareHelper;
  let uploadPreloader: ProgressivePreloader;
  let uploadProgress: CancellablePromise<any>;
  let fallbackTitle: HTMLDivElement;
  let removeMedia: HTMLDivElement;

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

    removeRow.classList.toggle('hide', !hasFallback);
    fallbackTitle.replaceChildren(i18n(hasFallback ?
      'PrivacySettingsController.UpdatePublicPhoto' :
      'PrivacySettingsController.SetPublicPhoto'));

    renderRemoveAvatar(hasFallback ? fallback : undefined);
  };

  const endUploadProgress = () => {
    uploadProgress = undefined;
    removeRow.classList.remove('is-uploading');
    uploadPreloader?.detach();
    refreshFallback();
  };

  const showUploadProgress = (progress: CancellablePromise<any>) => {
    uploadProgress = progress;

    // Switch the row into "uploading" mode: a progress ring over the avatar slot
    // (overlays the previous photo if any), and a click cancels (onRemoveRowClick).
    removeRow.classList.remove('hide');
    removeRow.classList.add('is-uploading');

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

  const middleware = tab.middlewareHelper.get();
  const fallbackRow = wrapSolidComponent(() => (
    <RowTsx clickable={onSetFallbackClick}>
      <RowTsx.Icon icon="cameraadd" />
      <RowTsx.Title ref={fallbackTitle}>
        {i18n('PrivacySettingsController.SetPublicPhoto')}
      </RowTsx.Title>
    </RowTsx>
  ), middleware);

  // The remove control is a transparent-danger Row whose media is the
  // currently-set public photo (instead of a delete icon). While an upload is
  // running it shows a progress ring in that slot, and a click cancels it.
  const removeRow = wrapSolidComponent(() => (
    <RowTsx
      clickable={onRemoveRowClick}
      class="danger privacy-public-photo-remove"
    >
      <RowTsx.Title>{i18n('PrivacySettingsController.RemovePublicPhoto')}</RowTsx.Title>
      <RowTsx.Media ref={removeMedia} size="medium" />
    </RowTsx>
  ), middleware);

  section.content.append(fallbackRow, removeRow);
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
    managers: tab.managers
  });

  buildFallbackSection(tab);
});
