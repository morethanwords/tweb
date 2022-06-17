/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarListLoader from "../helpers/avatarListLoader";
import { Photo } from "../layer";
import appDownloadManager from "../lib/appManagers/appDownloadManager";
import appImManager from "../lib/appManagers/appImManager";
import rootScope from "../lib/rootScope";
import AppMediaViewerBase from "./appMediaViewerBase";

type AppMediaViewerAvatarTargetType = {element: HTMLElement, photoId: Photo.photo['id']};
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
    this.openMedia(target.photoId, target.element, -1);
  };

  onNextClick = (target: AppMediaViewerAvatarTargetType) => {
    this.openMedia(target.photoId, target.element, 1);
  };

  onDownloadClick = async() => {
    appDownloadManager.downloadToDisc({
      media: await this.managers.appPhotosManager.getPhoto(this.target.photoId), 
      queueId: appImManager.chat.bubbles.lazyLoadQueue.queueId
    });
  };

  public async openMedia(photoId: Photo.photo['id'], target?: HTMLElement, fromRight = 0, prevTargets?: AppMediaViewerAvatarTargetType[], nextTargets?: AppMediaViewerAvatarTargetType[]) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const photo = await this.managers.appPhotosManager.getPhoto(photoId);
    const ret = super._openMedia(photo, photo.date, this.peerId, fromRight, target, false, prevTargets, nextTargets);
    this.target.photoId = photo.id;

    return ret;
  }
}
