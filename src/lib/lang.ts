import {MessageAction} from '../layer';
import {FormatterArgument, LangPackKey} from './langPack';

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
