import callbackify from '../../helpers/callbackify';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import namedPromises from '../../helpers/namedPromises';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import {AppManagers} from '../../lib/appManagers/managers';
import {i18n} from '../../lib/langPack';
import Button from '../button';
import confirmationPopup from '../confirmationPopup';
import Icon from '../icon';
import PeerTitle from '../peerTitle';
import wrapPeerTitle from '../wrappers/peerTitle';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import styles from './removeFee.module.scss';
import type ChatTopbar from './topbar';


type SetArgs = {
  peerId: PeerId;
  monoforumThreadId?: PeerId;
  starsCharged: number;
};

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

  private set({peerId, monoforumThreadId, starsCharged}: SetArgs) {
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
    peerTitle.update({peerId: monoforumThreadId || peerId, onlyFirstName: true});

    content.append(i18n('PaidMessages.UserPaysForMessagesNotice', [peerTitle.element, inlineStars]));

    const button = Button(`btn primary ${styles.RemoveFeeButton}`, {text: 'PaidMessages.RemoveFee'})
    content.append(button);

    let disabled = false;

    attachClickEvent(button, async() => {
      if(disabled) return;
      disabled = true;

      try {
        await openRemoveFeePopup({
          parentPeerId: monoforumThreadId ? peerId : undefined,
          peerId: monoforumThreadId || peerId,
          managers: this.chat.managers
        });
        this.hide();
      } finally {
        disabled = false;
      }
    });

    this.container.replaceChildren(content);
  }

  public async setPeerId(peerId: PeerId) {
    if(this.chat.isMonoforum && this.chat.canManageDirectMessages && this.chat.monoforumThreadId) {
      const {ackedChat, ackedDialog} = await namedPromises({
        ackedChat: this.chat.managers.acknowledged.appChatsManager.getChat(peerId.toChatId()),
        ackedDialog: this.chat.managers.acknowledged.monoforumDialogsStorage.getDialogByParent(peerId, this.chat.monoforumThreadId)
      });

      return {
        cached: ackedChat.cached && ackedDialog.cached,
        result: callbackify(Promise.all([ackedChat.result, ackedDialog.result]), ([chat, dialog]) => {
          const starsCharged = chat?._ === 'channel' && +chat.send_paid_messages_stars;
          if(!starsCharged || dialog?.pFlags?.nopaid_messages_exception) return this.hideCallback();
          return (): void => void this.set({peerId, starsCharged, monoforumThreadId: this.chat.monoforumThreadId});
        })
      };
    }

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
        return (): void => void this.set({peerId, starsCharged});
      })
    };
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
