import { openBtnMenu, ripple } from "../components/misc";
//import {stackBlurImage} from '../lib/StackBlur';
import Page from "./page";
//import appImManager from '../lib/appManagers/appImManager';

let onFirstMount = () => import('../lib/appManagers/appImManager').then(() => {//import('../lib/services').then(services => {
  //console.log('included services', services);

//export default () => {
  

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

  /* fetch('assets/img/camomile.jpg')
  .then(res => res.blob())
  .then(blob => {
    let img = new Image();
    let url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      let id = 'chat-background-canvas';
      var canvas  = document.getElementById(id) as HTMLCanvasElement;
      //URL.revokeObjectURL(url);

      let elements = ['.chat-container'].map(selector => {
        return document.querySelector(selector) as HTMLDivElement;
      });

      stackBlurImage(img, id, 15, 0);

      canvas.toBlob(blob => {
        //let dataUrl = canvas.toDataURL('image/jpeg', 1);
        let dataUrl = URL.createObjectURL(blob);

        elements.forEach(el => {
          el.style.backgroundImage = 'url(' + dataUrl + ')';
        });
      }, 'image/jpeg', 1);
    };
  }); */

  /* toggleEmoticons.onclick = (e) => {
    if(!emoticonsDropdown) {
      emoticonsDropdown = initEmoticonsDropdown(pageEl, appImManager, 
        appMessagesManager, messageInput, toggleEmoticons);
    } else {
      emoticonsDropdown.classList.toggle('active');
    }

    toggleEmoticons.classList.toggle('active');
  }; */

  (Array.from(document.getElementsByClassName('rp')) as HTMLElement[]).forEach(el => ripple(el));

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
});

const page = new Page('page-chats', false, onFirstMount);
export default page;
