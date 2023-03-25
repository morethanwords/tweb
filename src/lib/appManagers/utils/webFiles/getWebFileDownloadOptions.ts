import {InputWebFileLocation} from '../../../../layer';
import {DownloadOptions} from '../../../mtproto/apiFileManager';

export default function getWebFileDownloadOptions(location: InputWebFileLocation): DownloadOptions {
  const downloadOptions: DownloadOptions = {
    dcId: 0,
    location,
    size: 0,
    mimeType: 'image/jpeg'
  };

  // if(location._ === 'inputWebFileGeoPointLocation') {
  //   downloadOptions.size = 512 * 1024;
  //   downloadOptions.mimeType = 'image/jpeg';
  // }

  return downloadOptions;
}
