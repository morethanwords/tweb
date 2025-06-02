import type {AppManagers} from '../../../lib/appManagers/managers';
import type ListenerSetter from '../../../helpers/listenerSetter';
import safeAssign from '../../../helpers/object/safeAssign';
import accumulate from '../../../helpers/array/accumulate';
import rootScope from '../../../lib/rootScope';
import type {InputPeer} from '../../../layer';

import PaidMessagesInterceptor, {PAYMENT_REJECTED} from '../paidMessagesInterceptor';
import type Chat from '../chat';

import showPriceChangedTooltip from './priceChangedTooltip';


type PendingRequest = {
  id: number;
  messageCount: number;
};

type ConstructorArgs = {
  managers: AppManagers;
  chat: Chat;
  listenerSetter: ListenerSetter;
};

type OpenedTooltip = {
  close: () => void;
  withStarsAmount: number;
};

type OpenTooltipArgs = {
  starsAmount: number;
  messageCount: number;
  requestId: number;
};

type ConfirmResendArgs = {
  pendingRequests: PendingRequest[];
};

class PriceChangedInterceptor {
  private chat: Chat;
  private listenerSetter: ListenerSetter;
  private managers: AppManagers;

  private pendingRequests: PendingRequest[] = [];

  private openedTooltip?: OpenedTooltip;


  constructor(args: ConstructorArgs) {
    safeAssign(this, args);
  }

  init() {
    this.listenerSetter.add(rootScope)('insufficent_stars_for_message', async({requestId, messageCount, invokeApiArgs}) => {
      if(!this.chat.peerId.isUser()) return;

      const apiCallParams = invokeApiArgs[1];

      const peer = 'peer' in apiCallParams ? apiCallParams.peer : 'to_peer' in apiCallParams ? apiCallParams.to_peer : undefined;
      if(!peer || !('allow_paid_stars' in apiCallParams)) return;

      const peerId = await this.managers.appPeersManager.getPeerId(peer as InputPeer);
      if(peerId !== this.chat.peerId) return;

      // TODO: Throttle this request or somehow unite for multiple messages sent
      const starsAmount = await this.managers.appUsersManager.getStarsAmount(peerId.toUserId(), true);

      await this.managers.appUsersManager.updateCachedUserFullStarsAmount(peerId.toUserId(), starsAmount);
      this.chat.updateStarsAmount(starsAmount);

      console.log('[my-debug] from client: requestId, messageCount :>> ', requestId, messageCount);

      this.handlePriceChanged({
        starsAmount,
        requestId,
        messageCount
      });
    });
  }

  private handlePriceChanged({starsAmount, messageCount, requestId}: OpenTooltipArgs) {
    if(this.openedTooltip && this.openedTooltip.withStarsAmount !== starsAmount) {
      this.closeTooltip();
    }

    if(!this.openedTooltip) this.openedTooltip = {
      close: this.openTooltip(starsAmount),
      withStarsAmount: starsAmount
    }

    this.pendingRequests.push({
      id: requestId,
      messageCount
    });
  }

  private openTooltip(starsAmount: number) {
    const onResend = () => {
      this.confirmResend({
        pendingRequests: [...this.pendingRequests]
      });
    };

    const {close} = showPriceChangedTooltip({
      starsAmount,
      chat: this.chat,
      onResend
    });

    return close;
  }

  private closeTooltip() {
    this.openedTooltip?.close();
    this.openedTooltip = undefined;
  }

  private cancelPendingRequests() {
    this.pendingRequests?.forEach(({id}) => {
      this.managers.apiManager.cancelRepayRequest(id);
    });
  }

  private async confirmResend({pendingRequests}: ConfirmResendArgs) {
    const messageCount = accumulate(pendingRequests.map(r => r.messageCount), 0);

    const paymentConfirmation = await PaidMessagesInterceptor.prepareStarsForPayment({
      peerId: this.chat.peerId,
      messageCount
    });

    if(paymentConfirmation === PAYMENT_REJECTED) return;

    const starsAmount = this.chat.starsAmount;

    await Promise.all(pendingRequests.map(({id}) => this.managers.apiManager.confirmRepayRequest(id, starsAmount)));
  }

  cleanup() {
    this.pendingRequests = [];
    this.closeTooltip();
    // this.cancelPendingRequests();

    // TODO: resend button on each message?
  }
}

export default PriceChangedInterceptor;
