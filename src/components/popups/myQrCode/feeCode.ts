import {Accessor, createEffect, createMemo, createSignal, on, onCleanup, untrack} from 'solid-js';
import rootScope from '@lib/rootScope';
import {AppManagers} from '@lib/managers';
import type {LangPackKey} from '@lib/langPack';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {toastNew} from '@components/toast';
import {freeLink, isExpiring} from './link';
import {createCountdown} from './countdown';

export type FeeMode = 'fee' | 'temporary' | 'permanent';

type Code = {token: string, url?: string, expires?: number};

// as on Android: a temporary code is replaced every 30 s and 5 s before it expires, and a failed try is repeated later
const ROTATION_MS = 30_000;
const ROTATION_MARGIN = 5;
const ROTATION_RETRY_MS = 3000;

/**
 * The code that lets people who would pay to write to you write for free. The pill under the card shows its state:
 * the fee (no code), a temporary code, or a permanent one. A permanent code is kept across opens by the manager.
 *
 * Every change of the mode is a new `generation`: a code that comes back after one is dropped, a refresh that fails
 * leaves the code that was on screen, and the fee going to 0 while the screen is open takes the pill away.
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
  const [busy, setBusy] = createSignal(false);
  let generation = 0;
  // when the code on screen came, and when a replacement was last tried
  let codeTime = 0, lastTry = 0;

  const toast = (langPackKey: LangPackKey) => toastNew({langPackKey});
  const fail = () => toast('Error.AnError');

  const reset = (permanent?: Code) => {
    ++generation;
    setMode(permanent ? 'permanent' : 'fee');
    setCode(permanent);
  };

  const readFee = async() => {
    const settings = await managers.appPrivacyManager.getGlobalPrivacySettings();
    return Number(settings?.noncontact_peers_paid_stars || 0);
  };

  const applyFee = (stars: number) => {
    setFee(stars);
    if(!stars && untrack(mode) !== 'fee') reset();
  };

  if(enabled) {
    subscribeOn(rootScope)('global_privacy_update', (settings) => {
      applyFee(Number(settings?.noncontact_peers_paid_stars || 0));
    });

    // the mode comes back once both the fee and the kind of link are known
    createEffect(on(options.decided, async(decided) => {
      if(!decided) return;
      const started = generation;
      try {
        const [stars, kept] = await Promise.all([readFee(), managers.appUsersManager.getKeptNoPaidMessagesToken()]);
        if(started !== generation) return;
        setFee(stars);
        if(stars && kept?.permanent && !untrack(temporaryOnly)) reset({token: kept.token, url: kept.url});
      } catch{}
    }));
  }

  /** Asks for a code; what comes back is used only if nothing changed the mode meanwhile */
  const request = async(
    params: {revoke?: boolean, temporary?: boolean},
    next: {freshMode: boolean, toast: LangPackKey}
  ) => {
    if(busy()) return;
    const started = next.freshMode ? ++generation : generation;
    setBusy(true);
    try {
      const token = await managers.appUsersManager.exportNoPaidMessagesToken(params);
      if(started !== generation) return;
      setMode(token.expires ? 'temporary' : 'permanent');
      setCode({token: token.token, url: token.url, expires: token.expires});
      codeTime = Date.now();
      toast(next.toast);
    } catch{
      if(started === generation) fail();
    } finally {
      setBusy(false);
    }
  };

  const expires = createMemo(() => mode() === 'temporary' ? code()?.expires : undefined);
  const left = createCountdown(expires, () => {
    reset();
    toast('QRCode.NoPaid.Toast.Expired');
  });

  // a temporary code is replaced while it is shown; one that cannot be replaced runs out and the fee comes back
  createEffect(() => {
    if(mode() !== 'temporary') return;
    const timer = window.setInterval(async() => {
      const now = Date.now();
      const due = now - codeTime >= ROTATION_MS || (left() ?? Infinity) <= ROTATION_MARGIN;
      if(!due || busy() || now - lastTry < ROTATION_RETRY_MS) return;

      lastTry = now;
      const started = generation;
      try {
        const token = await managers.appUsersManager.exportNoPaidMessagesToken({temporary: true});
        if(started !== generation || !token.expires) return;
        setCode({token: token.token, url: token.url, expires: token.expires});
        codeTime = Date.now();
      } catch{}
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  return {
    fee,
    mode,
    busy,
    /** Seconds left to a temporary code */
    left,
    /** The pill shows while there is a fee to remove or a code to manage */
    visible: () => enabled && fee() > 0,
    isExpiring: () => mode() === 'temporary' && isExpiring(left()),
    canDisableTimer: () => !temporaryOnly(),
    /** The link for the code: the server's `url`; the plain one with `?free=` only for a kept code that lacks it */
    urlFor(plainUrl: string) {
      const current = code();
      if(!plainUrl || mode() === 'fee' || !current) return plainUrl;
      return current.url || freeLink(plainUrl, current.token);
    },
    removeFee: () => request({temporary: true}, {freshMode: true, toast: 'QRCode.NoPaid.Toast.Expires'}),
    resetCode: () => request(
      {revoke: true, temporary: mode() === 'temporary'},
      {freshMode: false, toast: 'QRCode.NoPaid.Toast.NewCode'}
    ),
    toggleTimer() {
      if(mode() === 'temporary') {
        return request({}, {freshMode: true, toast: 'QRCode.NoPaid.Toast.NoTimeLimit'});
      }

      return request({temporary: true}, {freshMode: true, toast: 'QRCode.NoPaid.Toast.Expires'});
    },
    restoreFee() {
      reset();
      // nothing is revoked, as on Android: the permanent token stays valid and kept, it just is not the mode
      managers.appUsersManager.setKeptNoPaidMessagesTokenPermanent(false).catch(() => {});
      toast('QRCode.NoPaid.Toast.FeeRestored');
    }
  };
}
