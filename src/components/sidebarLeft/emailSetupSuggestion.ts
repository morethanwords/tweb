import {showEmailSetupPopup} from '@components/popups/emailSetup';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {usePendingSuggestions} from '@stores/promo';
import {createEffect} from 'solid-js';

const EMAIL_SETUP_KEY = 'SETUP_LOGIN_EMAIL';
const EMAIL_SETUP_KEY_NOSKIP = 'SETUP_LOGIN_EMAIL_NOSKIP';

export default function createEmailSetupSuggestion() {
  const pendingSuggestions = usePendingSuggestions();
  let popup: ReturnType<typeof showEmailSetupPopup>;

  createEffect(() => {
    const pendingSuggestions$ = pendingSuggestions();
    if(!pendingSuggestions$.has(EMAIL_SETUP_KEY) && !pendingSuggestions$.has(EMAIL_SETUP_KEY_NOSKIP)) {
      // * the requirement is gone (the email was set on another device, or it is no longer required)
      popup?.close();
      popup = undefined;
      return;
    }

    Promise.all([
      rootScope.managers.appPromoManager.getPromoData(true),
      rootScope.managers.passwordManager.getState()
    ]).then(([data, passwordState]) => {
      // * a pattern with a space in it ("REQUIRED *") is a placeholder, not a set email
      const hasEmail = !!passwordState.login_email_pattern && !passwordState.login_email_pattern.includes(' ');
      if(hasEmail && !passwordState.email_unconfirmed_pattern) {
        return;
      }

      const noskip = data.pendingSuggestions.includes(EMAIL_SETUP_KEY_NOSKIP);
      if(data.pendingSuggestions.includes(EMAIL_SETUP_KEY) || noskip) {
        popup = showEmailSetupPopup({
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
        }) || popup;
      }
    });
  });
}
