import { isTouchSupported } from "../helpers/touchSupport";
import appImManager from "../lib/appManagers/appImManager";
import AppSelectPeers from "./appSelectPeers";
import { PopupElement } from "./popup";

export default class PopupForward extends PopupElement {
  private selector: AppSelectPeers;
  //private scrollable: Scrollable;
  
  constructor(mids: number[], onSelect?: () => Promise<void> | void, onClose?: () => void) {
    super('popup-forward', null, {closable: true, overlayClosable: true, body: true});

    if(onClose) this.onClose = onClose;

    this.selector = new AppSelectPeers(this.body, async() => {
      const peerID = this.selector.getSelected()[0];
      this.closeBtn.click();

      this.selector = null;

      await (onSelect ? onSelect() || Promise.resolve() : Promise.resolve());

      appImManager.setPeer(peerID);
      appImManager.chatInputC.initMessagesForward(mids.slice());
    }, ['dialogs', 'contacts'], () => {
      this.show();

      if(!isTouchSupported) {
        this.selector.input.focus();
      }
    }, null, 'send', false);

    //this.scrollable = new Scrollable(this.body);

    this.selector.input.placeholder = 'Forward to...';
    this.title.append(this.selector.input);
  }

}