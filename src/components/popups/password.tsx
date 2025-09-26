import rootScope from '../../lib/rootScope';
import confirmationPopup from '../confirmationPopup';
import PasswordInputField from '../passwordInputField';
import {PopupPeerOptions} from './peer';

export async function passwordPopup(options: Omit<PopupPeerOptions, 'inputField'> & {
  button?: PopupPeerOptions['buttons'][0];
}) {
  const state = await rootScope.managers.passwordManager.getState();

  const passwordInputField = new PasswordInputField({
    labelText: state.hint ?? ''
  });

  await confirmationPopup({
    ...options,
    button: options.button ?? {
      langKey: 'Confirm'
    },
    inputField: passwordInputField
  })

  const inputCheckPassword = await rootScope.managers.passwordManager.getInputCheckPassword(passwordInputField.value, state);

  return inputCheckPassword;
}
