import type SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import PopupElement from '../../popups';
import SuggestPostPopupContent, {SuggestPostPopupContentProps} from './content';

type Args = SuggestPostPopupContentProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  suggestChange?: boolean;
};

export default class SuggestPostPopup extends PopupElement {
  constructor({HotReloadGuard, suggestChange, onFinish, ...rest}: Args) {
    super('suggested-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: suggestChange ? 'SuggestedPosts.SuggestAChange' : 'SuggestedPosts.SuggestAPost'
    });

    const content = new SuggestPostPopupContent;
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
