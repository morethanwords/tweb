import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';

/*
 * Copying the ways to reach a peer — its username, its t.me link, a phone number — each with the
 * toast that says what went to the clipboard.
 */

export const T_ME = 'https://t.me/';

/** As `@username`. */
export function copyUsername(username: string) {
  copyTextToClipboard('@' + username);
  toastNew({langPackKey: 'UsernameCopied'});
}

/** `https://t.me/` and the path — a username, or a `+phone`. */
export function copyTmeLink(path: string) {
  copyTextToClipboard(T_ME + path);
  toastNew({langPackKey: 'LinkCopied'});
}

/** Without the spaces it is shown with, so it pastes as one number. */
export function copyPhoneNumber(phone: string) {
  copyTextToClipboard(phone.replace(/\s/g, ''));
  toastNew({langPackKey: 'PhoneCopied'});
}
