import type {AppManagers} from '../../../lib/appManagers/managers';
import type ListenerSetter from '../../../helpers/listenerSetter';
import safeAssign from '../../../helpers/object/safeAssign';
import rootScope from '../../../lib/rootScope';
import type {InputPeer} from '../../../layer';
import useStars from '../../../stores/stars';
import {i18n} from '../../../lib/langPack';

import confirmationPopup from '../../confirmationPopup';
import PopupStars from '../../popups/stars';
import PopupElement from '../../popups';

import type Chat from '../chat';

import showPriceChangedTooltip from './priceChangedTooltip';


type ConstructorArgs = {
  managers: AppManagers;
  chat: Chat;
  listenerSetter: ListenerSetter;
};

type OpenedTooltip = {
  withPrice: number;
  close: () => void;
};

type OpenTooltipArgs = {
  newPrice: number;
  requiredStars: number;
  requestId: number;
};

type ConfirmResendArgs = {
  totalStarsToRepay: number;
  pendingRequestsIds: number[];
  newPrice: number;
};

class PriceChangedInterceptor {
  private chat: Chat;
  private listenerSetter: ListenerSetter;
  private managers: AppManagers;

  private pendingRequestsIds: number[] = [];
  private totalStarsToRepay = 0;

  private openedTooltip?: OpenedTooltip;

  private static rawStars = useStars();

  private static get starsBalance() {
    return +this.rawStars();
  }


  constructor(args: ConstructorArgs) {
    safeAssign(this, args);
  }

  init() {
    this.listenerSetter.add(rootScope)('insufficent_stars_for_message', async({requiredStars, requestId, invokeApiArgs}) => {
      if(!this.chat.peerId.isUser()) return;

      const apiCallParams = invokeApiArgs[1];

      const peer = 'peer' in apiCallParams ? apiCallParams.peer : 'to_peer' in apiCallParams ? apiCallParams.to_peer : undefined;
      if(!peer || !('allow_paid_stars' in apiCallParams)) return;

      const peerId = await this.managers.appPeersManager.getPeerId(peer as InputPeer);
      if(peerId !== this.chat.peerId) return;

      // TODO: Throttle this request or somehow unite for multiple messages sent
      const starsAmount = await this.managers.appUsersManager.getStarsAmount(peerId.toUserId(), true);
      this.chat.updateStarsAmount(starsAmount);

      console.log('[my-debug] from client: requestId, requiredStars :>> ', requestId, requiredStars);

      this.handlePriceChanged({
        newPrice: starsAmount,
        requestId,
        requiredStars
      });
    });
  }

  private handlePriceChanged({newPrice, requiredStars, requestId}: OpenTooltipArgs) {
    if(this.openedTooltip && newPrice !== this.openedTooltip.withPrice) {
      this.cleanup();
    }

    if(!this.openedTooltip) this.openedTooltip = {
      close: this.openTooltip(newPrice),
      withPrice: newPrice
    }

    this.totalStarsToRepay += requiredStars;
    this.pendingRequestsIds.push(requestId);
  }

  private openTooltip(amount: number) {
    const onResend = () => {
      this.confirmResend({
        newPrice: amount,
        pendingRequestsIds: [...this.pendingRequestsIds],
        totalStarsToRepay: this.totalStarsToRepay
      });
    };

    const {close} = showPriceChangedTooltip({
      amount,
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
    this.pendingRequestsIds?.forEach((requestId) => {
      this.managers.apiManager.cancelRepayRequest(requestId);
    });
  }

  private async confirmResend({newPrice, pendingRequestsIds, totalStarsToRepay}: ConfirmResendArgs) {
    if(!totalStarsToRepay) return;

    if(PriceChangedInterceptor.starsBalance < totalStarsToRepay) {
      PopupElement.createPopup(PopupStars);
      return;
    }

    await confirmationPopup({
      titleLangKey: 'ConfirmPayment',
      descriptionLangKey: totalStarsToRepay !== newPrice ?
        'PaidMessage.ConfirmPriceChangedRepay' :
        'PaidMessage.ConfirmPriceChangedRepayShort',
      descriptionLangArgs: [
        i18n('Stars', [totalStarsToRepay]),
        i18n('Stars', [newPrice])
      ],
      button: {
        langKey: 'Confirm'
      }
    });

    await Promise.all(pendingRequestsIds.map((id) => this.managers.apiManager.confirmRepayRequest(id)));
  }

  cleanup() {
    this.pendingRequestsIds = [];
    this.totalStarsToRepay = 0;
    this.closeTooltip();
    this.cancelPendingRequests();
  }
}

export default PriceChangedInterceptor;
