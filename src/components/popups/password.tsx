import PopupElement, {addCancelButton, PopupButton} from '.';
import deferredPromise from '../../helpers/cancellablePromise';
import {InputCheckPasswordSRP} from '../../layer';
import rootScope from '../../lib/rootScope';
import {InputState} from '../inputField';
import PasswordInputField from '../passwordInputField';
import PopupPeer, {PopupPeerOptions} from './peer';

export async function passwordPopup<Result>(options: Omit<PopupPeerOptions, 'inputField'> & {
  button?: Omit<PopupPeerOptions['buttons'][0], 'callback'>;
  callback: (inputCheckPassword: InputCheckPasswordSRP) => Promise<Result>;
}) {
  let state = await rootScope.managers.passwordManager.getState();

  const passwordInputField = new PasswordInputField({
    labelText: state.hint ?? '',
    onRawInput: () => {
      passwordInputField.setState(InputState.Neutral);
    }
  });

  let resolved = false;
  const deferred = deferredPromise<Result>();

  const buttonOptions: PopupButton = {
    langKey: options.button?.langKey ?? 'Confirm',
    langArgs: options.button?.langArgs ?? [],
    callback: async() => {
      buttonOptions.element.disabled = true
      try {
        const inputCheckPassword = await rootScope.managers.passwordManager.getInputCheckPassword(passwordInputField.value, state);
        const result = await options.callback(inputCheckPassword);
        deferred.resolve(result);
        resolved = true;
        return true
      } catch(err) {
        console.error(err)
        if((err as ApiError).type === 'PASSWORD_HASH_INVALID') {
          passwordInputField.setState(InputState.Error, 'PASSWORD_HASH_INVALID')
        } else if((err as ApiError).type.startsWith('FLOOD_WAIT_')) {
          passwordInputField.setState(InputState.Error, 'PasscodeLock.TooManyAttempts')
        } else {
          passwordInputField.setState(InputState.Error, 'Error.AnError')
        }
        state = await rootScope.managers.passwordManager.getState();
        return false
      } finally {
        buttonOptions.element.disabled = false
      }
    }
  }

  const popup = PopupElement.createPopup(PopupPeer, 'popup-confirmation', {
    ...options,
    inputField: passwordInputField,
    buttons: addCancelButton([buttonOptions])
  })

  popup.addEventListener('closeAfterTimeout', () => {
    if(!resolved) {
      deferred.reject();
    }
  });

  popup.show()

  return deferred;
}
