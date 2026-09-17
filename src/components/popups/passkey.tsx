import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import {Passkey} from '@layer';
import {getInputPasskeyCredential} from '@appManagers/utils/account/getInputPasskeyResponse';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import showFeatureDetailsPopup from '@components/popups/featureDetails';

export async function createPasskey() {
  const registrationOptions = await rootScope.managers.appAccountManager.initPasskeyRegistration();
  const publicKeyCredentialCreationOptions = PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(registrationOptions.options.data).publicKey);

  // if(IS_BETA) {
  //   console.log(publicKeyCredentialCreationOptions);
  //   publicKeyCredentialCreationOptions.rp = {
  //     id: 'localhost',
  //     name: 'Telegram Messenger'
  //   };
  // }

  try {
    const credential = await navigator.credentials.create({publicKey: publicKeyCredentialCreationOptions});
    const passkey = await rootScope.managers.appAccountManager.registerPasskey(getInputPasskeyCredential(credential as PublicKeyCredential));
    toastNew({langPackKey: 'Passkey.Created'});
    return passkey;
  } catch(err) {
    console.error('passkey error', err);
    toastNew({langPackKey: 'Passkey.CreationError'});
    throw err;
  }
}

export default function showPasskeyPopup(onCreation?: (passkey: Passkey) => void) {
  showFeatureDetailsPopup({
    rows: [
      {icon: 'key', title: i18n('Passkey.Row1.Title'), subtitle: i18n('Passkey.Row1.Subtitle')},
      {icon: 'faceid', title: i18n('Passkey.Row2.Title'), subtitle: i18n('Passkey.Row2.Subtitle')},
      {icon: 'lock', title: i18n('Passkey.Row3.Title'), subtitle: i18n('Passkey.Row3.Subtitle')}
    ],
    sticker: {
      name: 'key',
      size: 120
    },
    title: i18n('Passkey.Title'),
    subtitle: i18n('Passkey.Subtitle'),
    buttons: IS_WEB_AUTHN_SUPPORTED ? [{
      text: i18n('Passkey.Create'),
      onClick: async(close) => {
        try {
          const passkey = await createPasskey();
          close();
          onCreation?.(passkey);
        } catch(err) {
          return false;
        }
      }
    }, {
      text: i18n('Passkey.Skip'),
      onClick: () => {},
      isCancel: true,
      isSecondary: true
    }] : [{
      text: i18n('Passkey.Unsupported'),
      isCancel: true
    }]
  });
}
