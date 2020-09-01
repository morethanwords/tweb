export const userAgent = navigator ? navigator.userAgent : null;
export const isApple = navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) != -1;
export const isAndroid = navigator.userAgent.toLowerCase().indexOf('android') != -1;

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 */
const ctx = typeof(window) !== 'undefined' ? window : self;

// https://stackoverflow.com/a/58065241
export const isAppleMobile = (/iPad|iPhone|iPod/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !ctx.MSStream;

export const isSafari = !!('safari' in ctx) || !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))))/*  || true */;