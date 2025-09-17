import PopupElement from '../../popups';
import SuggestPostPopupContent from './content';


export default class SuggestPostPopup extends PopupElement {
  constructor(suggestChange: boolean) {
    super('suggest-post-popup', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: suggestChange ? 'SuggestedPosts.SuggestAChange' : 'SuggestedPosts.SuggestAPost'
    });

    const content = new SuggestPostPopupContent;
    content.feedProps({
      popupContainer: this.container,
      popupHeader: this.header,
      onFinish: () => {
        this.hide();
      }
    });

    this.body.append(content);
  }
}
