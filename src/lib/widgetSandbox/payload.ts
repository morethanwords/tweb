import type {MessageMedia} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';

const ENABLED_STORAGE_KEY = 'tweb-widgets';

/**
 * Widgets are the client's own switch: the server has none (docs/integration.md, "Enabling"). On everywhere;
 * `localStorage['tweb-widgets'] = '0'` turns them off in this browser. Off, a widget message shows as unsupported
 * media over its caption.
 */
export function isWidgetRenderingEnabled() {
  try {
    return localStorage.getItem(ENABLED_STORAGE_KEY) !== '0';
  } catch{
    return true;
  }
}

/**
 * The widget's HTML: `messageMediaWidget.payload` is a zlib stream of its UTF-8 source (RFC 1950, not gzip), inflated
 * in the crypto worker (fflate tells the formats apart by their headers). No size limit of our own: the server keeps
 * the source within 32 KB and the stream within 4 KB, and the sandbox, not the size, is the boundary
 * (docs/tgw-format.md).
 */
export function getWidgetSource(media: Pick<MessageMedia.messageMediaWidget, 'payload'>) {
  return apiManagerProxy.invokeCrypto('gzipUncompress', media.payload, true) as Promise<string>;
}
