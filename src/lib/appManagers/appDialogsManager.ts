import apiManager from "../mtproto/apiManager";
import apiFileManager from '../mtproto/apiFileManager';
import { $rootScope, findUpTag } from "../utils";
import appImManager from "./appImManager";
import appPeersManager from './appPeersManager';
import appMessagesManager from "./appMessagesManager";
import appUsersManager from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ripple } from "../../components/misc";

type DialogDom = {
  avatarDiv: HTMLDivElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadMessagesSpan: HTMLSpanElement,
  lastMessageSpan: HTMLSpanElement,
  listEl: HTMLLIElement
};

export class AppDialogsManager {
  public pinnedChatList = document.getElementById('dialogs-pinned') as HTMLUListElement;
  public chatList = document.getElementById('dialogs') as HTMLUListElement;
  
  

  public myID = 0;
  public doms: {[x: number]: any} = {};

  constructor() {
    apiManager.getUserID().then((id) => {
      this.myID = id;
    });

    $rootScope.$on('user_auth', (e: CustomEvent) => {
      let userAuth = e.detail;
      this.myID = userAuth ? userAuth.id : 0;
    });

    //let chatClosedDiv = document.getElementById('chat-closed');

    this.setListClickListener(this.pinnedChatList);
    this.setListClickListener(this.chatList);
  }

  public setListClickListener(list: HTMLUListElement, onFound?: () => void) {
    list.addEventListener('click', (e: Event) => {
      let target = e.target as HTMLElement;
      let elem = target.tagName != 'LI' ? findUpTag(target, 'LI') : target;

      if(!elem) {
        return;
      }

      if(elem) {
        /* if(chatClosedDiv) {
          chatClosedDiv.style.display = 'none';
        } */

        if(onFound) onFound();

        let peerID = +elem.getAttribute('data-peerID');
        let lastMsgID = +elem.getAttribute('data-mid');
        appImManager.setPeer(peerID, lastMsgID);
      } else /* if(chatClosedDiv) */ {
        appImManager.setPeer(0);
        //chatClosedDiv.style.display = '';
      }
    });
  }

  public async loadDialogPhoto(div: HTMLDivElement, peerID: number | string, isDialog = false): Promise<boolean> {
    let inputPeer: any;
    let location: any;
    if(typeof(peerID) != 'string') {
      inputPeer = appPeersManager.getInputPeerByID(peerID);
      location = appPeersManager.getPeerPhoto(peerID);
    }

    //console.log('loadDialogPhoto location:', location, inputPeer);

    if(peerID == this.myID && (isDialog || $rootScope.selectedPeerID == this.myID)) {
      if(div.firstChild) {
        div.firstChild.remove();
      }
      
      div.style.fontSize = '';
      div.classList.add('tgico-savedmessages');
      return true;
    }

    //if(!location || location.empty || !location.photo_small) {
      if(div.firstChild) {
        div.firstChild.remove();
      }

      div.classList.remove('tgico-savedmessages');
      div.style.fontSize = '';

      let abbrSplitted = (typeof(peerID) != 'string' ? appPeersManager.getPeerTitle(peerID) : peerID).split(' ');
      let abbr = (abbrSplitted.length == 2 ? 
        abbrSplitted[0][0] + abbrSplitted[1][0] : 
        abbrSplitted[0][0]).toUpperCase();

      //div.innerText = peer.initials.toUpperCase();
      div.innerText = abbr.toUpperCase();
      //return Promise.resolve(true);
    //}

    if(!location || location.empty || !location.photo_small) {
      return true;
    }

    let res = await apiFileManager.downloadSmallFile({
      _: 'inputPeerPhotoFileLocation', 
      dc_id: location.dc_id, 
      flags: 0, 
      peer: inputPeer, 
      volume_id: location.photo_small.volume_id, 
      local_id: location.photo_small.local_id
    });

    let img = new Image();
    img.src = URL.createObjectURL(res);
    div.innerHTML = '';
    div.style.fontSize = '0'; // need
    div.append(img);

    return true;
  }

