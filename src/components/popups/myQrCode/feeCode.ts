import {Accessor, batch, createEffect, createMemo, createSignal, on, onCleanup, untrack} from 'solid-js';
import rootScope from '@lib/rootScope';
import {AppManagers} from '@lib/managers';
import type {LangPackKey} from '@lib/langPack';
import tsNow from '@helpers/tsNow';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {toastNew} from '@components/toast';
import {freeLink, isExpiring} from './link';
import {createCountdown} from './countdown';

export type FeeMode = 'fee' | 'temporary' | 'permanent';

type Code = {token: string, url?: string, expires?: number};
type AskParams = {revoke?: boolean, temporary: boolean};
// `startsMinute`: the ask of a choice that starts a new minute on the timer (the first code, the timer on, a reset);
// its code starts it, and no other one does. `replacement`: the timer's own ask, not the user's
type Ask = {params: AskParams, startsMinute?: boolean, replacement?: boolean};

// as on Android (`QrShareView.FREE_MS`): a code on the timer keeps messages free for a minute from when it comes
export const FREE_SECONDS = 60;
// `QrShareServer`: a temporary code is replaced every 30 s, and 5 s before it expires; a replacement that fails is tried
// again a while later, and says nothing (the code on screen stays)
const ROTATION_MS = 30_000;
const ROTATION_MARGIN = 5;
const ROTATION_RETRY_MS = 3000;

/**
 * The code that lets people who would pay to write to you write for free, as `QrShareServer` keeps it. The pill under
 * the card shows the mode: the fee (no code), a code on a timer, or a permanent one, kept across opens by the manager.
 *
 * A choice shows at once and the code it needs comes after: until then the code on screen stays. The timer is the
 * client's: its minute starts when the first code comes, a replacement every 30 s does not move it, and at its end the
 * fee is back.
 */
