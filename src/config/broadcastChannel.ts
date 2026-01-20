export const unversionedMainBroadcastChannelName = 'webk-main-broadcast-channel';

/**
 * Make sure to add handling of different versions of the app open in different tabs when adding more complex events
 */
export type MainBroadcastChannelEvents = {
  reload: void;
};
