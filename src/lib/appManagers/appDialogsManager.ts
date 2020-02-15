import apiManager from "../mtproto/apiManager";
import apiFileManager from '../mtproto/apiFileManager';
import { $rootScope, findUpTag, isElementInViewport, langPack } from "../utils";
import appImManager from "./appImManager";
import appPeersManager from './appPeersManager';
import appMessagesManager from "./appMessagesManager";
import appUsersManager from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ripple } from "../../components/misc";
import appSidebarLeft from "./appSidebarLeft";

type DialogDom = {
  avatarDiv: HTMLDivElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadMessagesSpan: HTMLSpanElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLDivElement,
  listEl: HTMLLIElement
};

export class AppDialogsManager {
  public chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatListArchived = document.getElementById('dialogs-archived') as HTMLUListElement;
  public pinnedDelimiter: HTMLDivElement;
  public chatsHidden: any;
  public chatsArchivedHidden: any;
  
  public myID = 0;
  public doms: {[peerID: number]: DialogDom} = {};
  public domsArchived: {[peerID: number]: DialogDom} = {};
  public lastActiveListElement: HTMLElement = null;

  constructor() {
    this.pinnedDelimiter = document.createElement('div');
    this.pinnedDelimiter.classList.add('pinned-delimiter');
    this.pinnedDelimiter.appendChild(document.createElement('span'));

    apiManager.getUserID().then((id) => {
      this.myID = id;
    });

    $rootScope.$on('user_auth', (e: CustomEvent) => {
      let userAuth = e.detail;
      this.myID = userAuth ? userAuth.id : 0;
    });

    //let chatClosedDiv = document.getElementById('chat-closed');

    this.setListClickListener(this.chatList);
    this.setListClickListener(this.chatListArchived);
  }

