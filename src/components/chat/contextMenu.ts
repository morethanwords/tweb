import appChatsManager from "../../lib/appManagers/appChatsManager";
import appImManager from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import appPollsManager, { Poll } from "../../lib/appManagers/appPollsManager";
import $rootScope from "../../lib/rootScope";
import { findUpClassName } from "../../lib/utils";
import ButtonMenu, { ButtonMenuItemOptions } from "../buttonMenu";
import { attachContextMenuListener, openBtnMenu, positionMenu } from "../misc";
import { PopupButton, PopupPeer } from "../popup";
import appSidebarRight from "../sidebarRight";

export class ChatContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify: (peerID: number, msgID: number, target: HTMLElement) => boolean})[];
  private element: HTMLElement;

  private target: HTMLElement;
  public peerID: number;
  public msgID: number;

  constructor(private attachTo: HTMLElement) {
    attachContextMenuListener(attachTo, (e) => {
      if(this.init) {
        this.init();
        this.init = null;
      }

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
      
      const msgID = +bubble.dataset.mid;
      if(!msgID) return;

      this.peerID = $rootScope.selectedPeerID;
      //this.msgID = msgID;
      this.target = e.target as HTMLElement;

      const albumItem = findUpClassName(this.target, 'album-item');
      if(albumItem) {
        this.msgID = +albumItem.dataset.mid;
      } else {
        this.msgID = msgID;
      }

      this.buttons.forEach(button => {
        const good = button.verify(this.peerID, this.msgID, this.target);
        button.element.classList.toggle('hide', !good);
      });

      const side: 'left' | 'right' = bubble.classList.contains('is-in') ? 'left' : 'right';
      positionMenu(e, this.element, side);
      openBtnMenu(this.element, () => {
        this.peerID = this.msgID = 0;
        this.target = null;
      });
      
      /////this.log('contextmenu', e, bubble, msgID, side);
    });
  }

  private init = () => {
    this.buttons = [{
      icon: 'reply',
      text: 'Reply',
      onClick: this.onReplyClick,
      verify: (peerID: number, msgID: number) => (peerID > 0 || appChatsManager.hasRights(-peerID, 'send')) && msgID > 0
    }, {
      icon: 'edit',
      text: 'Edit',
      onClick: this.onEditClick,
      verify: (peerID: number, msgID: number) => appMessagesManager.canEditMessage(msgID, 'text')
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: this.onCopyClick,
      verify: (peerID: number, msgID: number) => !!appMessagesManager.getMessage(msgID).message
    }, {
      icon: 'pin',
      text: 'Pin',
      onClick: this.onPinClick,
      verify: (peerID: number, msgID: number) => {
        const message = appMessagesManager.getMessage(msgID);
        return msgID > 0 && message._ != 'messageService' && appImManager.pinnedMsgID != msgID && (peerID == $rootScope.myID || (peerID < 0 && appChatsManager.hasRights(-peerID, 'pin')));
      }
    }, {
      icon: 'unpin',
      text: 'Unpin',
      onClick: this.onUnpinClick,
      verify: (peerID: number, msgID: number) => appImManager.pinnedMsgID == msgID && (peerID == $rootScope.myID || (peerID < 0 && appChatsManager.hasRights(-peerID, 'pin')))
    }, {
      icon: 'revote',
      text: 'Revote',
      onClick: this.onRetractVote,
      verify: (peerID: number, msgID) => {
        const message = appMessagesManager.getMessage(msgID);
        const poll = message.media?.poll as Poll;
        return poll && poll.chosenIndexes.length && !poll.pFlags.closed && !poll.pFlags.quiz;
      } 
    }, {
      icon: 'lock',
      text: 'Stop poll',
      onClick: this.onStopPoll,
      verify: (peerID: number, msgID) => {
        const message = appMessagesManager.getMessage(msgID);
        const poll = message.media?.poll;
        return appMessagesManager.canEditMessage(msgID, 'poll') && poll && !poll.pFlags.closed && msgID > 0;
      } 
    }, {
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick,
      verify: (peerID: number, msgID: number) => msgID > 0
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: (peerID: number, msgID: number) => peerID > 0 || appMessagesManager.getMessage(msgID).fromID == $rootScope.myID || appChatsManager.hasRights(-peerID, 'deleteRevoke')
    }];

    this.element = ButtonMenu(this.buttons);
    this.element.id = 'bubble-contextmenu';
    appImManager.chatInput.parentElement.insertBefore(this.element, appImManager.chatInput);
  };

  private onReplyClick = () => {
    const message = appMessagesManager.getMessage(this.msgID);
    const chatInputC = appImManager.chatInputC;
    chatInputC.setTopInfo(appPeersManager.getPeerTitle(message.fromID, true), message.message, undefined, message);
    chatInputC.replyToMsgID = this.msgID;
    chatInputC.editMsgID = 0;
  };

  private onEditClick = () => {
    const message = appMessagesManager.getMessage(this.msgID);
    const chatInputC = appImManager.chatInputC;
    chatInputC.setTopInfo('Editing', message.message, message.message, message);
    chatInputC.replyToMsgID = 0;
    chatInputC.editMsgID = this.msgID;
  };

  private onCopyClick = () => {
    const message = appMessagesManager.getMessage(this.msgID);
    
    const str = message ? message.message : '';
    
    const textArea = document.createElement('textarea');
    textArea.value = str;
    textArea.style.position = 'fixed';  //avoid scrolling to bottom
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
  };

  private onPinClick = () => {
    appMessagesManager.updatePinnedMessage($rootScope.selectedPeerID, this.msgID);
  };

  private onUnpinClick = () => {
    appMessagesManager.updatePinnedMessage($rootScope.selectedPeerID, 0);
  };

  private onRetractVote = () => {
    appPollsManager.sendVote(this.msgID, []);
  };

  private onStopPoll = () => {
    appPollsManager.stopPoll(this.msgID);
  };

  private onForwardClick = () => {
    appSidebarRight.forwardTab.open([this.msgID]);
  };

  private onDeleteClick = () => {
    const peerID = $rootScope.selectedPeerID;
    const firstName = appPeersManager.getPeerTitle(peerID, false, true);

    const msgID = this.msgID;
    const callback = (revoke: boolean) => {
      appMessagesManager.deleteMessages([msgID], revoke);
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

    const popup = new PopupPeer('popup-delete-chat', {
      peerID: peerID,
      title: title,
      description: description,
      buttons: buttons
    });

    popup.show();
  };
}