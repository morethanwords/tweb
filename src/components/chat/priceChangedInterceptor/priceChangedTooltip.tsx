import {i18n} from '@lib/langPack';

import showChatToast from '@components/chat/chatToast';
import Button from '@components/buttonTsx';

import styles from '@components/chat/priceChangedInterceptor/priceChangedTooltip.module.scss';


type ShowPriceChangedTooltipArgs = {
  starsAmount: number;
  onResend: () => void;
  onHide?: () => void;
};

export default function showPriceChangedTooltip({starsAmount, onResend, onHide}: ShowPriceChangedTooltipArgs) {
  // * docked below the topbar and its floating plates by showChatToast. Mounting it on
  // * .bubbles instead traps it in that transformed z-index:1 stacking context, where it
  // * paints behind the topbar and gets clipped by it
  return showChatToast({
    animation: 'fade',
    // * without one it hangs until the chat is left or the repay goes through. The message
    // * itself keeps the failure (a "failed to pay" service line + Resend in its context
    // * menu), so this is a notice, not the only way back to it
    duration: 10000,
    onHide,
    textElement: i18n('PaidMessages.PriceChanged', [i18n('Stars', [starsAmount])]),
    rightElement: (
      <Button
        class={`btn ${styles.Button}`}
        onClick={onResend}
      >
        {i18n('Resend')}
      </Button>
    ),
    class: styles.Tooltip,
    icon: 'sendingerror_filled'
  });
}
