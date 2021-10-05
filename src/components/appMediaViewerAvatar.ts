/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarListLoader from "../helpers/avatarListLoader";
import appImManager from "../lib/appManagers/appImManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import AppMediaViewerBase from "./appMediaViewerBase";

type AppMediaViewerAvatarTargetType = {element: HTMLElement, photoId: string};
export default class AppMediaViewerAvatar extends AppMediaViewerBase<'', 'delete', AppMediaViewerAvatarTargetType> {
  public peerId: number;

  constructor(peerId: number) {
    super(new AvatarListLoader({peerId}), [/* 'delete' */]);

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

  onDownloadClick = () => {
    appPhotosManager.savePhotoFile(appPhotosManager.getPhoto(this.target.photoId), appImManager.chat.bubbles.lazyLoadQueue.queueId);
  };

  public async openMedia(photoId: string, target?: HTMLElement, fromRight = 0, prevTargets?: AppMediaViewerAvatarTargetType[], nextTargets?: AppMediaViewerAvatarTargetType[]) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const photo = appPhotosManager.getPhoto(photoId);
    const ret = super._openMedia(photo, photo.date, this.peerId, fromRight, target, false, prevTargets, nextTargets);
    this.target.photoId = photo.id;

    return ret;
  }
}
