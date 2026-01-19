import IS_TOUCH_SUPPORTED from '@environment/touchSupport';

const IS_WEB_APP_BROWSER_SUPPORTED = !IS_TOUCH_SUPPORTED;
export default IS_WEB_APP_BROWSER_SUPPORTED;
