import { isTouchSupported } from "../../helpers/touchSupport";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appImManager from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import appPollsManager, { Poll } from "../../lib/appManagers/appPollsManager";
import $rootScope from "../../lib/rootScope";
import { cancelEvent, cancelSelection, findUpClassName } from "../../helpers/dom";
import ButtonMenu, { ButtonMenuItemOptions } from "../buttonMenu";
import { attachContextMenuListener, openBtnMenu, positionMenu } from "../misc";
import PopupDeleteMessages from "../popupDeleteMessages";
import PopupForward from "../popupForward";
import PopupPinMessage from "../popupUnpinMessage";

export default class ChatContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean, notDirect?: () => boolean})[];
  private element: HTMLElement;

  private target: HTMLElement;
  private isTargetAnAlbumItem: boolean;
  public peerID: number;
  public msgID: number;

  constructor(private attachTo: HTMLElement) {
    const onContextMenu = (e: MouseEvent | Touch) => {
      if(this.init) {
        this.init();
        this.init = null;
      }

      let bubble: HTMLElement, bubbleContainer: HTMLElement;

      try {
        bubbleContainer = findUpClassName(e.target, 'bubble__container');
        bubble = bubbleContainer ? bubbleContainer.parentElement : findUpClassName(e.target, 'bubble');
      } catch(e) {}

      if(e instanceof MouseEvent) e.preventDefault();
      if(this.element.classList.contains('active')) {
        return false;
      }
      if(e instanceof MouseEvent) e.cancelBubble = true;

      const msgID = +bubble.dataset.mid;
      if(!msgID) return;

      this.peerID = $rootScope.selectedPeerID;
      //this.msgID = msgID;
      this.target = e.target as HTMLElement;

      const albumItem = findUpClassName(this.target, 'album-item');
      this.isTargetAnAlbumItem = !!albumItem;
      if(albumItem) {
        this.msgID = +albumItem.dataset.mid;
      } else {
        this.msgID = msgID;
      }

      this.buttons.forEach(button => {
        const good = bubbleContainer || isTouchSupported ? 
          button.verify() : 
          button.notDirect && button.notDirect() && button.verify();
        button.element.classList.toggle('hide', !good);
      });

      const side: 'left' | 'right' = bubble.classList.contains('is-in') ? 'left' : 'right';
      //bubble.parentElement.append(this.element);
      positionMenu(e, this.element, side);
      openBtnMenu(this.element, () => {
        this.peerID = this.msgID = 0;
        this.target = null;
      });
      
      /////this.log('contextmenu', e, bubble, msgID, side);
    };

    if(isTouchSupported) {
      attachTo.addEventListener('click', (e) => {
        //const good = !!findUpClassName(e.target, 'message') || !!findUpClassName(e.target, 'bubble__container');
        const className = (e.target as HTMLElement).className;
        if(!className || !className.includes) return;

        const good = ['bubble', 'bubble__container', 'message', 'time', 'inner'].find(c => className.includes(c));
        if(good) {
          onContextMenu(e);
        }
      });

      attachContextMenuListener(attachTo, (e) => {
        if(appImManager.chatSelection.isSelecting) return;

        cancelSelection();
        cancelEvent(e as any);
        let bubble = findUpClassName(e.target, 'bubble');
        if(bubble) {
          appImManager.chatSelection.toggleByBubble(bubble);
        }
      });
    } else attachContextMenuListener(attachTo, onContextMenu);
  }

  private init = () => {
    this.buttons = [{
      icon: 'reply',
      text: 'Reply',
      onClick: this.onReplyClick,
      verify: () => (this.peerID > 0 || appChatsManager.hasRights(-this.peerID, 'send')) && this.msgID > 0
    }, {
      icon: 'edit',
      text: 'Edit',
      onClick: this.onEditClick,
      verify: () => appMessagesManager.canEditMessage(this.msgID, 'text')
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: this.onCopyClick,
      verify: () => !!appMessagesManager.getMessage(this.msgID).message
    }, {
      icon: 'pin',
      text: 'Pin',
      onClick: this.onPinClick,
      verify: () => {
        const message = appMessagesManager.getMessage(this.msgID);
        // for new layer
        // return this.msgID > 0 && message._ != 'messageService' && appImManager.pinnedMsgID != this.msgID && (this.peerID > 0 || appChatsManager.hasRights(-this.peerID, 'pin'));
        return this.msgID > 0 && message._ != 'messageService' && appImManager.pinnedMsgID != this.msgID && (this.peerID == $rootScope.myID || (this.peerID < 0 && appChatsManager.hasRights(-this.peerID, 'pin')));
      }
    }, {
      icon: 'unpin',
      text: 'Unpin',
      onClick: this.onUnpinClick,
      verify: () => appImManager.pinnedMsgID == this.msgID && appPeersManager.canPinMessage(this.peerID)
    }, {
      icon: 'revote',
      text: 'Revote',
      onClick: this.onRetractVote,
      verify: () => {
        const message = appMessagesManager.getMessage(this.msgID);
        const poll = message.media?.poll as Poll;
        return poll && poll.chosenIndexes.length && !poll.pFlags.closed && !poll.pFlags.quiz;
      }
    }, {
      icon: 'stop',
      text: 'Stop poll',
      onClick: this.onStopPoll,
      verify: () => {
        const message = appMessagesManager.getMessage(this.msgID);
        const poll = message.media?.poll;
        return appMessagesManager.canEditMessage(this.msgID, 'poll') && poll && !poll.pFlags.closed && this.msgID > 0;
      }
    }, {
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick,
      verify: () => this.msgID > 0
    }, {
      icon: 'select',
      text: 'Select',
      onClick: this.onSelectClick,
      verify: () => {
        const message = appMessagesManager.getMessage(this.msgID);
        return !message.action && !appImManager.chatSelection.selectedMids.has(this.msgID);
      },
      notDirect: () => true
    }, {
      icon: 'select',
      text: 'Clear selection',
      onClick: this.onClearSelectionClick,
      verify: () => {
        return appImManager.chatSelection.selectedMids.has(this.msgID);
      },
      notDirect: () => appImManager.chatSelection.selectedMids.has(this.msgID)
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => appMessagesManager.canDeleteMessage(this.msgID)
    }];

    this.element = ButtonMenu(this.buttons);
    this.element.id = 'bubble-contextmenu';
    appImManager.chatInput.parentElement.insertBefore(this.element, appImManager.chatInput);
  };

  private onReplyClick = () => {
    const message = appMessagesManager.getMessage(this.msgID);
    const chatInputC = appImManager.chatInputC;
    const f = () => {
      chatInputC.setTopInfo('reply', f, appPeersManager.getPeerTitle(message.fromID, true), message.message, undefined, message);
      chatInputC.replyToMsgID = this.msgID;
    };
    f();
  };

  private onEditClick = () => {
    appImManager.chatInputC.initMessageEditing(this.msgID);
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
    new PopupPinMessage($rootScope.selectedPeerID, this.msgID);
  };

  private onUnpinClick = () => {
    new PopupPinMessage($rootScope.selectedPeerID, 0);
  };

  private onRetractVote = () => {
    appPollsManager.sendVote(this.msgID, []);
  };

  private onStopPoll = () => {
    appPollsManager.stopPoll(this.msgID);
  };

  private onForwardClick = () => {
    new PopupForward(this.isTargetAnAlbumItem ? [this.msgID] : appMessagesManager.getMidsByMid(this.msgID));
  };

  private onSelectClick = () => {
    appImManager.chatSelection.toggleByBubble(findUpClassName(this.target, 'album-item') || findUpClassName(this.target, 'bubble'));
  };

  private onClearSelectionClick = () => {
    appImManager.chatSelection.cancelSelection();
  };

  private onDeleteClick = () => {
    new PopupDeleteMessages([this.msgID]);
  };
}