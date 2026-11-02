/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {WalletStatus} from '@appManagers/appWalletManager';
import {i18n} from '@lib/langPack';
import type {FormatterArguments, LangPackKey} from '@lib/langPack';
import WalletVault, {WalletCustodyRecord} from '@lib/wallet/vault';
import bytesToHex from '@helpers/bytes/bytesToHex';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';
import {isRecordSigningFor} from '@lib/wallet/rotation';

/**
 * What logging out destroys of the wallet keys on this device: the vault goes with the account (apiManager's logOut).
 * tdesktop warns in the logout confirmation (WalletLossOnLogout, WalletLossWarning); the same terms here, read from
 * the vault in the tab — the engine is never loaded for it.
 */

export type WalletLoss = {
  /** keys of the served wallet that Telegram's backup does not hold */
  unbacked: number,
  /** keys of other wallets */
  parked: number,
  /** new phrases of key updates the chain has not settled */
  rotating: number,
  /** keys whose wallet is not known: the device has them, the served wallet is not known */
  unknown: boolean
};

/**
 * `current` is the device's key, `parked` the others; only records whose secret is still on the device. The status
 * is the server's word on the account's wallet, if it is known.
 */
export function getWalletLoss(current: WalletCustodyRecord | undefined, parked: WalletCustodyRecord[], status?: WalletStatus): WalletLoss {
  const loss: WalletLoss = {unbacked: 0, parked: 0, rotating: 0, unknown: false};
  const state = status?.presence === 'ready' ? status.state : undefined;
  const servedAddress = state ? canonicalTonAddress(state.address) : '';
  const known = !!servedAddress;
  const servedKey = known ? bytesToHex(state.public_key) : '';
  const backed = known && !!state.pFlags.backup_enabled;
  const seen = new Set<string>();
  for(const record of [current, ...parked]) {
    if(!record || seen.has(record.recordId)) continue;
    seen.add(record.recordId);

    if(record.pendingRotation) {
      ++loss.rotating;
    }

    const sameWallet = known && canonicalTonAddress(record.address) === servedAddress;
    const active = known ? sameWallet && isRecordSigningFor(record, servedKey) : record === current;
    // * an older phrase of the served wallet: the key it held was replaced, nothing is lost with it
    const obsolete = sameWallet && !active && !!record.signingKey;
    if(known ? !sameWallet : !active) {
      ++loss.parked;
    } else if(!known) {
      loss.unknown = true;
    } else if(!obsolete && (!backed || record.rotatedSinceBackup)) {
      ++loss.unbacked;
    }
  }

  return loss;
}

/** The paragraphs that say it, in tdesktop's order; none when nothing is lost */
export function getWalletLossWarnings(loss: WalletLoss): Array<[LangPackKey, FormatterArguments?]> {
  const out: Array<[LangPackKey, FormatterArguments?]> = [];
  if(loss.unbacked) out.push(['Wallet.Logout.Local', [loss.unbacked]]);
  if(loss.parked) out.push(['Wallet.Logout.Parked', [loss.parked]]);
  if(loss.rotating) out.push(['Wallet.Logout.Rotating', [loss.rotating]]);
  if(loss.unknown) out.push(['Wallet.Logout.Unknown']);
  return out;
}

/**
 * Reads what the vault of `userId` holds. A vault that cannot be read may hold keys all the same: then the loss is
 * unknown. `getStatus` is asked only when there is something to lose.
 */
export async function readWalletLoss(
  userId: UserId,
  getStatus: () => Promise<WalletStatus | undefined>,
  options: {
    /** only the device's own key goes (Forget Key): the old wallets' keys stay */
    currentOnly?: boolean
  } = {}
): Promise<WalletLoss> {
  const vault = new WalletVault(userId);
  let current: WalletCustodyRecord, parked: WalletCustodyRecord[];
  try {
    const [stored, storedParked] = await Promise.all([vault.getCustody(), vault.getParkedCustody()]);
    const withSecret = async(record: WalletCustodyRecord) => {
      if(!record || !(await vault.hasSecret(record.secretRef))) {
        return;
      }

      // * a key update whose new phrase is gone has nothing left to lose
      if(record.pendingRotation && !(await vault.hasSecret(record.pendingRotation.secretRef))) {
        return {...record, pendingRotation: undefined};
      }

      return record;
    };

    current = await withSecret(stored);
    parked = options.currentOnly ? [] : (await Promise.all(storedParked.map(withSecret))).filter(Boolean);
  } catch(err) {
    return {unbacked: 0, parked: 0, rotating: 0, unknown: true};
  }

  if(!current && !parked.length) {
    return getWalletLoss(undefined, []);
  }

  const status = await getStatus().catch((): WalletStatus => undefined);
  return getWalletLoss(current, parked, status);
}

/**
 * A question's text with what it would destroy of the wallet keys after it, as the logout confirmation says it;
 * nothing when nothing is lost
 */
export function describeWalletLoss(base: LangPackKey, loss: WalletLoss) {
  const warnings = getWalletLossWarnings(loss);
  if(!warnings.length) {
    return;
  }

  const description = document.createDocumentFragment();
  description.append(i18n(base));
  warnings.forEach(([key, args]) => description.append('\n\n', i18n(key, args)));
  return description;
}
