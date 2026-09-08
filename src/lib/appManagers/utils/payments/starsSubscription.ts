import type {StarsSubscription} from '@layer';
import type {LangPackKey} from '@lib/langPack';

export function getStarsSubscriptionPresentation(subscription: StarsSubscription, now: number, business = false) {
  const expired = subscription.until_date <= now;
  const canceled = !!(subscription.pFlags.canceled || subscription.pFlags.bot_canceled);
  const missingBalance = !!subscription.pFlags.missing_balance;
  const canRefulfill = !!subscription.pFlags.can_refulfill && !expired;
  const botCanceledKey: LangPackKey = business ? 'Stars.Subscription.BusinessCancelled' : 'Stars.Subscription.BotCancelled';
  const statusKey: LangPackKey = subscription.pFlags.bot_canceled ? botCanceledKey :
    subscription.pFlags.canceled ? 'Stars.Subscriptions.Cancelled' :
      expired ? 'Stars.Subscription.Expired' : missingBalance ? 'Stars.Subscription.MissingBalance' : undefined;
  const dateKey: LangPackKey = expired ? 'Stars.Subscriptions.Expired' : canceled ? 'Stars.Subscriptions.Expires' : 'Stars.Subscriptions.Renews';
  const dateLabelKey: LangPackKey = expired ? 'Stars.Subscription.Expired' : canceled ? 'Stars.Subscription.Expires' : 'Stars.Subscription.Renews';
  const captionKey: LangPackKey = canRefulfill ? 'Stars.Subscription.RestoreCaption' : subscription.pFlags.bot_canceled ? botCanceledKey :
    expired ? 'Stars.Subscription.ExpiredCaption' : subscription.pFlags.canceled ? 'Stars.Subscription.Cancelled' :
      missingBalance ? 'Stars.Subscription.MissingBalanceCaption' : 'Stars.Subscription.Active';
  return {expired, canceled, missingBalance, canRefulfill, statusKey, dateKey, dateLabelKey, captionKey, showPrice: !canceled && !expired};
}
