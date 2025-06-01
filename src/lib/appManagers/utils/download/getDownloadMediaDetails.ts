/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {DownloadMediaOptions, DownloadOptions} from '../../../mtproto/apiFileManager';
import getDocumentDownloadOptions from '../docs/getDocumentDownloadOptions';
import getPhotoDownloadOptions from '../photos/getPhotoDownloadOptions';
import getWebDocumentDownloadOptions from '../webDocs/getWebDocumentDownloadOptions';
import isWebDocument from '../webDocs/isWebDocument';
import getWebFileDownloadOptions from '../webFiles/getWebFileDownloadOptions';
import isWebFileLocation from '../webFiles/isWebFileLocation';
import getDownloadFileNameFromOptions from './getDownloadFileNameFromOptions';

export default function getDownloadMediaDetails(options: DownloadMediaOptions) {
  const {media, thumb, queueId, onlyCache} = options;

  let downloadOptions: DownloadOptions;
  if(media._ === 'document') downloadOptions = getDocumentDownloadOptions(media, {thumb: thumb as any, queueId, onlyCache});
  else if(media._ === 'photo') downloadOptions = getPhotoDownloadOptions(media, thumb as any, queueId, onlyCache);
  else if(isWebDocument(media)) downloadOptions = getWebDocumentDownloadOptions(media);
  else if(isWebFileLocation(media)) {
    downloadOptions = getWebFileDownloadOptions(media);
    if(options.fileName) downloadOptions.fileName = options.fileName;
  }

  downloadOptions.downloadId = options.downloadId;

  const fileName = getDownloadFileNameFromOptions(downloadOptions);
  return {fileName, downloadOptions};
}
