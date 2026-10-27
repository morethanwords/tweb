import {attachClickEvent} from '@helpers/dom/clickEvent';
import AvatarListLoader from '@helpers/avatarListLoader';
import {Photo} from '@layer';
import appDownloadManager from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import AppMediaViewerBase from '@components/mediaViewer/base';
import confirmationPopup from '@components/confirmationPopup';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import overlayAvatarVideoOnMover from '@components/mediaViewer/avatarVideo';
import {i18n} from '@lib/langPack';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

type AppMediaViewerAvatarTargetType = {element: HTMLElement, photoId: Photo.photo['id'], photo?: Photo.photo};
export default class AppMediaViewerAvatar extends AppMediaViewerBase<'', 'delete', AppMediaViewerAvatarTargetType> {
  public peerId: PeerId;
  protected btnMenuDelete: ButtonMenuItemOptionsVerifiable;
  private canDeletePromise: Promise<boolean>;
  private videoAvatarCleanup?: () => void;
  private fallbackPhotoId?: Photo.photo['id'];

  constructor(peerId: PeerId, fallbackPhotoId?: Photo.photo['id']) {
    super(new AvatarListLoader({peerId, managers: rootScope.managers, fallbackPhotoId}), ['delete']);

    this.peerId = peerId;
    this.fallbackPhotoId = fallbackPhotoId;

    // The avatar viewer's date line also shows "X of Y" (a regular photo) or
    // "Public Photo" (the fallback) before the date. The total count arrives
    // after the first page loads, so refresh the prefix on every load too.
    const baseOnLoadedMore = this.listLoader.onLoadedMore;
    this.listLoader.onLoadedMore = () => {
      baseOnLoadedMore?.();
      this.applyDateExtra();
    };

    this.buttons.delete.classList.add('hide');
    attachClickEvent(this.buttons.delete, this.onDeleteClick);

    this.setBtnMenuToggle([{
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: this.onDownloadClick
    }, this.btnMenuDelete = {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => this.getCanDelete()
    }]);

    // * constructing html end

    this.setListeners();
  }

  private getCanDelete() {
    return this.canDeletePromise ??= this.computeCanDelete();
  }

  private async computeCanDelete(): Promise<boolean> {
    if(this.peerId === rootScope.myId) return true;
    if(this.peerId.isAnyChat()) {
      return this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'change_info');
    }

    // Own bot — its avatar is editable (and removable) by the owner.
    const user = await this.managers.appUsersManager.getUser(this.peerId.toUserId());
    return !!(user?.pFlags?.bot && user.pFlags.bot_can_edit);
  }

  onPrevClick = (target: AppMediaViewerAvatarTargetType) => {
    this.openMedia({
      photoId: target.photoId,
      target: target.element,
      fromRight: -1
    });
  };

  onNextClick = (target: AppMediaViewerAvatarTargetType) => {
    this.openMedia({
      photoId: target.photoId,
      target: target.element,
      fromRight: 1
    });
  };

  onDownloadClick = () => {
    appDownloadManager.downloadToDisc({
      media: this.target.photo,
      queueId: hotReloadGuard.appImManager.chat.bubbles.lazyLoadQueue.queueId
    });
  };

  onDeleteClick = async() => {
    const managers = bindManagersToSession(this.managers);
    const peerId = this.peerId;
    const photoId = this.target.photoId;
    try {
      await confirmationPopup({
        titleLangKey: 'Delete',
        descriptionLangKey: 'AreYouSureDeletePhoto',
        button: {
          langKey: 'Delete',
          isDanger: true
        }
      });
    } catch{
      return;
    }

    if(peerId === rootScope.myId) {
      await managers.appProfileManager.deletePhotos([photoId as string]);
    } else if(peerId.isUser()) { // own bot, see computeCanDelete
      await managers.appProfileManager.clearBotProfilePhoto(peerId.toUserId());
    } else {
      await managers.appChatsManager.editPhoto(peerId.toChatId());
    }

    this.target = {element: this.content.media} as any;
    this.close();
  };

  public async openMedia({
    photoId,
    photo: cachedPhoto,
    target,
    fromRight = 0,
    prevTargets,
    nextTargets
  }: {
    photoId: Photo.photo['id'],
    photo?: Photo.photo,
    target?: HTMLElement,
    fromRight?: number,
    prevTargets?: AppMediaViewerAvatarTargetType[],
    nextTargets?: AppMediaViewerAvatarTargetType[]
  }) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const [photo, canDelete] = await Promise.all([
      cachedPhoto || this.managers.appPhotosManager.getPhoto(photoId),
      this.getCanDelete()
    ]);

    if(this.isAskedTooLate()) return;
    this.buttons.delete.classList.toggle('hide', !canDelete);

    const ret = super._openMedia({
      media: photo,
      timestamp: photo.date,
      fromId: this.peerId,
      fromRight,
      // The profile-avatars carousel lazy-loads its avatar nodes, so a node we
      // navigate to often has no <img>/<canvas> to morph from. Passing such an
      // empty element leaves the incoming slide blank until the animation ends
      // ("appears from emptiness"). Fall back to the container in that case so
      // the viewer's own (cached) thumbnail fills the slide.
      target: target?.querySelector('img, canvas, video') ? target : undefined,
      reverse: false,
      prevTargets,
      nextTargets
    });
    this.target.photoId = photo.id;
    this.target.photo = photo;

    // Animated profile photo — overlay a looping muted video on top of the
    // static image once the open/move animation has settled.
    this.videoAvatarCleanup?.();
    this.videoAvatarCleanup = undefined;
    if((photo as Photo.photo).video_sizes?.length) {
      Promise.resolve(ret).then(() => {
        // Bail if the viewer navigated to a different photo while opening.
        if(this.target?.photoId !== photo.id || !this.content.mover) return;
        this.videoAvatarCleanup = overlayAvatarVideoOnMover(this.content.mover, photo as Photo.photo);
      });
    }

    return ret;
  }

  protected setAuthorInfo(fromId: PeerId | string, timestamp: number) {
    return super.setAuthorInfo(fromId, timestamp).then(() => {
      this.applyDateExtra();
    });
  }

  // The date line reads "<X of Y / Public Photo> • <date>"; re-applied on navigation and once the count loads.
  private applyDateExtra() {
    this.setDateExtra(this.getDateExtraContent());
  }

  private getDateExtraContent(): HTMLElement | undefined {
    const photoId = this.target?.photoId;

    // The public (fallback) photo is labelled, not numbered.
    if(this.fallbackPhotoId && photoId && photoId === this.fallbackPhotoId) {
      return i18n('MediaViewer.ProfilePublicPhoto');
    }

    const index = this.listLoader.index; // 0-based; -1 until the count is known
    const count = this.listLoader.count;
    if(count !== undefined && index >= 0) {
      // The fallback takes one slot in count but is shown as a label, so exclude
      // it from the "of N" total.
      const total = this.fallbackPhotoId ? count - 1 : count;
      if(total > 1) return i18n('Of', [index + 1, total]);
    }

    return undefined;
  }

  public close(e?: MouseEvent) {
    this.videoAvatarCleanup?.();
    this.videoAvatarCleanup = undefined;
    return super.close(e);
  }
}
