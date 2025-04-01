import {SEND_PAID_WITH_STARS_DELAY} from '../../lib/mtproto/mtproto_config';
import type {AppManagers} from '../../lib/appManagers/managers';
import useStars, {setReservedStars} from '../../stores/stars';
import {MOUNT_CLASS_TO} from '../../config/debug';
import rootScope from '../../lib/rootScope';
import {i18n} from '../../lib/langPack';
import noop from '../../helpers/noop';

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

enum UserConfirmationResult {
  /**
   * In case 'Don't show again' was checked previously
   */
  Skipped,

  Confirmed,
  Rejected
};

export type ConfirmedPaymentResult = {
  starsAmount: number;
  canUndo: boolean;
};

/**
 * `undefined` if no stars are needed, or a PAYMENT_REJECTED symbol if the users cancels the payment / doesn't have enough balance
 */
type PreparedPaymentResult = undefined | typeof PAYMENT_REJECTED | ConfirmedPaymentResult;

export const PAYMENT_REJECTED = Symbol('Payment rejected');


export default class PaidMessagesInterceptor {
  private pendingUndoableMessage = createPendingUndoableMessage();

  private static rawStars = useStars();

  /**
   * Mininum required params to make the message(s) undoable
   *
   * (Editable through global class attached to the window)
   */
  private static MIN_UNDO_SENDING_PARAMS = {
    starsAmount: 100,
    messageCount: 3
  };
  // private static MIN_UNDO_SENDING_PARAMS = {
  //   starsAmount: 2,
  //   messageCount: 3
  // };


  constructor(private chat: Chat, private managers: AppManagers) {}

  public dispose() {
    this.pendingUndoableMessage.dispose();
  }

  private static get starsBalance() {
    return +this.rawStars();
  }

  /**
   * The starsAmount better be provided by this interceptor and then passed manually to the send method
   * to make sure we don't accidentally send stars in a case that might have not been handled
   */
  public async prepareStarsForPayment(messageCount: number): Promise<PreparedPaymentResult> {
    const {peerId, starsAmount} = this.chat

    if(!starsAmount) return;

    const totalStarsAmount = messageCount * starsAmount;

    if(PaidMessagesInterceptor.starsBalance < totalStarsAmount)
    {
      this.pendingUndoableMessage.abort();
      PopupElement.createPopup(PopupStars);
      return PAYMENT_REJECTED;
    }

    const userConfirmation = await PaidMessagesInterceptor.checkIfUserReallyWantsToPay({peerId, messageCount, starsAmount, withDontShowAgain: true});
    if(userConfirmation === UserConfirmationResult.Rejected) return PAYMENT_REJECTED;

    const canUndo = (
      PaidMessagesInterceptor.canUndoMessageSending({userConfirmation, messageCount, starsAmount}) ||
      !!this.pendingUndoableMessage.messageCount() // Allow undo if there's some pending undoable messages already
    );

    if(canUndo)
    {
      setReservedStars(prev => prev + totalStarsAmount);
      this.pendingUndoableMessage.setReserved(prev => prev + totalStarsAmount);

      this.triggerUndoableMessages({peerId, messageCount, starsAmount});
    }

    return {starsAmount, canUndo};
  }

  private static canUndoMessageSending(args: {userConfirmation: UserConfirmationResult, messageCount: number, starsAmount: number}) {
    const {messageCount, starsAmount, userConfirmation} = args;

    if(UserConfirmationResult.Skipped !== userConfirmation) return false;

    return (
      starsAmount >= this.MIN_UNDO_SENDING_PARAMS.starsAmount ||
      messageCount >= this.MIN_UNDO_SENDING_PARAMS.messageCount
    );
  }

  /**
   * Static method - to be used outside a chat instance
   *
   * The starsAmount better be provided by this interceptor and then passed manually to the send method
   * to make sure we don't accidentally send stars in a case that might have not been handled
   */
  public static async prepareStarsForPayment(args: {messageCount: number, peerId: PeerId}): Promise<PreparedPaymentResult> {
    const {peerId, messageCount} = args;

    const starsAmount = await rootScope.managers.appPeersManager.getStarsAmount(peerId);

    if(!starsAmount) return;

    const totalStarsAmount = messageCount * starsAmount;

    if(PaidMessagesInterceptor.starsBalance < totalStarsAmount)
    {
      PopupElement.createPopup(PopupStars);
      return PAYMENT_REJECTED;
    }

    const userConfirmation = await PaidMessagesInterceptor.checkIfUserReallyWantsToPay({peerId, messageCount, starsAmount, withDontShowAgain: false});

    if(userConfirmation === UserConfirmationResult.Rejected) return PAYMENT_REJECTED;


    return {starsAmount, canUndo: false};
  }

  private static async checkIfUserReallyWantsToPay({peerId, messageCount, starsAmount, withDontShowAgain}: PassedDownArgs & {withDontShowAgain: boolean}) {
    const totalStarsAmount = starsAmount * messageCount;

    let onNotShowAgain = noop;

    if(withDontShowAgain)
    {
      const {dontShowPaidMessageWarningFor = []} = await rootScope.managers.appStateManager.getState();
      const shouldShowWarning = !dontShowPaidMessageWarningFor.includes(peerId);

      if(!shouldShowWarning) return UserConfirmationResult.Skipped;

      onNotShowAgain = () => {
        rootScope.managers.appStateManager.setByKey(
          'dontShowPaidMessageWarningFor',
          [...dontShowPaidMessageWarningFor, peerId]
        );
      };
    }

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
        checkbox: withDontShowAgain ? {
          text: 'DontAskAgain'
        } : undefined,
        button: {
          langKey: 'PaidMessages.PayForMessages',
          langArgs: [messageCount]
        }
      });

      if(withDontShowAgain && dontShowAgain) onNotShowAgain();
    }
    catch
    {
      return UserConfirmationResult.Rejected;
    }

    return UserConfirmationResult.Confirmed;
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
      this.pendingUndoableMessage.resetGlobalReserved();
      this.pendingUndoableMessage.reset();
    });

    this.pendingUndoableMessage.timeoutId = self.setTimeout(() => {
      this.managers.appMessagesManager.sendQueuedPaidMessages(peerId);
      this.pendingUndoableMessage.reset();
    }, SEND_PAID_WITH_STARS_DELAY);
  }
}

MOUNT_CLASS_TO['PaidMessagesInterceptor'] = PaidMessagesInterceptor;
