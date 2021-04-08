/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export const userAgent = navigator ? navigator.userAgent : null;
export const isApple = navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) !== -1;
export const isAndroid = navigator.userAgent.toLowerCase().indexOf('android') !== -1;
export const isChromium = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 */
export const ctx = typeof(window) !== 'undefined' ? window : self;

// https://stackoverflow.com/a/58065241
export const isAppleMobile = (/iPad|iPhone|iPod/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !ctx.MSStream;

export const isSafari = !!('safari' in ctx) || !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))))/*  || true */;

export const isMobileSafari = isSafari && isAppleMobile;

export const isMobile = /* screen.width && screen.width < 480 ||  */navigator.userAgent.search(/iOS|iPhone OS|Android|BlackBerry|BB10|Series ?[64]0|J2ME|MIDP|opera mini|opera mobi|mobi.+Gecko|Windows Phone/i) != -1;
