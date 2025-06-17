import {i18n} from '../../../lib/langPack';

import showTooltip from '../../tooltip';
import Button from '../../buttonTsx';

import type Chat from '../chat';

import styles from './priceChangedTooltip.module.scss';


type ShowPriceChangedTooltipArgs = {
  chat: Chat;
  starsAmount: number;
  onResend: () => void;
};

export default function showPriceChangedTooltip({chat, starsAmount, onResend}: ShowPriceChangedTooltipArgs) {
  return showTooltip({
    element: chat.bubbles.container,
    container: chat.bubbles.container,
    mountOn: chat.bubbles.container,
    relative: true,
    vertical: 'top',
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
    icon: 'sendingerror'
  });
}
