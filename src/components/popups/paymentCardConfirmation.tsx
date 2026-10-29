import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {AccountPassword, AccountTmpPassword} from '@layer';
import {InputState} from '@components/inputField';
import PasswordInputField from '@components/passwordInputField';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {createSignal} from 'solid-js';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export default function showPaymentCardConfirmationPopup(options: {
  card: string,
  passwordState: AccountPassword,
  onFinish?: (tmpPassword: AccountTmpPassword) => void
}) {
  const {card, passwordState} = options;
  const [disabled, setDisabled] = createSignal(true);

  const passwordInputField = new PasswordInputField({labelText: passwordState.hint ?? ''});

  const onPay = async() => {
    const managers = bindManagersToSession(rootScope.managers);
    try {
      const inputCheckPassword = await managers.passwordManager.getInputCheckPassword(passwordInputField.value, passwordState);
      const tmpPassword = await managers.passwordManager.getTmpPassword(inputCheckPassword, 60);

      options.onFinish?.(tmpPassword);
    } catch(err) {
      if((err as ApiError).type === 'PASSWORD_HASH_INVALID') {
        passwordInputField.setError('PASSWORD_HASH_INVALID');
      } else if(!(err as ApiError).handled) {
        toastNew({langPackKey: 'Error.AnError'});
      }

      (err as ApiError).handled = true;
      throw err;
    }
  };

  const onInput = () => {
    setDisabled(!passwordInputField.value);
    passwordInputField.setState(InputState.Neutral);
  };

  passwordInputField.input.addEventListener('input', onInput);
  onInput();

  createPopup(() => {
    return (
      <PopupElement
        class="popup-payment popup-payment-card-confirmation"
        closable
        show
        initialFocus={() => passwordInputField.input}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="Checkout.PasswordEntry.Title" />
        </PopupElement.Header>
        <PopupElement.Scrollable>
          <PopupElement.Body>
            <Section caption="Checkout.PasswordEntry.Text" captionArgs={[card]}>
              {passwordInputField.container}
            </Section>
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            confirm
            preloader
            pendingLangKey="PleaseWait"
            disabled={disabled()}
            langKey="Checkout.PasswordEntry.Pay"
            callback={onPay}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
