import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createSignal, For, onMount, Show, untrack, useContext} from 'solid-js';
import InputField from '@components/inputField';
import RadioField from '@components/radioField';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {toastNew} from '@components/toast';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {getCurrentNetworkConfig, setCurrentNetworkConfig} from '@lib/mtproto/electronRenderer';

type ConnectionType = ElectronNetworkConfig['connection'];

const CONNECTION_OPTIONS: {value: ConnectionType, langKey: LangPackKey}[] = [
  {value: 'websocket', langKey: 'ConnectionSettings.TypeWebSocket'},
  {value: 'tcp', langKey: 'ConnectionSettings.TypeTCP'},
  {value: 'socks5', langKey: 'ConnectionSettings.TypeSocks5'},
  {value: 'mtproxy', langKey: 'ConnectionSettings.TypeMtproxy'}
];

const DEFAULTS: ElectronNetworkConfig = {
  connection: 'websocket',
  socks5: {host: '', port: 1080, username: '', password: ''},
  mtproxy: {host: '', port: 443, secret: ''}
};

/** Electron-only popup to choose the transport and configure a SOCKS5 / MTProxy proxy. */
export default function showConnectionSettingsPopup(): void {
  function Inner() {
    const context = useContext(PopupContext);
    const current = untrack(getCurrentNetworkConfig) || DEFAULTS;

    const [connection, setConnection] = createSignal<ConnectionType>(current.connection || 'websocket');
    let confirmBtn!: HTMLButtonElement;

    // tweb-styled radios, with selection mirrored into a Solid signal for conditional sections.
    const radios = CONNECTION_OPTIONS.map((opt) => {
      const field = new RadioField({langKey: opt.langKey, name: 'connection-type', value: opt.value});
      field.input.checked = opt.value === connection();
      field.input.addEventListener('change', () => field.input.checked && setConnection(opt.value));
      return field.label;
    });

    const socks = current.socks5 || DEFAULTS.socks5;
    const mt = current.mtproxy || DEFAULTS.mtproxy;

    const socksHost = new InputField({labelText: 'Server', name: 'socks-host'});
    const socksPort = new InputField({labelText: 'Port', name: 'socks-port', inputMode: 'numeric'});
    const socksUser = new InputField({labelText: 'Username (optional)', name: 'socks-user'});
    const socksPass = new InputField({labelText: 'Password (optional)', name: 'socks-pass'});
    const mtHost = new InputField({labelText: 'Server', name: 'mt-host'});
    const mtPort = new InputField({labelText: 'Port', name: 'mt-port', inputMode: 'numeric'});
    const mtSecret = new InputField({labelText: 'Secret', name: 'mt-secret'});

    socksHost.value = socks.host || '';
    socksPort.value = String(socks.port || 1080);
    socksUser.value = socks.username || '';
    socksPass.value = socks.password || '';
    mtHost.value = mt.host || '';
    mtPort.value = String(mt.port || 443);
    mtSecret.value = mt.secret || '';

    const onConfirm = async() => {
      const type = connection();
      const config: ElectronNetworkConfig = {
        connection: type,
        socks5: {
          host: socksHost.value.trim(),
          port: +socksPort.value || 1080,
          username: socksUser.value.trim(),
          password: socksPass.value
        },
        mtproxy: {
          host: mtHost.value.trim(),
          port: +mtPort.value || 443,
          secret: mtSecret.value.trim()
        }
      };

      if(type === 'socks5' && !config.socks5.host) {
        return toastNew({langPackKey: 'ConnectionSettings.Invalid'});
      }
      if(type === 'mtproxy' && (!config.mtproxy.host || !config.mtproxy.secret)) {
        return toastNew({langPackKey: 'ConnectionSettings.Invalid'});
      }

      // Persist in the main process, update the worker, and reconnect the (shared) connection.
      await window.electronApp.setNetworkConfig(config);
      setCurrentNetworkConfig(config);
      apiManagerProxy.pushElectronConfig();
      rootScope.managers.apiManager.reapplyTransports();

      toastNew({langPackKey: 'ConnectionSettings.Saved'});
      context.hide();
    };

    onMount(() => {
      attachClickEvent(confirmBtn, onConfirm);
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="ConnectionSettings.Title" />
          <button ref={confirmBtn} class="btn-primary btn-color-primary">{i18n('Save')}</button>
        </PopupElement.Header>
        <PopupElement.Body class="connection-settings-body">
          <div class="connection-settings-section-title">{i18n('ConnectionSettings.Type')}</div>
          <div class="connection-settings-radios">{radios}</div>
          <div class="connection-settings-hint">{i18n('ConnectionSettings.Hint')}</div>

          <Show when={connection() === 'socks5'}>
            <div class="connection-settings-fields">
              {socksHost.container}
              {socksPort.container}
              {socksUser.container}
              {socksPass.container}
            </div>
          </Show>

          <Show when={connection() === 'mtproxy'}>
            <div class="connection-settings-fields">
              {mtHost.container}
              {mtPort.container}
              {mtSecret.container}
            </div>
          </Show>
        </PopupElement.Body>
      </>
    );
  }

  createPopup(() => (
    <PopupElement class="popup-connection-settings" closable>
      <Inner />
    </PopupElement>
  ));
}