  public sortDom() {
    /* let sorted =  */appMessagesManager.dialogsStorage.dialogs
    .filter((d: any) => !d.pFlags.pinned)
    .sort((a: any, b: any) => {
      let timeA = appMessagesManager.getMessage(a.top_message).date;
      let timeB = appMessagesManager.getMessage(b.top_message).date;

      return timeB - timeA;
    })
    .forEach((d: any) => {
      let dom = this.getDialogDom(d.peerID);
      if(!dom) return;

      this.chatList.append(dom.listEl);
    });
  }

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom) {
    if(!lastMessage) {
      lastMessage = appMessagesManager.getMessage(dialog.top_message);
    }

    if(lastMessage._ == 'messageEmpty') return;

    if(!dom) {
      dom = this.getDialogDom(dialog.peerID);
    }

    let peer = dialog.peer;
    let peerID = dialog.peerID;
    //let peerID = appMessagesManager.getMessagePeer(lastMessage);

    //console.log('setting last message:', lastMessage);

    /* if(!dom.lastMessageSpan.classList.contains('user-typing')) */ {
      let lastMessageText = '';

      if(lastMessage.media) {
        switch(lastMessage.media._) {
          case 'messageMediaPhoto':
            lastMessageText += '<i>Photo' + (lastMessage.message ? ', ' : '') + '</i>';
            break;
          case 'messageMediaGeo':
            lastMessageText += '<i>Geolocation</i>';
            break;
          case 'messageMediaDocument':
            let document = lastMessage.media.document;
  
            let found = false;
            for(let attribute of document.attributes) {
              if(found) break;
  
              switch(attribute._) {
                case 'documentAttributeSticker':
                  lastMessageText += RichTextProcessor.wrapRichText(attribute.alt) + '<i>Sticker</i>';
                  found = true;
                  break;
                case 'documentAttributeFilename':
                  lastMessageText += '<i>' + attribute.file_name + '</i>';
                  found = true;
                  break;
                /* default:
                  console.warn('Got unknown document type!', lastMessage);
                  break; */
              }
            }
  
            if(document.type == 'video') {
              lastMessageText = '<i>Video' + (lastMessage.message ? ', ' : '') + '</i>';
              found = true;
            } else if(document.type == 'voice') {
              lastMessageText = '<i>Voice message</i>';
              found = true;
            } else if(document.type == 'gif') {
              lastMessageText = '<i>GIF' + (lastMessage.message ? ', ' : '') + '</i>';
              found = true;
            }
  
            if(found) {
              break;
            }
  
          default:
            console.warn('Got unknown lastMessage.media type!', lastMessage);
            break;
        }
      }
      
      dom.lastMessageSpan.innerHTML = lastMessageText + 
        (lastMessage.message ? RichTextProcessor.wrapRichText(lastMessage.message.replace(/\n/g, ' '), {noLinebreakers: true}) : '');
  
      /* if(lastMessage.from_id == auth.id) { // You:  */
      if(peer._ != 'peerUser' && peerID != -lastMessage.from_id) {
        let sender = appUsersManager.getUser(lastMessage.from_id);
        if(sender && sender.id) {
          let senderBold = document.createElement('b');

          let str = '';
          if(sender.id == this.myID) {
            str = 'You';
          } else {
            str = sender.first_name || sender.last_name || sender.username;
          }

          senderBold.innerText = str + ': ';
          //console.log(sender, senderBold.innerText);
          dom.lastMessageSpan.prepend(senderBold);
        } else console.log('no sender', lastMessage, peerID);
      }
    }

    let timeStr = '';
    let timestamp = lastMessage.date;
    let now = Date.now() / 1000;
    let time = new Date(lastMessage.date * 1000);

    if((now - timestamp) < 86400) { // if < 1 day
      timeStr = ('0' + time.getHours()).slice(-2) + 
        ':' + ('0' + time.getMinutes()).slice(-2);
    } else if((now - timestamp) < (86400 * 7)) { // week
      let date = new Date(timestamp * 1000);
      timeStr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    } else {
      let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      timeStr = months[time.getMonth()] + 
        ' ' + ('0' + time.getDate()).slice(-2);
    }

    dom.lastTimeSpan.innerHTML = timeStr;

    dom.listEl.setAttribute('data-mid', lastMessage.mid);

    if(this.doms[peerID]) {
      this.setUnreadMessages(dialog);
    }
  }

  public setUnreadMessages(dialog: any) {
    let dom = this.getDialogDom(dialog.peerID);

    if(dialog.peerID == 228260936) {
      console.log('dialog setUnreadMessages', dialog);
    }

    dom.statusSpan.innerHTML = '';
    let lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && 
      lastMessage.from_id == this.myID && lastMessage.peerID != this.myID && 
      dialog.read_outbox_max_id) { // maybe comment, 06.20.2020
      let outgoing = (lastMessage.pFlags && lastMessage.pFlags.unread)
        /*  && dialog.read_outbox_max_id != 0 */; // maybe uncomment, 31.01.2020
    
      console.log('outgoing', outgoing, lastMessage);
  
      if(outgoing) {
        dom.statusSpan.classList.remove('tgico-checks');
        dom.statusSpan.classList.add('tgico-check');
      } else {
        dom.statusSpan.classList.remove('tgico-check');
        dom.statusSpan.classList.add('tgico-checks');
      }
    } else dom.statusSpan.classList.remove('tgico-check', 'tgico-checks');

    dom.unreadMessagesSpan.innerHTML = '';
    if(dialog.unread_count) {
      dom.unreadMessagesSpan.innerHTML = dialog.unread_count;
      dom.unreadMessagesSpan.classList.remove('tgico-pinnedchat');
      dom.unreadMessagesSpan.classList.add(new Date(dialog.notify_settings.mute_until * 1000) > new Date() ? 
      'unread-muted' : 'unread');
    } else if(dialog.pFlags.pinned) {
      dom.unreadMessagesSpan.classList.remove('unread', 'unread-muted');
      dom.unreadMessagesSpan.classList.add('tgico-pinnedchat');
    }
  }

  public getDialogDom(peerID: number) {
    return this.doms[peerID] as DialogDom;
  }

  public addDialog(dialog: {
    peerID: number,
    pFlags: any,
    peer: any
  }, container?: HTMLUListElement, drawStatus = true) {
    let peerID: number = dialog.peerID;

    if((peerID in this.doms) && !container) return;

    let title = appPeersManager.getPeerTitle(peerID);

    let avatarDiv = document.createElement('div');
    avatarDiv.classList.add('user-avatar');

    if(drawStatus && peerID != this.myID) {
      let peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          let user = appUsersManager.getUser(peerID);
          //console.log('found user', user);
  
          if(user.status && user.status._ == 'userStatusOnline') {
            avatarDiv.classList.add('is-online');
          }
  
          break;
        default:
          break;
      }
    }

    let captionDiv = document.createElement('div');
    captionDiv.classList.add('user-caption');

    let titleSpan = document.createElement('span');
    titleSpan.classList.add('user-title');

    if(peerID == this.myID) {
      title = 'Saved Messages';
    } 

    //console.log('trying to load photo for:', title);
    this.loadDialogPhoto(avatarDiv, dialog.peerID, true);

    titleSpan.innerText = title;
    //p.classList.add('')
    
    let span = document.createElement('span');
    span.classList.add('user-last-message');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    let li = document.createElement('li');
    li.classList.add('rp');
    li.append(avatarDiv, captionDiv);
    li.setAttribute('data-peerID', '' + peerID);

    ripple(li);

    /* let detailsDiv = document.createElement('div');
    detailsDiv.classList.add('dialog-details'); */

    let statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status');

    let lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    let unreadMessagesSpan = document.createElement('span');

    let titleP = document.createElement('p');

    let rightSpan = document.createElement('span');
    rightSpan.append(statusSpan, lastTimeSpan);
    titleP.append(titleSpan, rightSpan);

    let messageP = document.createElement('p');
    messageP.append(span, unreadMessagesSpan);

    captionDiv.append(titleP, messageP);

    let dom: DialogDom = {
      avatarDiv,
      captionDiv,
      titleSpan,
      statusSpan,
      lastTimeSpan,
      unreadMessagesSpan,
      lastMessageSpan: span,
      listEl: li
    };

    if(!container) {
      (dialog.pFlags.pinned ? this.pinnedChatList : this.chatList).append(li);
      this.doms[dialog.peerID] = dom;
      this.setLastMessage(dialog);
    } else {
      container.append(li);
    }
    
    return {dom, dialog};
  }

  public setTyping(dialog: any, user: any) {
    let dom = this.getDialogDom(dialog.peerID);

    let str = '';

    let senderBold = document.createElement('i');
    if(dialog.peerID < 0) str = (user.first_name || user.last_name || user.username) + ' ';
    str += 'typing...';
    senderBold.innerText = str;

    dom.lastMessageSpan.innerHTML = '';
    dom.lastMessageSpan.append(senderBold);
    dom.lastMessageSpan.classList.add('user-typing');
  }

  public unsetTyping(dialog: any) {
    let dom = this.getDialogDom(dialog.peerID);
    dom.lastMessageSpan.classList.remove('user-typing');
    this.setLastMessage(dialog, null, dom);
  }
}

export default new AppDialogsManager();