  public setListClickListener(list: HTMLUListElement, onFound?: () => void) {
    list.addEventListener('click', (e: Event) => {
      let target = e.target as HTMLElement;
      let elem = target.tagName != 'LI' ? findUpTag(target, 'LI') : target;

      if(!elem) {
        return;
      }

      /* if(this.lastActiveListElement) {
        this.lastActiveListElement.classList.remove('active');
      } */

      if(elem) {
        /* if(chatClosedDiv) {
          chatClosedDiv.style.display = 'none';
        } */

        if(onFound) onFound();

        let peerID = +elem.getAttribute('data-peerID');
        let lastMsgID = +elem.getAttribute('data-mid');
        appImManager.setPeer(peerID, lastMsgID);
        elem.classList.add('active');
        this.lastActiveListElement = elem;
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
      
      div.style.backgroundColor = '';
      div.style.fontSize = '';
      div.classList.add('tgico-savedmessages');
      return true;
    }

    //if(!location || location.empty || !location.photo_small) {
      if(div.firstChild) {
        div.firstChild.remove();
      }

      let color = '';
      if(typeof(peerID) != 'string' && peerID != this.myID) {
        color = appPeersManager.getPeerColorByID(peerID);
      }

      div.classList.remove('tgico-savedmessages');
      div.style.fontSize = '';
      div.style.backgroundColor = color;

      let abbrSplitted = (typeof(peerID) != 'string' ? appPeersManager.getPeerTitle(peerID, true) : peerID).split(' ');
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

  public sortDom(archived = false) {
    //return;

    let dialogs = appMessagesManager.dialogsStorage.dialogs.slice();

    let inUpper: HTMLLIElement[] = [];
    let inBottom: HTMLLIElement[] = [];

    let pinnedDialogs = [];

    let sorted = dialogs;

    if(!archived) {
      for(let i = 0; i < dialogs.length; ++i) {
        let dialog = dialogs[i];
        if(!dialog.pFlags.pinned) break;
        pinnedDialogs.push(dialog);
      }

      if(pinnedDialogs.length) {
        let dom = this.getDialogDom(pinnedDialogs[pinnedDialogs.length - 1].peerID);
        if(dom) {
          dom.listEl.append(this.pinnedDelimiter);
        }
      } else {
        if(this.pinnedDelimiter.parentElement) {
          this.pinnedDelimiter.parentElement.removeChild(this.pinnedDelimiter);
        }
      }

      sorted = sorted.filter((d: any) => !d.pFlags.pinned && d.folder_id != 1);
    } else {
      sorted = sorted.filter((d: any) => d.folder_id == 1);
    }

    sorted = sorted.sort((a: any, b: any) => {
      let timeA = appMessagesManager.getMessage(a.top_message).date;
      let timeB = appMessagesManager.getMessage(b.top_message).date;

      return timeB - timeA;
    });

    if(!archived) {
      sorted = pinnedDialogs.concat(sorted);
    }

    //console.log('sortDom', sorted, this.chatsHidden, this.chatsHidden.up, this.chatsHidden.down);

    let chatList = archived ? this.chatListArchived : this.chatList;
    let chatsHidden = archived ? this.chatsArchivedHidden : this.chatsHidden;

    let hiddenLength: number = chatsHidden.up.length;
    let inViewportLength = chatList.childElementCount;

    chatList.innerHTML = '';

    let inViewportIndex = 0;
    sorted.forEach((d: any, idx) => {
      let dom = this.getDialogDom(d.peerID);
      if(!dom) return;

      if(inUpper.length < hiddenLength) {
        inUpper.push(dom.listEl);
      } else if(inViewportIndex <= inViewportLength - 1) {
        chatList.append(dom.listEl);
        ++inViewportIndex;
        //this.chatList.insertBefore(dom.listEl, this.chatList.children[inViewportIndex++]);
      } else {
        inBottom.push(dom.listEl);
      }

      /* if(this.chatsHidden.up.find((d: HTMLLIElement) => d === dom.listEl)) {
        inUpper.push(dom.listEl);
      } else if(isElementInViewport(dom.listEl)) {
        this.chatList.insertBefore(dom.listEl, this.chatList.children[++inViewportIndex]);
      } else if(this.chatsHidden.down.find((d: HTMLLIElement) => d === dom.listEl)) {
        inBottom.push(dom.listEl);
      } else {
        //console.warn('sortDom found no dom!', dom, d);
      } */

      //this.chatList.append(dom.listEl);
    });

    console.log('sortDom', sorted.length, inUpper.length, chatList.childElementCount, inBottom.length);

    chatsHidden.up = inUpper;
    chatsHidden.down = inBottom;
  }

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom) {
    if(!lastMessage) {
      lastMessage = appMessagesManager.getMessage(dialog.top_message);
    }

    console.log('setlastMessage:', lastMessage);

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
            } else if(document.type == 'round') {
              lastMessageText = '<i>Videomessage' + (lastMessage.message ? ', ' : '') + '</i>';
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

      if(lastMessage.action) {
        // @ts-ignore
        lastMessageText = langPack[lastMessage.action._];
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

    dom.statusSpan.innerHTML = '';
    let lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && 
      lastMessage.from_id == this.myID && lastMessage.peerID != this.myID && 
      dialog.read_outbox_max_id) { // maybe comment, 06.20.2020
      let outgoing = (lastMessage.pFlags && lastMessage.pFlags.unread)
        /*  && dialog.read_outbox_max_id != 0 */; // maybe uncomment, 31.01.2020
    
      //console.log('outgoing', outgoing, lastMessage);
  
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

    // set archived new count
    if(dialog.folder_id == 1) {
      let sum = Object.keys(this.domsArchived).map(p => +p).reduce((acc: number, peerID: number) => {
        let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
        if(dialog) {
          return acc + dialog.unread_count;
        }

        return acc;
      }, 0);

      appSidebarLeft.archivedCount.innerText = '' + sum;
    }
  }

  public getDialogDom(peerID: number) {
    return this.doms[peerID] || this.domsArchived[peerID];
  }

  public addDialog(dialog: {
    peerID: number,
    pFlags: any,
    peer: any,
    folder_id?: number
  }, container?: HTMLUListElement, drawStatus = true) {
    let peerID: number = dialog.peerID;

    if((this.doms[peerID] || this.domsArchived[peerID]) && !container) return;

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

    titleSpan.innerHTML = title;
    //p.classList.add('')
    
    let span = document.createElement('span');
    span.classList.add('user-last-message');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);



    let paddingDiv = document.createElement('div');
    paddingDiv.classList.add('rp');
    paddingDiv.append(avatarDiv, captionDiv);
    ripple(paddingDiv);

    let li = document.createElement('li');
    li.append(paddingDiv);
    li.setAttribute('data-peerID', '' + peerID);
    /* let li = document.createElement('li');
    li.classList.add('rp');
    li.append(avatarDiv, captionDiv);
    li.setAttribute('data-peerID', '' + peerID);

    ripple(li); */

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
      containerEl: paddingDiv,
      listEl: li
    };

    if(!container) {
      if(dialog.folder_id && dialog.folder_id == 1) {
        this.chatListArchived.append(li);
        this.domsArchived[dialog.peerID] = dom;
      } else {
        this.chatList.append(li);
        this.doms[dialog.peerID] = dom;
      }
      
      //this.appendTo.push(li);

      if(dialog.pFlags.pinned) {
        li.classList.add('dialog-pinned');
        //this.chatList.insertBefore(this.pinnedDelimiter, li.nextSibling);
        dom.listEl.append(this.pinnedDelimiter);
      }

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
