import {getCurrentAccountFromURL} from '@lib/accounts/getCurrentAccountFromURL';
import {getSessionOf} from '@lib/accounts/bindManagersToAccount';
import {ActiveAccountNumber} from '@lib/accounts/types';

/**
 * One stretch of the tab showing one account, ended by the switch to another. What the screens of that
 * stretch still have going once it is over - an action that waited for the browser through the switch -
 * belongs to the account it was started on and is not carried on (see bindManagersToSession).
 */
export type AccountSession = {
  readonly accountNumber: ActiveAccountNumber,
  readonly ended: boolean
};

let current: ActiveAccountNumber;
let session: {accountNumber: ActiveAccountNumber, ended: boolean};

// * the account this tab shows: read from `?account=N` once, then changed only by switchAccount
export const getCurrentAccount = () => current ??= getCurrentAccountFromURL(window.location.href);

export function getAccountSession(): AccountSession {
  return session ??= {accountNumber: getCurrentAccount(), ended: false};
}

/** The account session `managers` are of, when they are a session's own (bindManagersToSession), or else the tab's now. */
export function getManagersSession(managers: object): AccountSession {
  return getSessionOf(managers) ?? getAccountSession();
}

export function setCurrentAccount(accountNumber: ActiveAccountNumber) {
  if(session) {
    session.ended = true;
    session = undefined;
  }

  current = accountNumber;
}

let switchingTo: ActiveAccountNumber;

/**
 * Whether `session` is over or on its way out - a switch from it to another account is under way: what it
 * was to open now would stand over the next account, so it is not opened.
 */
export function isSessionLeaving(session: AccountSession) {
  return session.ended || (switchingTo !== undefined && switchingTo !== session.accountNumber);
}

/**
 * The account a switch in place is on its way to, while one runs: until it is done the tab still shows
 * the current account, and whatever opens on it now is gone with the switch.
 */
export function getAccountSwitchingTo() {
  return switchingTo;
}

export function setAccountSwitchingTo(accountNumber: ActiveAccountNumber) {
  switchingTo = accountNumber;
}
