import SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import PopupElement from '../../popups';
import SuggestPostPopupContent, {FinishPayload} from './content';


type Args = {
  suggestChange?: boolean;
  onFinish: (payload: FinishPayload) => void;
};

export default class SuggestPostPopup extends PopupElement {
  constructor({suggestChange, onFinish}: Args) {
    super('suggested-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: suggestChange ? 'SuggestedPosts.SuggestAChange' : 'SuggestedPosts.SuggestAPost'
    });

    const content = new SuggestPostPopupContent;
    content.HotReloadGuard = SolidJSHotReloadGuardProvider;
    content.feedProps({
      onFinish: (payload) => {
        onFinish(payload);
        this.hide();
      }
    });

    this.body.append(content);
  }
}
