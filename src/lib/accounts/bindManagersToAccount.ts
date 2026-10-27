import type {ActiveAccountNumber} from '@lib/accounts/types';
import type {AccountSession} from '@lib/accounts/getCurrentAccount';
import type {AppManagers, TabManagers} from '@lib/managers';

// * kept free of imports but types: what ties managers to an account is read by the calls stack and the
// * base classes of the screens, which must not pull the worker bridge in with them
type Binder = {
  bind: (accountNumber: ActiveAccountNumber) => object,
  session: () => object,
  // * the session they are of, for a session's own
  of?: AccountSession
};

const binders: WeakMap<object, Binder> = new WeakMap();

/**
 * `managers` follow whichever account the tab shows, or are a session's own (see bindManagersToSession):
 * `bind` gives ones tied to a single account, `session` the ones of the account session the tab is in.
 */
export function registerAccountBinder(managers: object, binder: Binder) {
  binders.set(managers, binder);
}

/**
 * `managers` tied to `accountNumber` for good: the tab's own, which follow whichever account it shows,
 * and a session's are replaced; any others - already tied, or a test's - are kept as they are.
 */
export default function bindManagersToAccount(managers: TabManagers | AppManagers, accountNumber: ActiveAccountNumber): AppManagers;
export default function bindManagersToAccount<T extends object>(managers: T, accountNumber: ActiveAccountNumber): T;
export default function bindManagersToAccount(managers: object, accountNumber: ActiveAccountNumber) {
  return (managers && binders.get(managers)?.bind(accountNumber)) || managers;
}

/**
 * `managers` of the account session the tab is in now. They are tied to its account and done with it:
 * once the tab has switched to another account a call through them is not sent, and a result still on
 * its way is dropped - both rejected as MIDDLEWARE - so what the previous account's screens still have
 * going stops at its next manager call instead of reaching the account shown now.
 *
 * Whatever lives in one account session takes these: the screens get them from their base classes, and
 * a function that awaits reads its managers once, before the first await (the lint rule
 * `tweb/managers-before-await`). The tab's own managers, which follow whichever account it shows, become
 * the current session's; a session's own, and any others - tied to an account for good (a call's), a
 * test's - are kept as they are.
 */
export function bindManagersToSession(managers: TabManagers | AppManagers): AppManagers;
export function bindManagersToSession<T extends object>(managers: T): T;
export function bindManagersToSession(managers: object) {
  return (managers && binders.get(managers)?.session()) || managers;
}

/** The account session `managers` are of, when they are a session's (see bindManagersToSession). */
export function getSessionOf(managers: object): AccountSession {
  return managers && binders.get(managers)?.of;
}
