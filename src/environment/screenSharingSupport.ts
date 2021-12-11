const IS_SCREEN_SHARING_SUPPORTED = !!('getDisplayMedia' in (navigator?.mediaDevices || {}));

export default IS_SCREEN_SHARING_SUPPORTED;
