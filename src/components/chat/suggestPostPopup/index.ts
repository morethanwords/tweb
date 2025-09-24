import SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import PopupElement from '../../popups';
import SuggestPostPopupContent, {FinishPayload, SuggestPostPopupContentProps} from './content';

type Args = SuggestPostPopupContentProps & {
  suggestChange?: boolean;
};

export default class SuggestPostPopup extends PopupElement {
  constructor({suggestChange, onFinish, ...rest}: Args) {
    super('suggested-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: suggestChange ? 'SuggestedPosts.SuggestAChange' : 'SuggestedPosts.SuggestAPost'
    });

    const content = new SuggestPostPopupContent;
    content.HotReloadGuard = SolidJSHotReloadGuardProvider;
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