export default function createFeeCode(options: {
  managers: AppManagers,
  enabled: boolean,
  /** A contact link cannot carry a permanent code */
  temporaryOnly: Accessor<boolean>,
  /** The link is chosen: only then the kept code is looked at */
  decided: Accessor<boolean>
}) {
  const {managers, enabled, temporaryOnly} = options;
  const [fee, setFee] = createSignal(0);
  const [mode, setMode] = createSignal<FeeMode>('fee');
  const [code, setCode] = createSignal<Code>();
  // the end of the free minute (unix seconds); none while the code that starts it is on its way
  const [freeUntil, setFreeUntil] = createSignal<number>();
  // one ask at a time: `QrShareServer` cancels the one on its way, and as an ask sent cannot be taken back here, a newer
  // one waits for it instead - the newest of those waiting goes next. What an ask brings back is the server's code by
  // then, so it counts even when a newer ask waits: no revoke goes by unseen, and the code on screen is a live one.
  let running = false, waiting: Ask | undefined, generation = 0;
  // the screen has gone: what waits is not sent, and what comes back changes nothing (the manager keeps its code)
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    waiting = undefined;
  });
  // the last code the server gave, of either kind, and when; and the end of the minute of the code on the timer on
  // screen, kept for when an ask after it fails and it stays
  let token: Code | undefined, tokenTime = 0, codeUntil: number | undefined, lastTry = 0;

  const toast = (langPackKey: LangPackKey) => toastNew({langPackKey});

  const readFee = async() => {
    const settings = await managers.appPrivacyManager.getGlobalPrivacySettings();
    return Number(settings?.noncontact_peers_paid_stars || 0);
  };

  /** The fee is back: nothing is revoked, as on Android - temporary codes die by themselves, a permanent one stays kept */
  const backToFee = (toastKey?: LangPackKey) => {
    ++generation;
    waiting = undefined;
    codeUntil = undefined;
    batch(() => {
      setMode('fee');
      setCode(undefined);
      setFreeUntil(undefined);
    });
    managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent(false).catch(() => {});
    if(toastKey) toast(toastKey);
  };

  /** A new minute, which starts when the code it waits for comes */
  const startTimerWait = () => setFreeUntil(undefined);

  /** A code has come: it is the server's last, and it shows if the mode on screen is of its kind */
  const take = (result: Code, {params, startsMinute}: Ask) => {
    token = result;
    tokenTime = Date.now();
    const current = untrack(mode);
    if(current === 'fee' || params.temporary !== (current === 'temporary')) {
      // a revoke has killed the code still on screen, whatever the mode on screen by now
      if(params.revoke && untrack(code) !== result) {
        codeUntil = undefined;
        setCode(undefined);
      }

      return;
    }

    batch(() => {
      setCode(result);
      if(!params.temporary) codeUntil = undefined;
      else if(startsMinute) setFreeUntil(codeUntil = tsNow(true) + FREE_SECONDS);
    });
  };

  /** The ask has failed with none after it: the code on screen stays if it is of the kind asked for, else the fee is back */
  const fail = ({params, replacement}: Ask) => {
    const shown = untrack(code);
    // a replacement that failed leaves the code on screen as it was, to be tried again
    if(replacement && shown?.expires) return;
    if(!shown || !!shown.expires !== params.temporary) {
      backToFee('Error.AnError');
      return;
    }

    if(params.temporary && untrack(freeUntil) === undefined) {
      // a code on the timer with no minute of its own to go back to is not one to keep showing
      if(codeUntil === undefined) {
        backToFee('Error.AnError');
        return;
      }

      setFreeUntil(codeUntil);
    }

    toast('Error.AnError');
  };

  const run = async(ask: Ask) => {
    running = true;
    const started = generation;
    try {
      const result = await managers.appUsersManager.exportNoPaidMessagesToken(ask.params);
      if(!disposed) take({token: result.token, url: result.url, expires: result.expires}, ask);
    } catch{
      // a newer ask waits, or the fee is back: theirs to decide
      if(!disposed && !waiting && started === generation) fail(ask);
    } finally {
      running = false;
      const next = waiting;
      waiting = undefined;
      if(next) run(next);
    }
  };

  /** Asks for a code of the mode on screen, now or once the ask on its way has come back; a newer choice outdates an older */
  const request = (params: AskParams, startsMinute?: boolean, replacement?: boolean) => {
    ++generation;
    const ask = {params, startsMinute, replacement};
    if(running) waiting = ask;
    else run(ask);
  };

  const applyFee = (stars: number) => {
    setFee(stars);
    if(!stars && untrack(mode) !== 'fee') backToFee();
  };

  if(enabled) {
    subscribeOn(rootScope)('global_privacy_update', (settings) => {
      applyFee(Number(settings?.noncontact_peers_paid_stars || 0));
    });

    // the mode comes back once both the fee and the kind of link are known: a permanent code is shown at once from
    // what is kept, and asked for again
    createEffect(on(options.decided, async(decided) => {
      if(!decided) return;
      const started = generation;
      try {
        const [stars, kept] = await Promise.all([readFee(), managers.appUsersManager.getKeptNoPaidMessagesToken()]);
        if(started !== generation) return;
        setFee(stars);
        if(!stars || !kept?.permanent || untrack(temporaryOnly)) return;
        token = {token: kept.token, url: kept.url};
        batch(() => {
          setMode('permanent');
          setCode(token);
        });
        request({temporary: false});
      } catch{}
    }));
  }

  const countdown = createCountdown(freeUntil, () => {
    if(untrack(mode) === 'temporary') backToFee('QRCode.NoPaid.Toast.Expired');
  });
  /** Seconds left to the free minute: all of it while its code is on the way */
  const left = () => mode() !== 'temporary' ? undefined : freeUntil() === undefined ? FREE_SECONDS : countdown();

  // a code on the timer is replaced while it is shown, unless an ask is on its way already; one the server's time has
  // run out for, its replacements failing, is no code to show: the fee is back
  createEffect(() => {
    if(mode() !== 'temporary') return;
    const timer = window.setInterval(() => {
      const shown = untrack(code);
      if(shown?.expires && tsNow(true) >= shown.expires) {
        backToFee('QRCode.NoPaid.Toast.Expired');
        return;
      }

      const now = Date.now();
      if(running || now - lastTry < ROTATION_RETRY_MS) return;
      const due = !token || now - tokenTime >= ROTATION_MS || (!!token.expires && tsNow(true) >= token.expires - ROTATION_MARGIN);
      if(!due) return;
      lastTry = now;
      request({temporary: true}, false, true);
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  return {
    fee,
    mode,
    /** Seconds left to the free minute of a code on the timer */
    left,
    /** When the free minute ends (unix seconds), once its code has come */
    expires: createMemo(() => mode() === 'temporary' ? freeUntil() : undefined),
    /** The pill shows while there is a fee to remove or a code to manage */
    visible: () => enabled && fee() > 0,
    /** The code the mode asks for has not come yet: what is on screen is not one to hand out */
    pending: () => {
      const current = code();
      return mode() !== 'fee' && (!current || !!current.expires !== (mode() === 'temporary'));
    },
    isExpiring: () => mode() === 'temporary' && isExpiring(left()),
    canDisableTimer: () => !temporaryOnly(),
    /** The link for the code: the server's `url`; the plain one with `?free=` only for a kept code that lacks it */
    urlFor(plainUrl: string) {
      const current = code();
      if(!plainUrl || mode() === 'fee' || !current) return plainUrl;
      return current.url || freeLink(plainUrl, current.token);
    },
    /** The first free code is always one on the timer; the fee's code stays on screen until it comes */
    removeFee() {
      codeUntil = undefined;
      // a permanent code kept from before is not the mode now
      managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent(false).catch(() => {});
      batch(() => {
        setMode('temporary');
        setCode(undefined);
        startTimerWait();
      });
      toast('QRCode.NoPaid.Toast.Expires');
      request({temporary: true}, true);
    },
    /** Every code is revoked and a new one of the same kind comes; on the timer, its minute starts anew */
    resetCode() {
      const temporary = mode() === 'temporary';
      if(temporary) startTimerWait();
      toast(temporary ? 'QRCode.NoPaid.Toast.Expires' : 'QRCode.NoPaid.Toast.NewCode');
      request({revoke: true, temporary}, temporary);
    },
    toggleTimer() {
      if(mode() === 'temporary') {
        // the mode is kept as it is chosen, as Android does; a kept permanent code is shown until the one asked for comes
        managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent(true).catch(() => {});
        batch(() => {
          setMode('permanent');
          setFreeUntil(undefined);
          if(token && !token.expires) setCode(token);
        });
        toast('QRCode.NoPaid.Toast.NoTimeLimit');
        request({temporary: false});
        return;
      }

      batch(() => {
        setMode('temporary');
        startTimerWait();
      });
      managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent(false).catch(() => {});
      toast('QRCode.NoPaid.Toast.Expires');
      request({temporary: true}, true);
    },
    restoreFee: () => backToFee('QRCode.NoPaid.Toast.FeeRestored')
  };
}
