export const unversionedMainBroadcastChannelName = 'webk-main-broadcast-channel';

/**
 * Make sure to add handling of different versions of the app open in different tabs when adding more complex events
 */
export type MainBroadcastChannelEvents = {
  // * `dropFlags`: flags switched off in Settings → Experimental, which leave every tab's URL too, or that URL would
  // * turn them on again; a version without it reloads as it is
  reload: void | {dropFlags: string[]};
};
