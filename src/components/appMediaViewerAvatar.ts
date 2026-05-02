/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '@helpers/dom/clickEvent';
import AvatarListLoader from '@helpers/avatarListLoader';
import {Photo} from '@layer';
import appDownloadManager from '@lib/appDownloadManager';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import AppMediaViewerBase from '@components/appMediaViewerBase';
import confirmationPopup from '@components/confirmationPopup';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';

type AppMediaViewerAvatarTargetType = {element: HTMLElement, photoId: Photo.photo['id'], photo?: Photo.photo};
export default class AppMediaViewerAvatar extends AppMediaViewerBase<'', 'delete', AppMediaViewerAvatarTargetType> {
  public peerId: PeerId;
  protected btnMenuDelete: ButtonMenuItemOptionsVerifiable;
  private canDeletePromise: Promise<boolean>;

  constructor(peerId: PeerId) {
    super(new AvatarListLoader({peerId, managers: rootScope.managers}), ['delete']);

    this.peerId = peerId;

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
    return false;
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
      queueId: appImManager.chat.bubbles.lazyLoadQueue.queueId
    });
  };

  onDeleteClick = async() => {
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

    if(peerId.isUser()) {
      await this.managers.appProfileManager.deletePhotos([photoId as string]);
    } else {
      await this.managers.appChatsManager.editPhoto(peerId.toChatId());
    }

    this.target = {element: this.content.media} as any;
    this.close();
  };

  public async openMedia({
    photoId,
    target,
    fromRight = 0,
    prevTargets,
    nextTargets
  }: {
    photoId: Photo.photo['id'],
    target?: HTMLElement,
    fromRight?: number,
    prevTargets?: AppMediaViewerAvatarTargetType[],
    nextTargets?: AppMediaViewerAvatarTargetType[]
  }) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const [photo, canDelete] = await Promise.all([
      this.managers.appPhotosManager.getPhoto(photoId),
      this.getCanDelete()
    ]);

    this.buttons.delete.classList.toggle('hide', !canDelete);

    const ret = super._openMedia({
      media: photo,
      timestamp: photo.date,
      fromId: this.peerId,
      fromRight,
      target,
      reverse: false,
      prevTargets,
      nextTargets
    });
    this.target.photoId = photo.id;
    this.target.photo = photo;

    return ret;
  }
}
