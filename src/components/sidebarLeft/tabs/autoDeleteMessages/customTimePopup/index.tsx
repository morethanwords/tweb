import {LangPackKey} from '@lib/langPack';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {AutoDeleteMessagesCustomTimePopupContent} from '@components/sidebarLeft/tabs/autoDeleteMessages/customTimePopup/content';

if(import.meta.hot) import.meta.hot.accept('./content', () => {});

type Args = {
  descriptionLangKey: LangPackKey;
  period: number;
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  onFinish: (period: number) => void;
};

export default function showAutoDeleteMessagesCustomTimePopup({descriptionLangKey, period, HotReloadGuard, onFinish}: Args) {
  let currentPeriod = period;

  const content = new AutoDeleteMessagesCustomTimePopupContent;
  content.HotReloadGuard = HotReloadGuard;
  content.feedProps({
    initialPeriod: period || 0,
    descriptionLangKey,
    onChange: (newPeriod) => {
      currentPeriod = newPeriod;
    }
  });

  createPopup(() => (
    <PopupElement class="auto-delete-messages-custom-time-popup" closable old>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="AutoDeleteMessages" />
      </PopupElement.Header>
      <PopupElement.Body>{content}</PopupElement.Body>
      <PopupElement.Buttons>
        <PopupElement.Button langKey="Save" callback={() => onFinish(currentPeriod)} />
        <PopupElement.Button langKey="Cancel" cancel />
      </PopupElement.Buttons>
    </PopupElement>
  ));
}
