/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { DownloadMediaOptions } from "../../../mtproto/apiFileManager";
import getDocumentDownloadOptions from "../docs/getDocumentDownloadOptions";
import getPhotoDownloadOptions from "../photos/getPhotoDownloadOptions";
import getDownloadFileNameFromOptions from "./getDownloadFileNameFromOptions";

export default function getDownloadMediaDetails(options: DownloadMediaOptions) {
  const {media, thumb, queueId, onlyCache} = options;
  const downloadOptions = media._ === 'document' ? getDocumentDownloadOptions(media, thumb as any, queueId, onlyCache) : getPhotoDownloadOptions(media as any, thumb, queueId, onlyCache);
  const fileName = getDownloadFileNameFromOptions(downloadOptions);
  return {fileName, downloadOptions};
}
