//import {stackBlurImage} from '../lib/StackBlur';
//import appStateManager from "../lib/appManagers/appStateManager";
import { blurActiveElement } from "../helpers/dom";
import appStateManager from "../lib/appManagers/appStateManager";
import Page from "./page";

let onFirstMount = () => {
  //return;
  appStateManager.pushToState('authState', {_: 'authStateSignedIn'});
  // ! TOO SLOW
  /* appStateManager.saveState(); */

  import('../lib/rootScope').then(m => {
    m.default.broadcast('im_mount');
  });

  blurActiveElement();
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      const promise = import('../lib/appManagers/appDialogsManager');
      promise.finally(async() => {
        //alert('pageIm!');
        resolve();
    
        //AudioContext && global.navigator && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia && global.WebAssembly;
    
        /* // @ts-ignore
        var AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        alert('AudioContext:' + typeof(AudioContext));
        // @ts-ignore
        alert('global.navigator:' + typeof(navigator));
        alert('navigator.mediaDevices:' + typeof(navigator.mediaDevices));
        alert('navigator.mediaDevices.getUserMedia:' + typeof(navigator.mediaDevices?.getUserMedia));
        alert('global.WebAssembly:' + typeof(WebAssembly)); */
    
        //(Array.from(document.getElementsByClassName('rp')) as HTMLElement[]).forEach(el => ripple(el));
    
        const misc = await import("../components/buttonMenuToggle");
        Array.from(document.getElementsByClassName('btn-menu-toggle')).forEach((el) => {
          misc.ButtonMenuToggleHandler(el as HTMLElement);
        });
      });
    });
  });

  //let promise = /* Promise.resolve() */.then(() => {//import('../lib/services').then(services => {
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
  //});
};

const page = new Page('page-chats', false, onFirstMount);
export default page;
