import {MAX_ACCOUNTS_FREE, MAX_ACCOUNTS_PREMIUM} from '../../lib/accounts/constants';
import {i18n, i18n_} from '../../lib/langPack';

import Button from '../button';
import {IconTsx} from '../iconTsx';

export default function AccountsLimitPopupContent(props: {onCancel: () => void; onSubmit: () => void}) {
  return (
    <div>
      <div class="accounts-limit__pin-container">
        <img class="accounts-limit__pin-image" src="assets/img/accounts-limit-pin-shape.svg" />
        <IconTsx class="accounts-limit__pin-icon" icon="person" />
        <span class="accounts-limit__pin-count">{MAX_ACCOUNTS_FREE}</span>
      </div>

      <div class="accounts-limit__bar">
        <div class="accounts-limit__bar-left">{i18n('LimitFree')}</div>
        <div class="accounts-limit__bar-right">
          {i18n('LimitPremium')}
          <span>{MAX_ACCOUNTS_PREMIUM}</span>
        </div>
      </div>

      <div class="accounts-limit__description">{i18n_({key: 'MultiAccount.AccountsLimitDescription'})}</div>

      <div class="accounts-limit__actions">
        {(() => {
          const cancelButton = Button('popup-button btn primary', {text: 'Cancel'});
          cancelButton.addEventListener('click', props.onCancel);
          return cancelButton;
        })()}
        {(() => {
          const increaseLimitButton = Button('popup-button btn primary');
          increaseLimitButton.append(i18n('IncreaseLimit'), PlusOneSvg() as HTMLElement);
          increaseLimitButton.addEventListener('click', props.onSubmit);

          return increaseLimitButton;
        })()}
      </div>
    </div>
  );
}

function PlusOneSvg() {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_6002_2313)">
        <path
          d="M0 6.4C0 4.15979 0 3.03968 0.435974 2.18404C0.819467 1.43139 1.43139 0.819467 2.18404 0.435974C3.03968 0 4.15979 0 6.4 0H17.6C19.8402 0 20.9603 0 21.816 0.435974C22.5686 0.819467 23.1805 1.43139 23.564 2.18404C24 3.03968 24 4.15979 24 6.4V11.6C24 13.8402 24 14.9603 23.564 15.816C23.1805 16.5686 22.5686 17.1805 21.816 17.564C20.9603 18 19.8402 18 17.6 18H6.4C4.15979 18 3.03968 18 2.18404 17.564C1.43139 17.1805 0.819467 16.5686 0.435974 15.816C0 14.9603 0 13.8402 0 11.6V6.4Z"
          fill="currentColor"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M16.165 12.1651H15.5C15.0388 12.1651 14.665 12.539 14.665 13.0001C14.665 13.4613 15.0388 13.8351 15.5 13.8351H17H18.5C18.9612 13.8351 19.335 13.4613 19.335 13.0001C19.335 12.539 18.9612 12.1651 18.5 12.1651H17.835V4.50011C17.835 4.09058 17.538 3.7415 17.1338 3.6759C16.7295 3.6103 16.3374 3.84755 16.2079 4.23606L16.1551 4.39442C15.902 5.15375 15.4755 5.84371 14.9096 6.40968C14.5835 6.73577 14.5835 7.26446 14.9096 7.59055C15.2357 7.91664 15.7643 7.91664 16.0904 7.59055C16.1155 7.56549 16.1404 7.54024 16.165 7.51481V12.1651ZM8 12.8351C7.53884 12.8351 7.165 12.4613 7.165 12.0001V9.83511H5C4.53884 9.83511 4.165 9.46127 4.165 9.00011C4.165 8.53896 4.53884 8.16511 5 8.16511H7.165V6.00011C7.165 5.53896 7.53884 5.16511 8 5.16511C8.46116 5.16511 8.835 5.53896 8.835 6.00011V8.16511H11C11.4612 8.16511 11.835 8.53896 11.835 9.00011C11.835 9.46127 11.4612 9.83511 11 9.83511H8.835V12.0001C8.835 12.4613 8.46116 12.8351 8 12.8351Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="clip0_6002_2313">
          <rect width="24" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
