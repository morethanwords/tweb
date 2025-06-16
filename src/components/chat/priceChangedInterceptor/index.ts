import accumulate from '../../../helpers/array/accumulate';
import type ListenerSetter from '../../../helpers/listenerSetter';
import memoizeAsyncWithTTL from '../../../helpers/memoizeAsyncWithTTL';
import safeAssign from '../../../helpers/object/safeAssign';
import type {InputPeer} from '../../../layer';
import type {AppManagers} from '../../../lib/appManagers/managers';
import rootScope from '../../../lib/rootScope';
import {setReservedStars} from '../../../stores/stars';

import type Chat from '../chat';
import {PAYMENT_REJECTED} from '../paidMessagesInterceptor';

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

  private getStarsAmountForUser: AppManagers['appUsersManager']['getStarsAmount'];

  constructor(args: ConstructorArgs) {
    safeAssign(this, args);

    this.getStarsAmountForUser = memoizeAsyncWithTTL(
      (userId: UserId) => this.managers.appUsersManager.getStarsAmount(userId, true),
      (userId) => userId,
      1_000
    );
  }

  init() {
    this.listenerSetter.add(rootScope)('insufficent_stars_for_message', async({requestId, messageCount, invokeApiArgs, reservedStars}) => {
      reservedStars && setReservedStars(prev => Math.max(0, prev - reservedStars));

      const apiCallParams = invokeApiArgs[1];

      const peer = 'peer' in apiCallParams ? apiCallParams.peer : 'to_peer' in apiCallParams ? apiCallParams.to_peer : undefined;
      if(!peer || !('allow_paid_stars' in apiCallParams)) return;

      const peerId = await this.managers.appPeersManager.getPeerId(peer as InputPeer);
      if(peerId !== this.chat.peerId) return;

      const starsAmount = await this.getAndUpdateStarsAmountIfNecessary(peerId);

      this.chat.updateStarsAmount(starsAmount);

      this.handleNewRepayRequest({
        starsAmount,
        requestId,
        messageCount
      });
    });

    this.listenerSetter.add(rootScope)('fulfill_repaid_message', ({requestId}) => {
      this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
      if(!this.pendingRequests.length) this.closeTooltip();
    });
  }

  private async getAndUpdateStarsAmountIfNecessary(peerId: PeerId) {
    if(!peerId.isUser()) return this.managers.appPeersManager.getStarsAmount(peerId);

    const starsAmount = await this.getStarsAmountForUser(peerId.toUserId());

    await this.managers.appUsersManager.updateCachedUserFullStarsAmount(peerId.toUserId(), starsAmount);

    return starsAmount;
  }

  private handleNewRepayRequest({starsAmount, messageCount, requestId}: OpenTooltipArgs) {
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

  private async confirmResend({pendingRequests}: ConfirmResendArgs) {
    const messageCount = accumulate(pendingRequests.map(r => r.messageCount), 0);

    const preparedPaymentResult = await this.chat.input.paidMessageInterceptor.prepareStarsForPayment(messageCount);

    if(preparedPaymentResult === PAYMENT_REJECTED) return;

    await Promise.all(pendingRequests.map(({id}) => this.managers.appMessagesManager.confirmRepayRequest(id, preparedPaymentResult)));
  }

  cleanup() {
    this.pendingRequests = [];
    this.closeTooltip();
  }
}

export default PriceChangedInterceptor;
