import {addCancelButton, PopupButton} from '@components/popups/indexTsx';
import deferredPromise from '@helpers/cancellablePromise';
import shake from '@helpers/dom/shake';
import {InputCheckPasswordSRP} from '@layer';
import rootScope from '@lib/rootScope';
import {InputState} from '@components/inputField';
import PasswordInputField from '@components/passwordInputField';
import showPeerPopup, {PopupPeerOptions} from '@components/popups/peer';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export async function passwordPopup<Result>(options: Omit<PopupPeerOptions, 'inputField'> & {
  button?: Omit<PopupPeerOptions['buttons'][0], 'callback'>;
  callback: (inputCheckPassword: InputCheckPasswordSRP) => Promise<Result>;
  /** a wrong password shakes the field */
  shakeOnWrongPassword?: boolean;
  /** a failure that is not about the password closes the prompt and rejects with it, for the caller to tell */
  rejectOtherErrors?: boolean;
  /** the password was removed meanwhile: `callback` is tried once more, with none */
  retryWithoutPassword?: boolean;
}) {
  let state = await rootScope.managers.passwordManager.getState();

  const passwordInputField = new PasswordInputField({
    labelText: state.hint ?? '',
    onRawInput: () => {
      passwordInputField.setState(InputState.Neutral);
    }
  });

  let resolved = false, retriedWithout = false, rejectedWith: any;
  const deferred = deferredPromise<Result>();

  const buttonOptions: PopupButton = {
    langKey: options.button?.langKey ?? 'Confirm',
    langArgs: options.button?.langArgs ?? [],
    callback: async() => {
      const managers = bindManagersToSession(rootScope.managers);
      buttonOptions.element.disabled = true
      try {
        const attempt = async() => options.callback(await managers.passwordManager.getInputCheckPassword(passwordInputField.value, state));
        let result: Result;
        try {
          result = await attempt();
        } catch(err) {
          // * the check was made for a state another request used up meanwhile: once more, for a fresh one
          if((err as ApiError)?.type !== 'SRP_ID_INVALID') throw err;
          state = await managers.passwordManager.getState();
          result = await attempt();
        }

        deferred.resolve(result);
        resolved = true;
        return true
      } catch(err) {
        console.error(err)
        const type = (err as ApiError)?.type || '';
        if(options.retryWithoutPassword && !retriedWithout) {
          state = await managers.passwordManager.getState();
          if(!state.pFlags.has_password) {
            retriedWithout = true;
            try {
              deferred.resolve(await options.callback(undefined));
              resolved = true;
            } catch(err) {
              rejectedWith = err;
            }

            return true
          }
        }

        if(type === 'PASSWORD_HASH_INVALID') {
          passwordInputField.setState(InputState.Error, 'PASSWORD_HASH_INVALID')
          if(options.shakeOnWrongPassword) shake(passwordInputField.container)
        } else if(type.startsWith('FLOOD_WAIT_')) {
          passwordInputField.setState(InputState.Error, 'PasscodeLock.TooManyAttempts')
        } else if(options.rejectOtherErrors) {
          rejectedWith = err;
          return true
        } else {
          passwordInputField.setState(InputState.Error, 'Error.AnError')
        }
        state = await managers.passwordManager.getState();
        return false
      } finally {
        buttonOptions.element.disabled = false
      }
    }
  }

  showPeerPopup('popup-confirmation', {
    ...options,
    inputField: passwordInputField,
    buttons: addCancelButton([buttonOptions]),
    onCloseAfterTimeout: () => {
      if(!resolved) {
        deferred.reject(rejectedWith);
      }
    }
  });


  return deferred;
}
