import {createSignal, Show} from 'solid-js';
import PopupElement from '.';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import agentIdentity from '@lib/agentIdentity';
import {toast, toastNew} from '@components/toast';

const showCrmError = (err: any, fallback: LangPackKey) => {
  const msg = typeof err?.message === 'string' && !err.message.startsWith('CRM_') ? err.message : '';
  if(msg) toast(msg);
  else toastNew({langPackKey: fallback});
};

export default class PopupCrmLogin extends PopupElement {
  constructor() {
    super('popup-crm-login', {
      title: 'Crm.Title',
      body: true,
      closable: true
    });

    this.appendSolidBody(() => this._construct());
    this.show();
  }

  protected _construct() {
    const [otpSent, setOtpSent] = createSignal(false);
    const [busy, setBusy] = createSignal(false);

    const baseUrlField = new InputField({label: 'Crm.BaseUrl', name: 'crm-base-url', plainText: true});
    const mobileField = new InputField({label: 'Crm.Mobile', name: 'crm-mobile', plainText: true});
    const codeField = new InputField({label: 'Crm.Code', name: 'crm-code', plainText: true});

    rootScope.managers.appCrmManager.getConfig().then((config) => {
      if(config?.baseUrl && !baseUrlField.value) baseUrlField.setValueSilently(config.baseUrl);
    });

    const sendCode = async() => {
      const baseUrl = baseUrlField.value.trim();
      const mobile = mobileField.value.trim();
      if(!baseUrl || !mobile) {
        toastNew({langPackKey: 'Crm.FillFields'});
        return;
      }
      setBusy(true);
      try {
        await rootScope.managers.appCrmManager.setConfig({baseUrl});
        await rootScope.managers.appCrmManager.sendOtp(mobile);
        setOtpSent(true);
      } catch(err) {
        showCrmError(err, 'Crm.SendFailed');
      } finally {
        setBusy(false);
      }
    };

    const connect = async() => {
      setBusy(true);
      try {
        const user = await rootScope.managers.appCrmManager.verifyOtp(
          mobileField.value.trim(),
          codeField.value.trim()
        );
        const crmName = user?.full_name || user?.display_name;
        if(crmName) agentIdentity.setName(crmName);
        this.hide();
      } catch(err) {
        showCrmError(err, 'Crm.VerifyFailed');
      } finally {
        setBusy(false);
      }
    };

    return (
      <>
        <p class="popup-crm-login-caption">{i18n('Crm.Caption')}</p>
        {baseUrlField.container}
        {mobileField.container}
        <Show when={otpSent()}>{codeField.container}</Show>
        <Show
          when={otpSent()}
          fallback={
            <Button class="btn-primary btn-color-primary" disabled={busy()} onClick={sendCode}>
              {i18n('Crm.SendCode')}
            </Button>
          }
        >
          <Button class="btn-primary btn-color-primary" disabled={busy()} onClick={connect}>
            {i18n('Crm.Connect')}
          </Button>
        </Show>
      </>
    );
  }
}

// Singleton guard — prevents a second popup when 401s fire in quick succession.
let activePopup: PopupCrmLogin | undefined;

export function showCrmLoginIfNeeded() {
  if(activePopup) return;
  rootScope.managers.appCrmManager.isConnected().then((connected) => {
    if(connected || activePopup) return;
    activePopup = new PopupCrmLogin();
    activePopup.addEventListener('closeAfterTimeout', () => {
      activePopup = undefined;
    });
  });
}
