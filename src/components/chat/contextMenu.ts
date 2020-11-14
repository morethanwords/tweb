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
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean, notDirect?: () => boolean, withSelection?: true})[];
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

      // ! context menu click by date bubble (there is no pointer-events)
      if(!bubble) return;

      if(e instanceof MouseEvent) e.preventDefault();
      if(this.element.classList.contains('active')) {
        return false;
      }
      if(e instanceof MouseEvent) e.cancelBubble = true;

      let mid = +bubble.dataset.mid;
      if(!mid) return;

      // * если открыть контекстное меню для альбома не по бабблу, и последний элемент не выбран, чтобы показать остальные пункты
      if(appImManager.chatSelection.isSelecting && !bubbleContainer) {
        const mids = appMessagesManager.getMidsByMid(mid);
        if(mids.length > 1) {
          const selectedMid = appImManager.chatSelection.selectedMids.has(mid) ? mid : mids.find(mid => appImManager.chatSelection.selectedMids.has(mid));
          if(selectedMid) {
            mid = selectedMid;
          }
        }
      }

      this.peerID = $rootScope.selectedPeerID;
      //this.msgID = msgID;
      this.target = e.target as HTMLElement;

      const albumItem = findUpClassName(this.target, 'album-item');
      this.isTargetAnAlbumItem = !!albumItem;
      if(albumItem) {
        this.msgID = +albumItem.dataset.mid;
      } else {
        this.msgID = mid;
      }

      this.buttons.forEach(button => {
        let good: boolean;

        //if((appImManager.chatSelection.isSelecting && !button.withSelection) || (button.withSelection && !appImManager.chatSelection.isSelecting)) {
        if(appImManager.chatSelection.isSelecting && !button.withSelection) {
          good = false;
        } else {
          good = bubbleContainer || isTouchSupported ? 
            button.verify() : 
            button.notDirect && button.verify() && button.notDirect();
        }

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

        const good = ['bubble', 'bubble__container', 'message', 'time', 'inner'].find(c => className.match(new RegExp(c + '($|\\s)')));
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
      icon: 'copy',
      text: 'Copy selected',
      onClick: this.onCopyClick,
      verify: () => appImManager.chatSelection.selectedMids.has(this.msgID) && !![...appImManager.chatSelection.selectedMids].find(mid => !!appMessagesManager.getMessage(mid).message),
      notDirect: () => true,
      withSelection: true
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
      icon: 'forward',
      text: 'Forward selected',
      onClick: this.onForwardClick,
      verify: () => appImManager.chatSelection.selectedMids.has(this.msgID) && !appImManager.chatSelection.selectionForwardBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Select',
      onClick: this.onSelectClick,
      verify: () => {
        const message = appMessagesManager.getMessage(this.msgID);
        return !message.action && !appImManager.chatSelection.selectedMids.has(this.msgID);
      },
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Clear selection',
      onClick: this.onClearSelectionClick,
      verify: () => appImManager.chatSelection.selectedMids.has(this.msgID),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => appMessagesManager.canDeleteMessage(this.msgID)
    }, {
      icon: 'delete danger',
      text: 'Delete selected',
      onClick: this.onDeleteClick,
      verify: () => appImManager.chatSelection.selectedMids.has(this.msgID) && !appImManager.chatSelection.selectionDeleteBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
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
    const mids = appImManager.chatSelection.isSelecting ? [...appImManager.chatSelection.selectedMids] : [this.msgID];
    const str = mids.reduce((acc, mid) => {
      const message = appMessagesManager.getMessage(mid);
      return acc + (message?.message ? message.message + '\n' : '');
    }, '').trim();
    
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
    if(appImManager.chatSelection.isSelecting) {
      appImManager.chatSelection.selectionForwardBtn.click();
    } else {
      new PopupForward(this.isTargetAnAlbumItem ? [this.msgID] : appMessagesManager.getMidsByMid(this.msgID));
    }
  };

  private onSelectClick = () => {
    appImManager.chatSelection.toggleByBubble(findUpClassName(this.target, 'album-item') || findUpClassName(this.target, 'bubble'));
  };

  private onClearSelectionClick = () => {
    appImManager.chatSelection.cancelSelection();
  };

  private onDeleteClick = () => {
    if(appImManager.chatSelection.isSelecting) {
      appImManager.chatSelection.selectionDeleteBtn.click();
    } else {
      new PopupDeleteMessages(this.isTargetAnAlbumItem ? [this.msgID] : appMessagesManager.getMidsByMid(this.msgID));
    }
  };
}