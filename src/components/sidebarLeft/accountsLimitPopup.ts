import PopupElement from '../popups';
import PopupPremium from '../popups/premium';
import AccountsLimitPopupContent from './accountsLimitPopupContent';

export default class AccountsLimitPopup extends PopupElement {
  constructor() {
    super('accounts-limit-popup', {
      overlayClosable: true,
      body: true,
      title: 'LimitReached'
    });

    this.body.append(AccountsLimitPopupContent({
      onCancel: () => {
        this.hide();
      },
      onSubmit: () => {
        this.hide();
        PopupPremium.show({feature: 'double_limits'});
      }
    }) as HTMLElement)
  }
}
