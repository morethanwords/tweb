import { WebDocument } from "../../../../layer";
import { DownloadOptions } from "../../../mtproto/apiFileManager";

export default function getWebDocumentDownloadOptions(webDocument: WebDocument): DownloadOptions {
  return {
    dcId: 4,
    location: {
      _: 'inputWebFileLocation',
      access_hash: (webDocument as WebDocument.webDocument).access_hash,
      url: webDocument.url
    },
    size: webDocument.size,
    mimeType: webDocument.mime_type
  };
}
