import {i18n} from '../../../lib/langPack';

import showTooltip from '../../tooltip';
import Button from '../../buttonTsx';

import type Chat from '../chat';

import styles from './priceChangedTooltip.module.scss';


type ShowPriceChangedTooltipArgs = {
  chat: Chat;
  amount: number;
  onResend: () => void;
};

export default function showPriceChangedTooltip({chat, amount, onResend}: ShowPriceChangedTooltipArgs) {
  return showTooltip({
    element: chat.bubbles.container,
    container: chat.bubbles.container,
    mountOn: chat.bubbles.container,
    relative: true,
    vertical: 'top',
    textElement: i18n('PaidMessage.PriceChanged', [amount]),
    rightElement: (
      <Button
        class={`btn ${styles.Button}`}
        onClick={onResend}
      >
        {i18n('PaidMessage.PriceChangedTooltipAction')}
      </Button>
    ),
    class: styles.Tooltip,
    icon: 'sendingerror'
  });
}
