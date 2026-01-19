import {LangPackKey} from '@lib/langPack';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement from '@components/popups';
import {AutoDeleteMessagesCustomTimePopupContent} from '@components/sidebarLeft/tabs/autoDeleteMessages/customTimePopup/content';

if(import.meta.hot) import.meta.hot.accept('./content', () => {});


type Args = {
  descriptionLangKey: LangPackKey;
  period: number;
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  onFinish: (period: number) => void;
};

export default class AutoDeleteMessagesCustomTimePopup extends PopupElement {
  private period: number;

  constructor({descriptionLangKey, period, HotReloadGuard, onFinish}: Args) {
    super('auto-delete-messages-custom-time-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'AutoDeleteMessages',
      buttons: [
        {
          langKey: 'Save',
          callback: () => {
            onFinish(this.period);
            this.hide();
          }
        },
        {
          langKey: 'Cancel',
          isCancel: true
        }
      ]
    });

    this.period = period;

    const content = new AutoDeleteMessagesCustomTimePopupContent;
    content.HotReloadGuard = HotReloadGuard;
    content.feedProps({
      initialPeriod: period || 0,
      descriptionLangKey,
      onChange: (newPeriod) => {
        this.period = newPeriod;
      }
    })

    this.body.append(content);
  }
}
