export const unversionedMainBroadcastChannelName = 'webk-main-broadcast-channel';

/**
 * Make sure to add handling of different versions of the app open in different tabs when adding more complex events
 */
export type MainBroadcastChannelEvents = {
  // * `dropFlags`: flags switched off in Settings → Experimental, which leave every tab's URL too, or that URL would
  // * turn them on again; a version without it reloads as it is.
  // * `olderThan`: only the tabs of a build older than this reload — a newer version asks them to, as their
  // * connections keep a database it upgrades at their version (every version reloads on it; `dropFlags` is always
  // * there, as one before this field reads it unchecked)
  reload: void | {dropFlags: string[], olderThan?: number};
};
