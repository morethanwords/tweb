import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import {AppManagers} from '@lib/managers';
import pause from '@helpers/schedulers/pause';
import noop from '@helpers/noop';

/** how long the confirmation waits for the server's word on the wallet before it goes with the last one it had */
const WALLET_STATUS_WAIT = 1500;

/**
 * What logging out destroys of the wallet keys on this device, as tdesktop says it in the same confirmation; nothing
 * when there are none. The vault is read in the tab: the wallet's engine is never loaded for it.
 */
async function readLogoutDescription(managers: AppManagers, userId: UserId) {
  const wallet = managers.appWalletManager;
  const {readWalletLoss, describeWalletLoss} = await import('@lib/wallet/logoutLoss');
  const loss = await readWalletLoss(userId, () => Promise.race([
    wallet.getStatus(),
    pause(WALLET_STATUS_WAIT).then(() => wallet.getCachedStatus())
  ]));

  return describeWalletLoss('LogOut.Description', loss);
}

export default async function showLogOutPopup() {
  const managers = bindManagersToSession(rootScope.managers);
  const userId = rootScope.myId.toUserId();
  const description = await readLogoutDescription(managers, userId).catch((): DocumentFragment => undefined);
  // * the account switched while the vault was read: this account's confirmation does not open over the next one
  if(isSessionLeaving(getManagersSession(managers))) return;

  confirmationPopup({
    titleLangKey: 'LogOut',
    descriptionLangKey: description ? undefined : 'LogOut.Description',
    description,
    button: {
      langKey: 'LogOut',
      isDanger: true
    }
  }).then(() => {
    managers.apiManager.logOut();
  }, noop);
}
