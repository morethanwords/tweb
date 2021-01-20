import { isTouchSupported } from "../../helpers/touchSupport";
import appImManager from "../../lib/appManagers/appImManager";
import AppSelectPeers from "../appSelectPeers";
import PopupElement from ".";

export default class PopupForward extends PopupElement {
  private selector: AppSelectPeers;
  //private scrollable: Scrollable;
  
  constructor(fromPeerId: number, mids: number[], onSelect?: () => Promise<void> | void, onClose?: () => void) {
    super('popup-forward', null, {closable: true, overlayClosable: true, body: true});

    if(onClose) this.onClose = onClose;

    this.selector = new AppSelectPeers({
      appendTo: this.body, 
      onChange: async() => {
        const peerId = this.selector.getSelected()[0];
        this.btnClose.click();

        this.selector = null;

        await (onSelect ? onSelect() || Promise.resolve() : Promise.resolve());

        appImManager.setInnerPeer(peerId);
        appImManager.chat.input.initMessagesForward(fromPeerId, mids.slice());
      }, 
      peerType: ['dialogs', 'contacts'], 
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting

        if(!isTouchSupported) {
          this.selector.input.focus();
        }
      }, 
      chatRightsAction: 'send', 
      multiSelect: false,
      rippleEnabled: false
    });

    //this.scrollable = new Scrollable(this.body);

    this.selector.input.placeholder = 'Forward to...';
    this.title.append(this.selector.input);
  }

}