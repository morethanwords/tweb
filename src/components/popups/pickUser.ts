import { isTouchSupported } from "../../helpers/touchSupport";
import AppSelectPeers from "../appSelectPeers";
import PopupElement from ".";

export default class PopupPickUser extends PopupElement {
  protected selector: AppSelectPeers;
  
  constructor(options: {
    peerTypes: AppSelectPeers['peerType'], 
    onSelect?: (peerId: number) => Promise<void> | void, 
    onClose?: () => void,
    placeholder: string,
    chatRightsAction?: AppSelectPeers['chatRightsAction']
  }) {
    super('popup-forward', null, {closable: true, overlayClosable: true, body: true});

    if(options.onClose) this.onClose = options.onClose;

    this.selector = new AppSelectPeers({
      appendTo: this.body, 
      onChange: async() => {
        const peerId = this.selector.getSelected()[0];
        this.btnClose.click();

        this.selector = null;

        if(options.onSelect) {
          const res = options.onSelect(peerId);
          if(res instanceof Promise) {
            await res;
          }
        }
      }, 
      peerType: options.peerTypes, 
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!isTouchSupported) {
          this.selector.input.focus();
        }
      }, 
      chatRightsAction: options.chatRightsAction, 
      multiSelect: false,
      rippleEnabled: false
    });

    //this.scrollable = new Scrollable(this.body);

    this.selector.input.placeholder = options.placeholder;
    this.title.append(this.selector.input);
  }
}
