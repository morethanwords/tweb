import PopupElement, {createPopup} from '@components/popups/indexTsx';
import deferredPromise from '@helpers/cancellablePromise';
import appImManager from '@lib/appImManager';
import {i18n, LangPackKey} from '@lib/langPack';
import useContentSettings from '@stores/contentSettings';
import Button from '@components/buttonTsx';
import styles from '@components/popups/ageVerification.module.scss';
import rootScope from '@lib/rootScope';
import {createSignal} from 'solid-js';

export async function showAgeVerificationPopup(options: {
  onVerify: (verified: boolean) => void,
  onClose?: () => void
}) {
  const appConfig = await rootScope.managers.apiManager.getAppConfig();
  const [show, setShow] = createSignal(true);
  // the web app takes over from here — closing for it must not answer "not verified"
  let switchedToWebApp = false;

  const textKey: LangPackKey = appConfig.verify_age_country === 'GB' ?
    'AgeVerification.TextGB' :
    'AgeVerification.Text';

  const handleVerify = async() => {
    const bot = await rootScope.managers.appUsersManager.resolveUserByUsername(
      appConfig.verify_age_bot_username ?? 'TelegramAge'
    );
    switchedToWebApp = true;
    setShow(false);
    appImManager.openWebApp({
      botId: bot.id,
      main: true,
      noConfirmation: true,
      forcePopup: true,
      onClose: () => {
        options.onVerify(!!useContentSettings().ageVerified());
      }
    });
  };

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      closable
      show={show()}
      onClose={() => !switchedToWebApp && options.onClose?.()}
      old
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="AgeVerification.Title" />
      </PopupElement.Header>
      <PopupElement.Body>
        <div class={styles.text}>
          {i18n(textKey)}
        </div>
      </PopupElement.Body>
      <PopupElement.Footer>
        <PopupElement.FooterButton langKey="AgeVerification.Action" callback={handleVerify} />
      </PopupElement.Footer>
    </PopupElement>
  ));
}

/** Resolves with what the user answered — `false` when they simply closed it. */
export default function createAgeVerification(): Promise<boolean> {
  const promise = deferredPromise<boolean>();

  showAgeVerificationPopup({
    onVerify: (verified) => promise.resolve(verified),
    onClose: () => promise.resolve(false)
  });

  return promise;
}
