import type {HelpPremiumPromo, MessageAction, PaymentsCheckedGiftCode} from '@layer';
import type {PremiumPromoFeature} from '@components/premium/featuresConfig';
import type {Middleware} from '@helpers/middleware';
import type {AppManagers} from '@lib/managers';
import type ListenerSetter from '@helpers/listenerSetter';
import type {ChatSetPeerOptions} from '@lib/appImManager';

/**
 * What every part of the premium popup reads. Lives apart from the popup module so
 * the slides can import it without importing the popup that renders them.
 */
export type PremiumPromoData = {
  order: PremiumPromoFeatureType[],
  features: PremiumPromoFeature[],
  premiumPromo: HelpPremiumPromo,
  appConfig: MTAppConfig,
  isPremiumActive?: boolean,
  gift?: MessageAction.messageActionGiftPremium | PaymentsCheckedGiftCode,
  peerId?: PeerId,
  emojiStatusId?: DocId,
  isOut?: boolean,
  /** `business` shows the Telegram Business feature set instead of the premium one. */
  type: 'premium' | 'gift' | 'business',
  stack?: ChatSetPeerOptions['stack'],
  managers: AppManagers,
  middleware: Middleware,
  listenerSetter: ListenerSetter
};
