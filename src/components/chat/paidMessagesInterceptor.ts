import {SEND_PAID_WITH_STARS_DELAY} from '../../lib/mtproto/mtproto_config';
import type {AppManagers} from '../../lib/appManagers/managers';
import useStars, {setReservedStars} from '../../stores/stars';
import {i18n} from '../../lib/langPack';

import confirmationPopup from '../confirmationPopup';
import wrapPeerTitle from '../wrappers/peerTitle';
import PopupStars from '../popups/stars';
import PopupElement from '../popups';

import showUndoablePaidTooltip, {paidMessagesLangKeys} from './undoablePaidTooltip';
import createPendingUndoableMessage from './pendingUndoableMessage';
import type Chat from './chat';


type PassedDownArgs = {
  peerId: PeerId;
  messageCount: number;
  starsAmount: number;
};

export const PAYMENT_REJECTED = Symbol('Payment rejected');

export default class PaidMessagesInterceptor {
  private pendingUndoableMessage = createPendingUndoableMessage();
  private rawStars = useStars();

  constructor(private chat: Chat, private managers: AppManagers) {}

  public dispose() {
    this.pendingUndoableMessage.dispose();
  }

  private get starsBalance() {
    return +this.rawStars();
  }

  /**
   * The starsAmount better be provided by this interceptor and then passed manually to the send method
   * to make sure we don't accidentally send stars in a case that might have not been handled
   *
   * @returns undefined if no stars are needed, or a PAYMENT_REJECTED symbol if the users cancels the payment / doesn't have enough balance
   */
  public async prepareStarsForPayment(messageCount: number): Promise<number | typeof PAYMENT_REJECTED | undefined> {
    const {peerId, starsAmount} = this.chat

    if(!starsAmount) return;

    const totalStarsAmount = messageCount * starsAmount;

    if(this.starsBalance < totalStarsAmount) {
      this.pendingUndoableMessage.abort();
      PopupElement.createPopup(PopupStars);
      return PAYMENT_REJECTED;
    }

    const wantsToPay = await this.checkIfUserReallyWantsToPay({peerId, messageCount, starsAmount});
    if(!wantsToPay) return PAYMENT_REJECTED;

    setReservedStars(prev => prev + totalStarsAmount);
    this.pendingUndoableMessage.setReserved(prev => prev + totalStarsAmount);

    this.triggerUndoableMessages({peerId, messageCount, starsAmount});

    return starsAmount;
  }

  private async checkIfUserReallyWantsToPay({peerId, messageCount, starsAmount}: PassedDownArgs) {
    const totalStarsAmount = starsAmount * messageCount;

    const {dontShowPaidMessageWarningFor = []} = await this.managers.appStateManager.getState();
    const shouldShowWarning = !dontShowPaidMessageWarningFor?.includes(peerId);

    if(!shouldShowWarning) return true;

    try
    {
      const dontShowAgain = await confirmationPopup({
        titleLangKey: 'ConfirmPayment',
        descriptionLangKey: messageCount > 1 ?
          'PaidMessages.UserChargesForMultipleMessageWarning' :
          'PaidMessages.UserChargesForOneMessageWarning',
        descriptionLangArgs: [
          await wrapPeerTitle({peerId, onlyFirstName: true}),
          i18n('Stars', [starsAmount]),
          i18n('Stars', [totalStarsAmount]),
          ...(messageCount > 1 ? [messageCount] : [])
        ],
        checkbox: {
          text: 'DontAskAgain'
        },
        button: {
          langKey: 'PaidMessages.PayForMessages',
          langArgs: [messageCount]
        }
      });

      if(dontShowAgain)
        this.managers.appStateManager.setByKey(
          'dontShowPaidMessageWarningFor',
          [...dontShowPaidMessageWarningFor, peerId]
        );
    }
    catch
    {
      return false;
    }

    return true;
  }

  private triggerUndoableMessages({peerId, messageCount, starsAmount}: PassedDownArgs) {
    this.pendingUndoableMessage.setMessageCount(prev => prev + messageCount);
    this.pendingUndoableMessage.setSendTime(Date.now() + SEND_PAID_WITH_STARS_DELAY);

    if(!this.pendingUndoableMessage.timeoutId) {
      showUndoablePaidTooltip({
        sendTime: this.pendingUndoableMessage.sendTime,
        titleCount: this.pendingUndoableMessage.messageCount,
        subtitleCount: () => this.pendingUndoableMessage.messageCount() * starsAmount,
        onUndo: () => void this.pendingUndoableMessage.abort(),
        ...paidMessagesLangKeys
      });
    }

    this.pendingUndoableMessage.softReset();

    this.pendingUndoableMessage.signal.addEventListener('abort', () => {
      this.managers.appMessagesManager.cancelQueuedPaidMessages(peerId);
      this.pendingUndoableMessage.reset();
    });

    this.pendingUndoableMessage.timeoutId = self.setTimeout(() => {
      this.managers.appMessagesManager.sendQueuedPaidMessages(peerId);
      this.pendingUndoableMessage.reset();
    }, SEND_PAID_WITH_STARS_DELAY);
  }
}
