import {createMemo, createSignal, onCleanup} from 'solid-js';
import {User} from '@layer';
import {AppManagers} from '@lib/managers';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {buildTelegramUserQrUrl} from '@helpers/qrCode/paintQrCode';
import {toastNew} from '@components/toast';
import {Caption} from './caption';
import {createCountdown} from './countdown';
import createFeeCode from './feeCode';
import {buildPhoneUrl, chooseOwnLink, isExpiring, OwnLinkKind} from './link';

const RETRY_MS = 3000;

/**
 * What the code carries and what stands under it: the username, else the phone, else a temporary contact link that
 * counts down and is made anew at zero. For the own profile; another peer's link is a plain one.
 */
export default function createQrLink(options: {
  managers: AppManagers,
  peer: User.user,
  /** Only the own profile has these links and a fee code */
  enabled: boolean
}) {
  const {managers, peer, enabled} = options;

  const username = enabled ? getPeerActiveUsernames(peer)[0] : undefined;
  const [kind, setKind] = createSignal<OwnLinkKind | undefined>(username ? 'username' : undefined);
  const [contact, setContact] = createSignal<{url: string, expires: number}>();
  const temporaryOnly = () => kind() === 'contact';

  let retryTimer: number;
  onCleanup(() => clearTimeout(retryTimer));

  // a failed refresh keeps the link on screen; the next try is a moment later
  const exportContact = async() => {
    try {
      const token = await managers.appUsersManager.exportContactToken();
      setContact({url: token.url, expires: token.expires});
      return true;
    } catch{
      retryTimer = window.setTimeout(exportContact, RETRY_MS);
      return false;
    }
  };

  if(enabled && !username) {
    (async() => {
      let chosen: OwnLinkKind = peer.phone ? 'phone' : 'contact';
      try {
        const [phoneRules, addedByPhoneRules] = await Promise.all([
          managers.appPrivacyManager.getPrivacy('inputPrivacyKeyPhoneNumber'),
          managers.appPrivacyManager.getPrivacy('inputPrivacyKeyAddedByPhone')
        ]);
        chosen = chooseOwnLink({phone: peer.phone, phoneRules, addedByPhoneRules});
      } catch{}

      if(chosen === 'contact') await exportContact();
      setKind(chosen);
    })();
  }

  const left = createCountdown(
    () => kind() === 'contact' ? contact()?.expires : undefined,
    () => { exportContact(); }
  );

  const fee = createFeeCode({managers, enabled, temporaryOnly, decided: () => kind() !== undefined});

  /** The link without any code on it; empty while it is still being chosen */
  const plainUrl = createMemo(() => {
    switch(kind()) {
      case 'username': return buildTelegramUserQrUrl(username);
      case 'phone': return buildPhoneUrl(peer.phone ?? '');
      case 'contact': return contact()?.url ?? '';
      default: return '';
    }
  });

  const url = createMemo(() => fee.urlFor(plainUrl()));

  const caption = createMemo<Caption | undefined>(() => {
    switch(kind()) {
      case 'username': return {text: '@' + username.toUpperCase(), kind: 'username'};
      case 'phone': return {text: '+' + peer.phone, kind: 'phone'};
      // a contact link has no caption: the card is a square, and the time left stands in a pill under it (as on Android)
    }
  });

  const linkExpiring = () => kind() === 'contact' && isExpiring(left());

  return {
    enabled,
    kind,
    fee,
    url,
    plainUrl,
    /** Seconds left to the contact link; the pill under the square card counts them */
    left,
    caption,
    /** Whether the code on screen ends within the cutoff: a copy, share or save would carry a dead link */
    isExpiring: () => linkExpiring() || fee.isExpiring(),
    /** For export: true when it may go on; else tells why not and refuses */
    guardExport() {
      if(fee.isExpiring()) {
        toastNew({langPackKey: 'QRCode.NoPaid.Toast.Expiring'});
        return false;
      }

      if(linkExpiring()) {
        toastNew({langPackKey: 'QRCode.LinkExpiring'});
        return false;
      }

      return true;
    }
  };
}
