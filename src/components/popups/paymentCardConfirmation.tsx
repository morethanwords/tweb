import PopupElement, {createPopup} from '@components/popups/indexTsx';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import {AccountPassword, AccountTmpPassword} from '@layer';
import {InputState} from '@components/inputField';
import PasswordInputField from '@components/passwordInputField';
import Section from '@components/section';
import rootScope from '@lib/rootScope';
import {createSignal, onMount} from 'solid-js';

export default function showPaymentCardConfirmationPopup(options: {
  card: string,
  passwordState: AccountPassword,
  onFinish?: (tmpPassword: AccountTmpPassword) => void
}) {
  const {card, passwordState} = options;
  const [disabled, setDisabled] = createSignal(true);

  const passwordInputField = new PasswordInputField({labelText: passwordState.hint ?? ''});

  const onPay = async() => {
    try {
      const inputCheckPassword = await rootScope.managers.passwordManager.getInputCheckPassword(passwordInputField.value, passwordState);
      const tmpPassword = await rootScope.managers.passwordManager.getTmpPassword(inputCheckPassword, 60);

      options.onFinish?.(tmpPassword);
    } catch(err) {
      if((err as ApiError).type === 'PASSWORD_HASH_INVALID') {
        (err as ApiError).handled = true;
        passwordInputField.setError('PASSWORD_HASH_INVALID');
      }

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
    onMount(() => placeCaretAtEnd(passwordInputField.input));

    return (
      <PopupElement
        class="popup-payment popup-payment-card-confirmation"
        closable
        show
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
