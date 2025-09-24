import {Message} from '../../../../layer';
import type SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import PopupElement from '../../../popups';
import SuggestedPostAcceptWithTimePopupContent from './content';


type Args = {
  peerId: PeerId;
  message: Message.message;
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider;
  offeredStars?: number;
};

export default class SuggestedPostAcceptWithTimePopup extends PopupElement {
  constructor({peerId, message, offeredStars, HotReloadGuard}: Args) {
    super('suggested-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'SuggestedPosts.AcceptOffer'
    });

    const content = new SuggestedPostAcceptWithTimePopupContent;
    content.HotReloadGuard = HotReloadGuard;
    content.feedProps({
      peerId,
      message,
      offeredStars,
      onFinish: () => {
        this.hide();
      }
    })

    this.body.append(content);
  }
}
