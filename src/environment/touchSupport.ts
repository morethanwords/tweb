// @ts-ignore
const IS_TOUCH_SUPPORTED = ('ontouchstart' in window) || (window.DocumentTouch && document instanceof DocumentTouch)/*  || true */;
export default IS_TOUCH_SUPPORTED;
