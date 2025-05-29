/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {AccountPassword, AccountTmpPassword} from '../../layer';
import {InputState} from '../inputField';
import PasswordInputField from '../passwordInputField';
import SettingSection from '../settingSection';
import {PaymentButton} from './payment';

export default class PopupPaymentCardConfirmation extends PopupElement<{
  finish: (tmpPassword: AccountTmpPassword) => void
}> {
  constructor(card: string, passwordState: AccountPassword) {
    super('popup-payment popup-payment-card-confirmation', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: 'Checkout.PasswordEntry.Title'
    });

    const section = new SettingSection({noDelimiter: true, noShadow: true, caption: 'Checkout.PasswordEntry.Text', captionArgs: [card]});
    const passwordInputField = new PasswordInputField({labelText: passwordState.hint ?? ''});
    section.content.append(passwordInputField.container);
    this.scrollable.append(section.container);

    const onInput = () => {
      payButton.disabled = !passwordInputField.value;
      passwordInputField.setState(InputState.Neutral);
    };

    passwordInputField.input.addEventListener('input', onInput);

    const payButton = PaymentButton({
      key: 'Checkout.PasswordEntry.Pay',
      onClick: async() => {
        try {
          const inputCheckPassword = await this.managers.passwordManager.getInputCheckPassword(passwordInputField.value, passwordState);
          const tmpPassword = await this.managers.apiManager.invokeApi('account.getTmpPassword', {
            password: inputCheckPassword,
            period: 60
          });

          this.dispatchEvent('finish', tmpPassword);
          this.hide();
        } catch(err) {
          if((err as ApiError).type === 'PASSWORD_HASH_INVALID') {
            (err as ApiError).handled = true;
            passwordInputField.setError('PASSWORD_HASH_INVALID');
          }

          throw err;
        }
      }
    });
    this.body.append(this.btnConfirmOnEnter = payButton);

    onInput();

    this.show();

    placeCaretAtEnd(passwordInputField.input);
  }
}
