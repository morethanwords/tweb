import type {MessageMedia} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';

const ENABLED_STORAGE_KEY = 'tweb-widgets';

function isWidgetRenderingEnabledHere() {
  try {
    return localStorage.getItem(ENABLED_STORAGE_KEY) !== '0';
  } catch{
    return true;
  }
}

const isWidgetRenderingEnabledBy = (appConfig: MTAppConfig) => !appConfig?.web_widgets_disabled && isWidgetRenderingEnabledHere();

/**
 * Widgets are on everywhere unless the server turns them off (`web_widgets_disabled` in the app config) or
 * `localStorage['tweb-widgets'] = '0'` does in this browser. Off, a widget message shows as unsupported media over its
 * caption. This answers by the app config as the tab has it now, on for one not loaded yet: what starts a widget asks
 * `whenWidgetRenderingEnabled`, which waits for it.
 */
export function isWidgetRenderingEnabled() {
  const appConfig = apiManagerProxy.getAppConfig();
  return isWidgetRenderingEnabledBy(appConfig instanceof Promise ? undefined : appConfig);
}

/** Whether a widget may start, once the app config is known (the tab keeps it, so mostly at once). */
export function whenWidgetRenderingEnabled(): MaybePromise<boolean> {
  const appConfig = apiManagerProxy.getAppConfig();
  if(appConfig instanceof Promise) {
    return appConfig.then(isWidgetRenderingEnabledBy, () => isWidgetRenderingEnabledHere());
  }

  return isWidgetRenderingEnabledBy(appConfig);
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
