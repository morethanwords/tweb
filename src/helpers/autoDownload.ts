/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { State } from "../lib/appManagers/appStateManager";
import rootScope from "../lib/rootScope";

export type ChatAutoDownloadSettings = {
  photo: number,
  video: number,
  file: number
};

export default function getAutoDownloadSettingsByPeerId(peerId: PeerId): ChatAutoDownloadSettings {
  let type: keyof State['settings']['autoDownload'];

  let photoSizeMax = 0, videoSizeMax = 0, fileSizeMax = 0;
  const settings = rootScope.settings;
  if(!settings.autoDownloadNew.pFlags.disabled && peerId) {
    if(peerId.isUser()) {
      if(peerId.isContact()) {
        type = 'contacts';
      } else {
        type = 'private';
      }
    } else if(peerId.isBroadcast()) {
      type = 'channels';
    } else {
      type = 'groups';
    }
    
    if(settings.autoDownload.photo[type]) photoSizeMax = settings.autoDownloadNew.photo_size_max;
    if(settings.autoDownload.video[type]) videoSizeMax = settings.autoDownloadNew.video_size_max;
    if(settings.autoDownload.file[type]) fileSizeMax = settings.autoDownloadNew.file_size_max;
  }

  return {
    photo: photoSizeMax,
    video: videoSizeMax,
    file: fileSizeMax
  };
}
