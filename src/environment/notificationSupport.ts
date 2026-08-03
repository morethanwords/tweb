const IS_NOTIFICATION_SUPPORTED = typeof Notification !== 'undefined' &&
  typeof Notification.requestPermission === 'function';

export default IS_NOTIFICATION_SUPPORTED;
