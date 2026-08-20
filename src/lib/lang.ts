import {Message, MessageAction, StarGift} from '@layer';
import {FormatterArgument, LangPackKey} from '@lib/langPack';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import formatStarsAmount from '@appManagers/utils/payments/formatStarsAmount';
import getStarGiftMessageTextDetails from '@appManagers/utils/gifts/getStarGiftMessageTextDetails';

type Result = {
  langPackKey: LangPackKey;
  args: FormatterArgument[];
};

export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, isBroadcast: boolean, peerTitle?: () => Promise<FormatterArgument>): Promise<Result>;
export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, isBroadcast: boolean, peerTitle?: () => FormatterArgument): Result;

export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, isBroadcast: boolean, peerTitle?: () => Promise<FormatterArgument> | FormatterArgument): Promise<Result> | Result {
  const isFree = !+action?.stars;
  const allowedDirectMessages = action?.pFlags?.broadcast_messages_allowed;

  if(isBroadcast) {
    const peerTitleResult = peerTitle();
    const langPackKey: LangPackKey = allowedDirectMessages ?
      (isFree ? 'PaidMessages.ChannelPriceChangedFree' : 'PaidMessages.ChannelPriceChanged') :
      'PaidMessages.ChannelPriceDisabled';

    if(peerTitleResult instanceof Promise) {
      return (async() => ({
        langPackKey,
        args: isFree ? [await peerTitleResult] : [+action.stars, await peerTitleResult]
      }))();
    }

    return {
      langPackKey,
      args: isFree ? [peerTitleResult] : [+action.stars, peerTitleResult]
    }
  } else {
    return {
      langPackKey: isFree ? 'PaidMessages.GroupPriceChangedFree' : 'PaidMessages.GroupPriceChanged',
      args: [+action.stars]
    };
  }
}

type StarGiftAction = MessageAction.messageActionStarGift | MessageAction.messageActionStarGiftUnique;

type StarGiftResult = {
  langPackKey: LangPackKey;
  args?: MaybePromise<FormatterArgument>[];
};

// * a faithful port of the star gift service texts: who paid, who received it and whether it went to a channel
export function getStarGiftActionLangParams(options: {
  message: Pick<Message.messageService, 'pFlags' | 'peerId' | 'fromId'>,
  action: StarGiftAction,
  myId: PeerId,
  peerTitle: (peerId: PeerId) => MaybePromise<FormatterArgument>
}): StarGiftResult {
  const {message, action, myId, peerTitle} = options;
  const {direction, fromId} = getStarGiftMessageTextDetails(message, action, myId);
  const isMine = direction !== 'incoming';

  const giftPeerId = action.peer ? getPeerId(action.peer) : undefined;
  const channelId = giftPeerId && !giftPeerId.isUser() ? giftPeerId : undefined;

  // * the counted argument always goes first - it picks the plural form
  const sentToChannel = (amount: number, ton?: boolean): StarGiftResult => {
    return isMine ? {
      langPackKey: ton ? 'ActionGiftSentSelfChannelTon' : 'ActionGiftSentSelfChannel',
      args: [amount, peerTitle(channelId)]
    } : {
      langPackKey: ton ? 'ActionGiftSentChannelTon' : 'ActionGiftSentChannel',
      args: [amount, peerTitle(fromId), peerTitle(channelId)]
    };
  };

  if(action._ === 'messageActionStarGift') {
    const stars = +(action.gift as StarGift.starGift).stars;

    if(channelId) {
      return sentToChannel(stars);
    }

    if(direction === 'self') {
      return {langPackKey: 'StarGiftSentMessageSelf', args: [stars]};
    }

    if(direction === 'outgoing') {
      return {
        langPackKey: action.pFlags.upgrade_separate ? 'StarGiftSentMessagePrepaidOutgoing' : 'StarGiftSentMessageOutgoing',
        args: [stars]
      };
    }

    return {
      langPackKey: action.pFlags.upgrade_separate ? 'StarGiftSentMessagePrepaidIncoming' : 'StarGiftSentMessageIncoming',
      args: [stars, peerTitle(fromId)]
    };
  }

  if(action.pFlags.prepaid_upgrade) { // * somebody else has paid for this upgrade
    return {
      langPackKey: message.pFlags.out ? 'ActionGiftUpgradedHelpedSelf' : 'ActionGiftUpgradedHelped',
      args: [peerTitle(message.peerId)]
    };
  }

  const resaleAmount = action.resale_amount;
  const isSold = !!(action.pFlags.from_offer && message.pFlags.out);
  if(resaleAmount && !isSold) {
    const isTon = resaleAmount._ === 'starsTonAmount';
    const amount = formatStarsAmount(resaleAmount);

    if(channelId) {
      return sentToChannel(amount, isTon);
    }

    if(direction === 'self') {
      return {langPackKey: isTon ? 'StarGiftSentMessageSelfTon' : 'StarGiftSentMessageSelf', args: [amount]};
    }

    if(direction === 'outgoing') {
      return {langPackKey: isTon ? 'StarGiftSentMessageOutgoingTon' : 'StarGiftSentMessageOutgoing', args: [amount]};
    }

    return {
      langPackKey: isTon ? 'StarGiftSentMessageIncomingTon' : 'StarGiftSentMessageIncoming',
      args: [amount, peerTitle(fromId)]
    };
  }

  const isUpgrade = !!action.pFlags.upgrade;

  if(channelId) {
    return isMine ? {
      langPackKey: isUpgrade ? 'ActionGiftUpgradedSelfChannel' : 'ActionGiftTransferredSelfChannel',
      args: [peerTitle(channelId)]
    } : {
      langPackKey: isUpgrade ? 'ActionGiftUpgradedChannel' : 'ActionGiftTransferredChannel',
      args: [peerTitle(fromId), peerTitle(channelId)]
    };
  }

  if(message.peerId === myId) {
    return {langPackKey: isUpgrade ? 'ActionGiftUpgradedSelf' : 'ActionGiftTransferredSelf'};
  }

  const langPackKey: LangPackKey = isUpgrade ?
    (message.pFlags.out ? 'ActionGiftUpgradedOutbound' : 'ActionGiftUpgradedInbound') :
    isSold ?
      'ActionGiftSold' :
      (message.pFlags.out ? 'ActionGiftTransferredOutbound' : 'ActionGiftTransferredInbound');

  return {langPackKey, args: [peerTitle(message.peerId)]};
}
