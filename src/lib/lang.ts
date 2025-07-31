import {MessageAction} from '../layer';
import {FormatterArgument, LangPackKey} from './langPack';

type Result = {
  langPackKey: LangPackKey;
  args: FormatterArgument[];
};

export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, peerTitle?: () => Promise<FormatterArgument>): Promise<Result>;
export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, peerTitle?: () => FormatterArgument): Result;

export function getPriceChangedActionMessageLangParams(action: MessageAction.messageActionPaidMessagesPrice, peerTitle?: () => Promise<FormatterArgument> | FormatterArgument): Promise<Result> | Result {
  const isFree = !+action?.stars;
  const isChannel = action?.pFlags?.broadcast_messages_allowed;

  if(isChannel) {
    const peerTitleResult = peerTitle();
    const langPackKey = isFree ? 'PaidMessages.ChannelPriceChangedFree' : 'PaidMessages.ChannelPriceChanged';

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
