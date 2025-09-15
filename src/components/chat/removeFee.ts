import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {AppManagers} from '../../lib/appManagers/managers';
import callbackify from '../../helpers/callbackify';
import {i18n} from '../../lib/langPack';

import confirmationPopup from '../confirmationPopup';
import wrapPeerTitle from '../wrappers/peerTitle';
import PeerTitle from '../peerTitle';
import Button from '../button';
import Icon from '../icon';

import PinnedContainer from './pinnedContainer';
import type ChatTopbar from './topbar';
import Chat from './chat';

import styles from './removeFee.module.scss';


export default class ChatRemoveFee extends PinnedContainer {
  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'remove-fee',
      onClose: () => {},
      floating: true,
      height: 64
    });
  }

  public hide() {
    this.toggle(true);
    this.wrapper.replaceChildren();
  }

  private hideCallback() {
    return () => {
      this.hide();
    };
  }

  private set(peerId: PeerId, starsCharged: number) {
    this.toggle(false);

    const content = document.createElement('div');
    content.classList.add(styles.Content);

    const inlineStars = document.createElement('span');
    inlineStars.classList.add('inline-stars', 'inline-stars--reversed');
    inlineStars.append(
      numberThousandSplitterForStars(+starsCharged),
      Icon('star')
    );

    const peerTitle = new PeerTitle();
    peerTitle.update({peerId, onlyFirstName: true});

    content.append(i18n('PaidMessages.UserPaysForMessagesNotice', [peerTitle.element, inlineStars]));

    const button = Button(`btn primary ${styles.RemoveFeeButton}`, {text: 'PaidMessages.RemoveFee'})
    content.append(button);

    let disabled = false;

    attachClickEvent(button, () => {
      if(disabled) return;
      disabled = true;

      this.openRemoveFeeModal(peerId).finally(() => {
        disabled = false;
      });
    });

    this.container.replaceChildren(content);
  }

  public async setPeerId(peerId: PeerId) {
    if(!peerId.isUser()) return {
      cached: true,
      result: Promise.resolve(this.hideCallback())
    };

    const ackedFullUser = await this.chat.managers.acknowledged.appProfileManager.getProfile(peerId.toUserId());

    return {
      cached: ackedFullUser.cached,
      result: callbackify(ackedFullUser.result, (fullUser) => {
        const starsCharged = +fullUser?.settings?.charge_paid_message_stars;
        if(!starsCharged) return this.hideCallback();
        return (): void => void this.set(peerId, starsCharged);
      })
    };
  }

  private async openRemoveFeeModal(peerId: PeerId) {
    try {
      await openRemoveFeePopup({peerId, managers: this.managers})
      this.hide();
    } catch{}
  }
}

type OpenRemoveFeePopupArgs = {
  peerId: PeerId;
  parentPeerId?: PeerId;
  requirePayment?: boolean;
  managers: AppManagers;
};

export async function openRemoveFeePopup({peerId, parentPeerId, managers, requirePayment}: OpenRemoveFeePopupArgs) {
  const userId = peerId.toUserId();
  const revenue = !requirePayment ? await managers.appUsersManager.getPaidMessagesRevenue({userId, parentPeerId}) : undefined;

  const shouldRefund = await confirmationPopup({
    className: styles.ConfirmationPopup,
    titleLangKey: requirePayment ? 'PaidMessages.ChargeFee' : 'PaidMessages.RemoveFee',
    descriptionLangKey: requirePayment ? 'PaidMessages.ChargeFeeWarning' : 'PaidMessages.RemoveFeeWarning',
    descriptionLangArgs: [await wrapPeerTitle({peerId, onlyFirstName: true})],
    checkbox: revenue ? {
      text: 'PaidMessages.RemoveFeeRefund',
      textArgs: [i18n('Stars', [revenue])]
    } : undefined,
    button: {
      langKey: 'Confirm'
    }
  });

  await managers.appUsersManager.toggleNoPaidMessagesException({userId, refundCharged: shouldRefund, parentPeerId, requirePayment});
}
