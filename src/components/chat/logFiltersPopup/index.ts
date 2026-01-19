import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import PopupElement from '@components/popups';
import LogFiltersPopupContent, {LogFiltersPopupContentProps} from '@components/chat/logFiltersPopup/content';


type Args = LogFiltersPopupContentProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
};

export default class LogFiltersPopup extends PopupElement {
  constructor({HotReloadGuard, onFinish, ...rest}: Args) {
    super('log-filters-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'RecentActions'
    });

    const content = new LogFiltersPopupContent;
    content.HotReloadGuard = HotReloadGuard;
    content.feedProps({
      ...rest,
      onFinish: (payload) => {
        onFinish(payload);
        this.hide();
      }
    });

    this.body.append(content);
  }
}
