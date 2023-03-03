/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarListLoader from '../helpers/avatarListLoader';
import {Photo} from '../layer';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import appImManager from '../lib/appManagers/appImManager';
import rootScope from '../lib/rootScope';
import AppMediaViewerBase from './appMediaViewerBase';

type AppMediaViewerAvatarTargetType = {element: HTMLElement, photoId: Photo.photo['id'], photo?: Photo.photo};
export default class AppMediaViewerAvatar extends AppMediaViewerBase<'', 'delete', AppMediaViewerAvatarTargetType> {
  public peerId: PeerId;

  constructor(peerId: PeerId) {
    super(new AvatarListLoader({peerId, managers: rootScope.managers}), [/* 'delete' */]);

    this.peerId = peerId;

    this.setBtnMenuToggle([{
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: this.onDownloadClick
    }/* , {
      icon: 'delete danger btn-disabled',
      text: 'Delete',
      onClick: () => {}
    } */]);

    // * constructing html end

    this.setListeners();
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

    const photo = await this.managers.appPhotosManager.getPhoto(photoId);
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
