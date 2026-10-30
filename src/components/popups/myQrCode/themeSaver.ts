import type {ShareTheme} from '@layer';
import debounce from '@helpers/schedulers/debounce';
import type {ShareThemeToSave} from './theme';

/**
 * Saving the theme the way the Android client does (`QrShareServer`): every choice shows at once and is sent 700 ms
 * later, a newer choice replaces one still waiting, and the screen going away sends what waits. A theme chosen here is
 * kept per peer for 10 s after it is confirmed, so a full peer that left the server just before the save and comes
 * with the previous theme does not undo it.
 */

export const THEME_SAVE_DELAY = 700;
export const LOCAL_THEME_HOLD = 10_000;

type LocalTheme = {
  shown: ShareTheme,
  /** When the save was confirmed; 0 while it is waiting or on its way */
  savedAt: number
};

const localThemes = new Map<string, LocalTheme>();

/** Android's own panel offers custom emoji only, so the server may not keep a plain one: this device goes on showing it */
const hasPlainEmoji = (theme: ShareTheme) => theme._ === 'shareThemeEmojiBackdrop' && !!theme.emojis?.some((emoji) => emoji._ === 'reactionEmoji');

const keyOf = (account: number, peerId: PeerId) => account + '_' + peerId;

/** The theme chosen on this device that a full peer from the server must not override yet */
export function getHeldTheme(account: number, peerId: PeerId, now = Date.now()): ShareTheme | undefined {
  const key = keyOf(account, peerId);
  const local = localThemes.get(key);
  if(!local) return;

  if(local.savedAt && now - local.savedAt > LOCAL_THEME_HOLD && !hasPlainEmoji(local.shown)) {
    localThemes.delete(key);
    return;
  }

  return local.shown;
}

export function clearHeldThemes() {
  localThemes.clear();
}

export type ThemeSaver = ReturnType<typeof createThemeSaver>;

export function createThemeSaver(options: {
  account: number,
  peerId: PeerId,
  /** Sends it; a failure is handed to `onError` and the held theme goes */
  save: (save: ShareThemeToSave) => Promise<unknown>,
  onError: (error: unknown) => void,
  delay?: number
}) {
  const {account, peerId, delay = THEME_SAVE_DELAY} = options;
  const key = keyOf(account, peerId);
  let pending: ShareThemeToSave | undefined;

  const send = () => {
    sendLater.clearTimeout();
    if(!pending) return Promise.resolve();

    const sending = pending;
    pending = undefined;
    const local = localThemes.get(key);
    return options.save(sending).then(() => {
      if(local && localThemes.get(key) === local) local.savedAt = Date.now();
    }, (error) => {
      // not saved: the server's full is right
      if(localThemes.get(key) === local && !hasPlainEmoji(sending.shown)) localThemes.delete(key);
      options.onError(error);
    });
  };

  const sendLater = debounce(send, delay, false);

  return {
    /** A choice: it is held at once, and sent in `delay` ms unless another comes first */
    schedule(save: ShareThemeToSave) {
      pending = save;
      localThemes.set(key, {shown: save.shown, savedAt: 0});
      sendLater();
    },

    /** A choice that cannot be saved (a gift nothing names): an earlier one still waiting is outdated */
    cancel() {
      pending = undefined;
      sendLater.clearTimeout();
      const local = localThemes.get(key);
      if(local && !local.savedAt) localThemes.delete(key);
    },

    /** The screen goes away: what waits is sent now */
    flush: send,

    get hasPending() {
      return !!pending;
    }
  };
}
