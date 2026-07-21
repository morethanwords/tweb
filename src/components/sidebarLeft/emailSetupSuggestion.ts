import {showEmailSetupPopup} from '@components/popups/emailSetup';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {usePendingSuggestions} from '@stores/promo';
import {createEffect} from 'solid-js';

const EMAIL_SETUP_KEY = 'SETUP_LOGIN_EMAIL';
const EMAIL_SETUP_KEY_NOSKIP = 'SETUP_LOGIN_EMAIL_NOSKIP';

export default function createEmailSetupSuggestion() {
  const pendingSuggestions = usePendingSuggestions();

  createEffect(() => {
    const pendingSuggestions$ = pendingSuggestions();
    if(!pendingSuggestions$.has(EMAIL_SETUP_KEY) && !pendingSuggestions$.has(EMAIL_SETUP_KEY_NOSKIP)) {
      return;
    }

    Promise.all([
      rootScope.managers.appPromoManager.getPromoData(true),
      rootScope.managers.passwordManager.getState()
    ]).then(([data, passwordState]) => {
      if(passwordState.login_email_pattern && !passwordState.email_unconfirmed_pattern) {
        return;
      }

      const noskip = data.pendingSuggestions.includes(EMAIL_SETUP_KEY_NOSKIP);
      if(data.pendingSuggestions.includes(EMAIL_SETUP_KEY) || noskip) {
        showEmailSetupPopup({
          noskip,
          purpose: {_: 'emailVerifyPurposeLoginChange'},
          onDismiss: () => {
            if(!noskip) {
              rootScope.managers.appPromoManager.dismissSuggestion(EMAIL_SETUP_KEY);
            }
          },
          onSuccess: () => {
            toastNew({langPackKey: 'EmailSetup.SetupToast'});
          }
        });
      }
    });
  });
}
