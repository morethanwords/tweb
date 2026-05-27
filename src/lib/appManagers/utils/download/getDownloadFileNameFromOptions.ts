import {getFileNameByLocation} from '@helpers/fileName';
import {DownloadOptions} from '@appManagers/apiFileManager';

export default function getDownloadFileNameFromOptions(options: DownloadOptions) {
  return getFileNameByLocation(options.location, options);
}
