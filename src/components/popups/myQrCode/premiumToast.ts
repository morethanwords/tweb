import {toast} from '@components/toast';
import anchorCallback from '@helpers/dom/anchorCallback';
import {i18n} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/**
 * "Subscribe to Premium to use gifts in your QR code", with the offer to subscribe in the toast. Where the purchase is
 * hidden there is nothing to offer, and the toast only says it.
 */
export async function showPremiumGiftsToast() {
  const content = document.createElement('span');
  content.append(i18n('QRCode.PremiumGiftsToast'));
  if(!await apiManagerProxy.isPremiumFeaturesHidden()) {
    const subscribe = anchorCallback(() => hotReloadGuard.showPremiumPopup());
    subscribe.append(i18n('QRCode.PremiumSubscribe'));
    content.append(' ', subscribe);
  }

  toast(content);
}
