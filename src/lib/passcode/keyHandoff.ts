import {IS_WORKER} from '@helpers/context';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import sessionStorage from '@lib/sessionStorage';


/**
 * Carries the passcode-derived key across the reload an account switch (or a log out
 * with several accounts) performs, so the user is not asked for the passcode again in
 * the middle of the flow.
 *
 * It lives in `window.sessionStorage`, NOT in the localStorage-backed `sessionStorage`
 * controller: this key decrypts `localStorage__encrypted`, which holds every account's
 * MTProto auth keys, so writing it to disk would hand the whole passcode-protected
 * store to anyone able to read the browser profile — precisely the adversary the
 * passcode exists to stop. `window.sessionStorage` is tab-scoped and dies with the tab,
 * so a switch interrupted by a crash or a closed tab cannot leave the key behind.
 */
const HANDOFF_KEY = 'encryption_key_handoff';

// Only reachable in a window realm; the worker routes here over MTProtoMessagePort.
export function writeEncryptionKeyHandoff(base64Key: string) {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, base64Key);
  } catch(err) {
    // storage can be unavailable (private mode, storage disabled) — the user just
    // gets the passcode prompt after the reload, which fails closed
  }
}

export async function saveEncryptionKeyForHandoff() {
  const base64Key = await EncryptionKeyStore.getAsBase64();
  if(!base64Key) {
    return;
  }

  if(IS_WORKER) {
    await MTProtoMessagePort.getInstance<false>().invoke('passcodeKeyHandoff', base64Key);
    return;
  }

  writeEncryptionKeyHandoff(base64Key);
}

export function takeEncryptionKeyHandoff() {
  let base64Key: string;
  try {
    base64Key = window.sessionStorage.getItem(HANDOFF_KEY);
    window.sessionStorage.removeItem(HANDOFF_KEY);
  } catch(err) {}

  // Builds before this fix persisted the key to localStorage; drop whatever they left
  // on disk, otherwise it stays there decrypting the store forever. This runs on every
  // startup, so swallow the rejection storage-offline (private mode) would produce.
  sessionStorage.delete('encryption_key').catch(() => {});

  return base64Key;
}
