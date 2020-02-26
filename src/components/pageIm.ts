//import { appImManager, appMessagesManager, appDialogsManager, apiUpdatesManager, appUsersManager } from "../lib/services";
import { openBtnMenu } from "./misc";
import {stackBlurImage} from '../lib/StackBlur';
import appSidebarLeft from "../lib/appManagers/appSidebarLeft";

export default () => import('../lib/services').then(services => {
  //console.log('included services', services);

  let {appImManager, appMessagesManager, appDialogsManager, apiUpdatesManager, appUsersManager} = services;
//export default () => {

  let pageEl = document.body.getElementsByClassName('page-chats')[0] as HTMLDivElement;
  pageEl.style.display = '';

  apiUpdatesManager.attach();

  // @ts-ignore
  document.addEventListener('user_update', (e: CustomEvent) => {
    let userID = e.detail;

    let user = appUsersManager.getUser(userID);

    let dialog = appMessagesManager.getDialogByPeerID(user.id)[0];
    //console.log('updating user:', user, dialog);

    if(dialog && !appUsersManager.isBot(dialog.peerID) && dialog.peerID != appImManager.myID) {
      let online = user.status._ == 'userStatusOnline';
      let dom = appDialogsManager.getDialogDom(dialog.peerID);

      if(dom) {
        if(online) {
          dom.avatarDiv.classList.add('is-online');
        } else {
          dom.avatarDiv.classList.remove('is-online');
        }
      }
    }

    if(appImManager.peerID == user.id) {
      appImManager.setPeerStatus();
    }
  });

  // @ts-ignore
  document.addEventListener('dialog_top', (e: CustomEvent) => {
    let dialog: any = e.detail;

    appDialogsManager.setLastMessage(dialog);
    appDialogsManager.sortDom();
  });

  // @ts-ignore
  document.addEventListener('dialogs_multiupdate', (e: CustomEvent) => {
    let dialogs = e.detail;

    let performed = 0;
    for(let id in dialogs) {
      let dialog = dialogs[id];

      /////console.log('updating dialog:', dialog);

      ++performed;

      if(!(dialog.peerID in appDialogsManager.doms)) {
        appDialogsManager.addDialog(dialog);
        continue;
      } 

      appDialogsManager.setLastMessage(dialog);
    }

    if(performed/*  && false */) {
      /////////console.log('will sortDom');
      appDialogsManager.sortDom();
      appDialogsManager.sortDom(true);
    }
  });

  // @ts-ignore
  document.addEventListener('dialog_unread', (e: CustomEvent) => {
    let info: {
      peerID: number,
      count: number
    } = e.detail;

    let dialog = appMessagesManager.getDialogByPeerID(info.peerID)[0];
    if(dialog) {
      appDialogsManager.setUnreadMessages(dialog);

      if(dialog.peerID == appImManager.peerID) {
        appImManager.updateUnreadByDialog(dialog);
      }
    }
  });
/* 
  loadDialogs().then(result => {
    //appImManager.setScroll(chatScroll);
  });
  return;
 */
  

  /* function placeCaretAfterNode(node: HTMLElement) {
    if (typeof window.getSelection != "undefined") {
        var range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

  messageInput.onclick = (e) => {
    let target = e.target as HTMLElement;
    if(target.classList.contains('emoji-inner')) {
      placeCaretAfterNode(target.parentElement);
    } else if(target.classList.contains('emoji-sizer')) {
      placeCaretAfterNode(target);
    }
    console.log('lol', target);
  }; */

  /* window.addEventListener('click', function(this, e) {
    // @ts-ignore
    let isInput = e.target.tagName == 'INPUT';
    if(!isInput && !window.getSelection().toString()) {
      console.log('click');
      messageInput.focus();
    }
  }); */

  fetch('assets/img/camomile.jpg')
  .then(res => res.blob())
  .then(blob => {
    let img = new Image();
    let url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      let id = 'chat-background-canvas';
      var canvas  = document.getElementById(id) as HTMLCanvasElement;
      URL.revokeObjectURL(url);

      stackBlurImage(img, id, 15, 0);

      canvas.toBlob(blob => {
        //let dataUrl = canvas.toDataURL('image/jpeg', 1);
        let dataUrl = URL.createObjectURL(blob);

        [/* '.chat-background', '#chat-closed' */'.chat-container'].forEach(selector => {
          let bg = document.querySelector(selector) as HTMLDivElement;
          bg.style.backgroundImage = 'url(' + dataUrl + ')';
        });
      }, 'image/jpeg', 1);
    };
  });

  /* toggleEmoticons.onclick = (e) => {
    if(!emoticonsDropdown) {
      emoticonsDropdown = initEmoticonsDropdown(pageEl, appImManager, 
        appMessagesManager, messageInput, toggleEmoticons);
    } else {
      emoticonsDropdown.classList.toggle('active');
    }

    toggleEmoticons.classList.toggle('active');
  }; */

  Array.from(document.getElementsByClassName('btn-menu-toggle')).forEach((el) => {
    el.addEventListener('click', (e) => {
      //console.log('click pageIm');
      if(!el.classList.contains('btn-menu-toggle')) return false;

      //window.removeEventListener('mousemove', onMouseMove);
      let openedMenu = el.querySelector('.btn-menu') as HTMLDivElement;
      e.cancelBubble = true;

      if(el.classList.contains('menu-open')) {
        el.classList.remove('menu-open');
        openedMenu.classList.remove('active');
      } else {
        openBtnMenu(openedMenu);
      }
    });
  });

  appSidebarLeft.loadDialogs().then(result => {
    //appSidebarLeft.onChatsScroll();
    appSidebarLeft.loadDialogs(true);
  });
});
