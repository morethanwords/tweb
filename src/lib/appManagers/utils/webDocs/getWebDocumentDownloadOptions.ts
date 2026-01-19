import {WebDocument} from '@layer';
import {DownloadOptions} from '@appManagers/apiFileManager';
import getWebFileDownloadOptions from '@appManagers/utils/webFiles/getWebFileDownloadOptions';

export default function getWebDocumentDownloadOptions(webDocument: WebDocument): DownloadOptions {
  const downloadOptions = getWebFileDownloadOptions({
    _: 'inputWebFileLocation',
    access_hash: (webDocument as WebDocument.webDocument).access_hash,
    url: webDocument.url
  });

  downloadOptions.size = webDocument.size;
  downloadOptions.mimeType = webDocument.mime_type;

  return downloadOptions;
}
