import PopupElement from '@components/popups';
import PopupPremium from '@components/popups/premium';
import AccountsLimitPopupContent from '@components/sidebarLeft/accountsLimitPopupContent';

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
