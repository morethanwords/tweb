import PopupElement from '.';
import deferredPromise from '../../helpers/cancellablePromise';
import safeAssign from '../../helpers/object/safeAssign';
import appImManager from '../../lib/appManagers/appImManager';
import {i18n, LangPackKey} from '../../lib/langPack';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import Button from '../buttonTsx';
import styles from './ageVerification.module.scss';

export class AgeVerificationPopup extends PopupElement {
  private onVerify: (verified: boolean) => void;

  constructor(options: {
    onVerify: (verified: boolean) => void
  }) {
    super(styles.popup, {
      title: 'AgeVerification.Title',
      body: true,
      closable: true,
      overlayClosable: true
    })

    safeAssign(this, options);

    this.construct();
  }

  _switchedToWebApp = false;

  private async construct() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    this.appendSolidBody(() => this._construct({appConfig}))
  }

  protected _construct({appConfig}: { appConfig: MTAppConfig }) {
    let textKey: LangPackKey
    if(appConfig.verify_age_country === 'GB') {
      textKey = 'AgeVerification.TextGB';
    } else {
      textKey = 'AgeVerification.Text';
    }

    const handleVerify = async() => {
      const bot = await this.managers.appUsersManager.resolveUserByUsername(appConfig.verify_age_bot_username ?? 'TelegramAge')
      this._switchedToWebApp = true;
      this.destroy()
      appImManager.openWebApp({
        botId: bot.id,
        main: true,
        noConfirmation: true,
        forcePopup: true,
        onClose: async() => {
          const settings = await this.managers.appPrivacyManager.getSensitiveContentSettings()
          this.onVerify(settings.ageVerified)
        }
      })
    }

    return (
      <>
        <div class={styles.text}>
          {i18n(textKey)}
        </div>
        <Button class={`${styles.button} btn-color-primary btn-primary`} onClick={handleVerify}>
          {i18n('AgeVerification.Action')}
        </Button>
      </>
    )
  }

  static create(): Promise<boolean> {
    const promise = deferredPromise<boolean>();
    const popup = PopupElement.createPopup(AgeVerificationPopup, {
      onVerify: (verified) => promise.resolve(verified)
    });

    popup.addEventListener('close', () => {
      if(!popup._switchedToWebApp) {
        promise.resolve(false)
      }
    });
    popup.show()

    return promise
  }
}
