// @ts-ignore
export const isTouchSupported = ('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch)/*  || true */;