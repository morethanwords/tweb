import type {StateSettings} from '@config/state';
import type {Chat} from '@layer';
import type {useAppSettings} from '@stores/appSettings';
import type {usePeer} from '@stores/peers';

export type ChatAutoDownloadSettings = {
  photo: number,
  video: number,
  file: number
};

export default function useAutoDownloadSettings(
  peer: ReturnType<typeof usePeer<PeerId>>,
  appSettings: ReturnType<typeof useAppSettings>[0]
): ChatAutoDownloadSettings {
  let type: keyof StateSettings['autoDownload'];

  let photoSizeMax = 0, videoSizeMax = 0, fileSizeMax = 0;
  if(!appSettings.autoDownloadNew.pFlags.disabled && peer) {
    if(peer._ === 'user') {
      if(peer.pFlags.contact) {
        type = 'contacts';
      } else {
        type = 'private';
      }
    } else if((peer as Chat.channel).pFlags.broadcast) {
      type = 'channels';
    } else {
      type = 'groups';
    }

    if(appSettings.autoDownload.photo[type]) photoSizeMax = appSettings.autoDownloadNew.photo_size_max;
    if(appSettings.autoDownload.video[type]) videoSizeMax = appSettings.autoDownloadNew.video_size_max;
    if(appSettings.autoDownload.file[type]) fileSizeMax = appSettings.autoDownloadNew.file_size_max;
  }

  return {
    photo: photoSizeMax,
    video: videoSizeMax,
    file: fileSizeMax
  };
}
