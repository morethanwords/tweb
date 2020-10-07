import appChatsManager from "../../lib/appManagers/appChatsManager";
import appImManager from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import appSidebarRight from "../sidebarRight";
import $rootScope from "../../lib/rootScope";
import { findUpClassName } from "../../lib/utils";
import { parseMenuButtonsTo, attachContextMenuListener, positionMenu, openBtnMenu } from "../misc";
import { PopupButton, PopupPeer } from "../popup";

export class ChatContextMenu {
  private element = document.getElementById('bubble-contextmenu') as HTMLDivElement;
  private buttons: {
    reply: HTMLButtonElement,
    edit: HTMLButtonElement,
    copy: HTMLButtonElement,
    pin: HTMLButtonElement,
    forward: HTMLButtonElement,
    delete: HTMLButtonElement
  } = {} as any;
  public msgID: number;

  constructor(private attachTo: HTMLElement) {
    parseMenuButtonsTo(this.buttons, this.element.children);

    attachContextMenuListener(attachTo, (e) => {
      let bubble: HTMLElement = null;

      try {
        bubble = findUpClassName(e.target, 'bubble__container');
      } catch(e) {}

      if(!bubble) return;

      if(e instanceof MouseEvent) e.preventDefault();
      if(this.element.classList.contains('active')) {
        return false;
      }
      if(e instanceof MouseEvent) e.cancelBubble = true;
      
      bubble = bubble.parentElement as HTMLDivElement; // bc container
      
      let msgID = +bubble.dataset.mid;
      if(!msgID) return;

      let peerID = $rootScope.selectedPeerID;
      this.msgID = msgID;

      const message = appMessagesManager.getMessage(msgID);

      this.buttons.copy.style.display = message.message ? '' : 'none';
      
      if($rootScope.myID == peerID || (peerID < 0 && appChatsManager.hasRights(-peerID, 'pin'))) {
        this.buttons.pin.style.display = '';
      } else {
        this.buttons.pin.style.display = 'none';
      }
      
      this.buttons.edit.style.display = appMessagesManager.canEditMessage(msgID) ? '' : 'none';
      
      let side: 'left' | 'right' = bubble.classList.contains('is-in') ? 'left' : 'right';
      positionMenu(e, this.element, side);
      openBtnMenu(this.element);
      
      /////this.log('contextmenu', e, bubble, msgID, side);
    });

    this.buttons.copy.addEventListener('click', () => {
      let message = appMessagesManager.getMessage(this.msgID);
      
      let str = message ? message.message : '';
      
      var textArea = document.createElement("textarea");
      textArea.value = str;
      textArea.style.position = "fixed";  //avoid scrolling to bottom
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Oops, unable to copy', err);
      }
      
      document.body.removeChild(textArea);
    });

    this.buttons.delete.addEventListener('click', () => {
      let peerID = $rootScope.selectedPeerID;
      let firstName = appPeersManager.getPeerTitle(peerID, false, true);

      let callback = (revoke: boolean) => {
        appMessagesManager.deleteMessages([this.msgID], revoke);
      };

      let title: string, description: string, buttons: PopupButton[];
      title = 'Delete Message?';
      description = `Are you sure you want to delete this message?`;

      if(peerID == $rootScope.myID) {
        buttons = [{
          text: 'DELETE',
          isDanger: true,
          callback: () => callback(false)
        }];
      } else {
        buttons = [{
          text: 'DELETE JUST FOR ME',
          isDanger: true,
          callback: () => callback(false)
        }];

        if(peerID > 0) {
          buttons.push({
            text: 'DELETE FOR ME AND ' + firstName,
            isDanger: true,
            callback: () => callback(true)
          });
        } else if(appChatsManager.hasRights(-peerID, 'deleteRevoke')) {
          buttons.push({
            text: 'DELETE FOR ALL',
            isDanger: true,
            callback: () => callback(true)
          });
        }
      }

      buttons.push({
        text: 'CANCEL',
        isCancel: true
      });

      let popup = new PopupPeer('popup-delete-chat', {
        peerID: peerID,
        title: title,
        description: description,
        buttons: buttons
      });

      popup.show();
    });
    
    this.buttons.reply.addEventListener('click', () => {
      const message = appMessagesManager.getMessage(this.msgID);
      const chatInputC = appImManager.chatInputC;
      chatInputC.setTopInfo(appPeersManager.getPeerTitle(message.fromID, true), message.message, undefined, message);
      chatInputC.replyToMsgID = this.msgID;
      chatInputC.editMsgID = 0;
    });

    this.buttons.forward.addEventListener('click', () => {
      appSidebarRight.forwardTab.open([this.msgID]);
    });
    
    this.buttons.edit.addEventListener('click', () => {
      const message = appMessagesManager.getMessage(this.msgID);
      const chatInputC = appImManager.chatInputC;
      chatInputC.setTopInfo('Editing', message.message, message.message, message);
      chatInputC.replyToMsgID = 0;
      chatInputC.editMsgID = this.msgID;
    });
    
    this.buttons.pin.addEventListener('click', () => {
      appMessagesManager.updatePinnedMessage($rootScope.selectedPeerID, this.msgID);
    });
  }
}