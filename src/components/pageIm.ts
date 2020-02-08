//import { appImManager, appMessagesManager, appDialogsManager, apiUpdatesManager, appUsersManager } from "../lib/services";
import { putPreloader, horizontalMenu, wrapSticker, MTDocument, LazyLoadQueue, scrollable } from "./misc";

import { isElementInViewport, whichChild, findUpTag } from "../lib/utils";
import {stackBlurImage} from '../lib/StackBlur';
import * as Config from '../lib/config';
import { RichTextProcessor } from "../lib/richtextprocessor";
import { MTProto } from "../lib/mtproto/mtproto";
import lottieLoader from "../lib/lottieLoader";
import CryptoWorker from '../lib/crypto/cryptoworker';

import appStickersManager, { MTStickerSet } from "../lib/appManagers/appStickersManager";
import { AppImManager } from "../lib/appManagers/appImManager";
import { AppMessagesManager } from "../lib/appManagers/appMessagesManager";
import appSidebarRight from "../lib/appManagers/appSidebarRight";

const EMOTICONSSTICKERGROUP = 'emoticons-dropdown';

let initEmoticonsDropdown = (pageEl: HTMLDivElement, 
  appImManager: AppImManager, appMessagesManager: AppMessagesManager, 
  messageInput: HTMLDivElement, toggleEl: HTMLButtonElement, btnSend: HTMLButtonElement) => {
  let dropdown = pageEl.querySelector('.emoji-dropdown') as HTMLDivElement;
  dropdown.classList.add('active'); // need

  let lazyLoadQueue = new LazyLoadQueue();

  let container = pageEl.querySelector('.emoji-container .tabs-container') as HTMLDivElement;
  let tabs = pageEl.querySelector('.emoji-dropdown .emoji-tabs') as HTMLUListElement;
  horizontalMenu(tabs, container, (id) => {
    lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);

    if(id == 1 && stickersInit) {
      stickersInit();
    }
  }, () => {
    lottieLoader.checkAnimations(false, EMOTICONSSTICKERGROUP);
    lazyLoadQueue.check(); // for stickers
  });
  (tabs.children[0] as HTMLLIElement).click(); // set media

  let emoticonsMenuOnClick = (menu: HTMLUListElement, heights: number[], scroll: HTMLDivElement) => {
    menu.addEventListener('click', function(e) {
      let target = e.target as HTMLLIElement;
      target = findUpTag(target, 'LI');

      let index = whichChild(target);
      let y = heights[index - 1/* 2 */] || 0; // 10 == padding .scrollable

      //console.log(target, index, heights, y, scroll);

      //scroll.scroll({y: y + 'px'});
      scroll.scrollTop = y;
    });
  };

  let emoticonsContentOnScroll = (menu: HTMLUListElement, heights: number[], prevCategoryIndex: number, scroll: HTMLDivElement) => {
    let pos = scroll.scroll();
    let y = scroll.scrollTop;

    //console.log(heights, y);

    for(let i = 0; i < heights.length; ++i) {
      let height = heights[i];
      if(y < height) {
        menu.children[prevCategoryIndex].classList.remove('active');
        prevCategoryIndex = i/*  + 1 */;
        menu.children[prevCategoryIndex].classList.add('active');

        break;
      }
    }

    return prevCategoryIndex;
  };

  {
    let categories = ["Smileys & Emotion", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", "Symbols", "Flags", "Skin Tones"];
    let divs: {
      [category: string]: HTMLDivElement
    } = {};

    let keyCategory = Config.Emoji.keyCategory;
    let sorted: {
      [category: string]: any[]
    } = {};

    for(let unified in Config.Emoji.emoji) {
      // @ts-ignore
      let details = Config.Emoji.emoji[unified];
      let category = details[keyCategory];

      details.unified = unified;

      if(!sorted[category]) sorted[category] = [];
      sorted[category][details.sort_order] = details;
    }

    Object.keys(sorted).forEach(c => sorted[c].sort());

    categories.pop();
    delete sorted["Skin Tones"];

    console.time('emojiParse');
    for(let category in sorted) {
      let div = document.createElement('div');
      div.classList.add('emoji-category');

      let emojis = sorted[category];
      emojis.forEach(details => {
        let emoji = details.unified;
        //let emoji = (details.unified as string).split('-')
          //.reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

        let spanEmoji = document.createElement('span');
        let kek = RichTextProcessor.wrapRichText(emoji);

        if(!kek.includes('emoji')) {
          console.log(details, emoji, kek, spanEmoji, emoji.length, new TextEncoder().encode(emoji));
          return;
        }

        //console.log(kek);

        spanEmoji.innerHTML = kek;

        //spanEmoji = spanEmoji.firstElementChild as HTMLSpanElement;
        //spanEmoji.setAttribute('emoji', emoji);
        div.appendChild(spanEmoji);
      });

      divs[category] = div;
    }
    console.timeEnd('emojiParse');

    let heights: number[] = [0];

    let contentEmojiDiv = document.getElementById('content-emoji') as HTMLDivElement;
    categories.forEach(category => {
      let div = divs[category];

      if(!div) {
        console.error('no div by category:', category);
      }

      contentEmojiDiv.append(div);
      heights.push((heights[heights.length - 1] || 0) + div.scrollHeight);

      //console.log(div, div.scrollHeight);
    });

    contentEmojiDiv.addEventListener('click', function(e) {
      let target = e.target as any;
      //if(target.tagName != 'SPAN') return;

      if(target.tagName == 'SPAN' && !target.classList.contains('emoji')) {
        target = target.firstElementChild;
      } else if(target.tagName == 'DIV') return;

      //console.log('contentEmoji div', target);

      /* if(!target.classList.contains('emoji')) {
        target = target.parentElement as HTMLSpanElement;

        if(!target.classList.contains('emoji')) {
          return;
        }
      }  */

      //messageInput.innerHTML += target.innerHTML;
      messageInput.innerHTML += target.outerHTML;

      btnSend.classList.add('tgico-send');
      btnSend.classList.remove('tgico-microphone2');
    });

    let prevCategoryIndex = 1;
    let menu = contentEmojiDiv.nextElementSibling as HTMLUListElement;
    let emojiScroll = scrollable(contentEmojiDiv);
    emojiScroll.addEventListener('scroll', (e) => {
      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, emojiScroll);
    });

    emoticonsMenuOnClick(menu, heights, emojiScroll);
  }

  let stickersInit = () => {
    let contentStickersDiv = document.getElementById('content-stickers') as HTMLDivElement;
    //let stickersDiv = contentStickersDiv.querySelector('.os-content') as HTMLDivElement;

    let menuWrapper = contentStickersDiv.nextElementSibling as HTMLDivElement;
    let menu = menuWrapper.firstElementChild as HTMLUListElement;

    let menuScroll = scrollable(menuWrapper, true, false);

    let stickersDiv = document.createElement('div');
    stickersDiv.classList.add('stickers-categories');
    contentStickersDiv.append(stickersDiv);

    stickersDiv.addEventListener('mouseover', (e) => {
      let target = e.target as HTMLElement;

      if(target.tagName == 'CANVAS') { // turn on sticker
        let animation = lottieLoader.getAnimation(target.parentElement, EMOTICONSSTICKERGROUP);

        if(animation) {
          // @ts-ignore
          if(animation.currentFrame == animation.totalFrames - 1) {
            animation.goToAndPlay(0, true);
          } else {
            animation.play();
          }
        }
      }
    });

    stickersDiv.addEventListener('click', (e) => {
      let target = e.target as HTMLDivElement;
      target = findUpTag(target, 'DIV');
      
      let fileID = target.getAttribute('file-id');
      let document = appStickersManager.getSticker(fileID);

      if(document) {
        appMessagesManager.sendFile(appImManager.peerID, document, {isMedia: true});
        appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;
        dropdown.classList.remove('active');
        toggleEl.classList.remove('active');
      } else {
        console.warn('got no sticker by id:', fileID);
      }
    });

    let heights: number[] = [];

    let categoryPush = (categoryDiv: HTMLDivElement, docs: MTDocument[], prepend?: boolean) => {
      //if((docs.length % 5) != 0) categoryDiv.classList.add('not-full');

      docs.forEach(doc => {
        let div = document.createElement('div');
        wrapSticker(doc, div, undefined, lazyLoadQueue, EMOTICONSSTICKERGROUP, true);

        categoryDiv.append(div);
      });

      /* if(prepend) {
        stickersDiv.prepend(categoryDiv);
      } else {
        stickersDiv.append(categoryDiv);
      } */

      setTimeout(() => lazyLoadQueue.check(), 0);

      /* let scrollHeight = categoryDiv.scrollHeight;
      let prevHeight = heights[heights.length - 1] || 0;
      //console.log('scrollHeight', scrollHeight, categoryDiv, stickersDiv.childElementCount);
      if(prepend && heights.length) {// all stickers loaded faster than recent
        heights.forEach((h, i) => heights[i] += scrollHeight);

        return heights.unshift(scrollHeight) - 1;
      } */

      heights.length = 0;
      Array.from(stickersDiv.children).forEach((div, i) => {
        heights[i] = (heights[i - 1] || 0) + div.scrollHeight;
      });

      //return heights.push(prevHeight + scrollHeight) - 1;
    };

    MTProto.apiManager.invokeApi('messages.getRecentStickers', {flags: 0, hash: 0}).then((res) => {
      let stickers: {
        _: string,
        hash: number,
        packs: any[],
        stickers: MTDocument[],
        dates: number[]
      } = res as any;

      let categoryDiv = document.createElement('div');
      categoryDiv.classList.add('sticker-category');

      stickersDiv.prepend(categoryDiv);
      
      categoryPush(categoryDiv, stickers.stickers, true);
    });

    MTProto.apiManager.invokeApi('messages.getAllStickers', {hash: 0}).then((res) => {
      let stickers: {
        _: 'messages.allStickers',
        hash: number,
        sets: Array<MTStickerSet>
      } = res as any;

      stickers.sets/* .slice(0, 10) */.forEach(async(set) => {
        let categoryDiv = document.createElement('div');
        categoryDiv.classList.add('sticker-category');

        let li = document.createElement('li');
        li.classList.add('btn-icon');

        menu.append(li);

        stickersDiv.append(categoryDiv);

        let stickerSet = await appStickersManager.getStickerSet(set);
        
        if(stickerSet.set.thumb) {
          let thumb = stickerSet.set.thumb;

          appStickersManager.getStickerSetThumb(stickerSet.set).then(async(blob) => {
            if(thumb.w == 1 && thumb.h == 1) {
              const reader = new FileReader();

              reader.addEventListener('loadend', async(e) => {
                // @ts-ignore
                const text = e.srcElement.result;
                let json = await CryptoWorker.gzipUncompress<string>(text, true);

                let animation = await lottieLoader.loadAnimation({
                  container: li,
                  loop: true,
                  autoplay: false,
                  animationData: JSON.parse(json)
                }, EMOTICONSSTICKERGROUP);
              });

              reader.readAsArrayBuffer(blob);
            } else {
              let image = new Image();
              image.src = URL.createObjectURL(blob);
  
              li.append(image);
            }
          });
        } else { // as thumb will be used first sticker
          wrapSticker(stickerSet.documents[0], li as any, undefined, undefined, EMOTICONSSTICKERGROUP); // kostil
        }

        categoryPush(categoryDiv, stickerSet.documents);
      });
    });

    let prevCategoryIndex = 0;
    let stickersScroll = scrollable(contentStickersDiv);
    stickersScroll.addEventListener('scroll', (e) => {
      lazyLoadQueue.check();
      lottieLoader.checkAnimations();

      prevCategoryIndex = emoticonsContentOnScroll(menu, heights, prevCategoryIndex, stickersScroll);
    });

    emoticonsMenuOnClick(menu, heights, stickersScroll);

    stickersInit = null;
  };

  return {dropdown, lazyLoadQueue};
};

export default () => import('../lib/services').then(services => {
  console.log('included services', services);

  let {appImManager, appMessagesManager, appDialogsManager, apiUpdatesManager, appUsersManager} = services;
//export default () => {
  let chatsContainer = document.getElementById('chats-container') as HTMLDivElement;
  let d = document.createElement('div');
  d.classList.add('preloader');
  putPreloader(d);
  chatsContainer.append(d);

  let pageEl = document.body.getElementsByClassName('page-chats')[0] as HTMLDivElement;
  pageEl.style.display = '';

  const loadCount = Math.round(document.body.scrollHeight / 70 * 1.5);

  let chatsScroll = scrollable(chatsContainer as HTMLDivElement);
  let sidebarScroll = scrollable(document.body.querySelector('.profile-container'));
  let chatScroll = scrollable(document.getElementById('bubbles') as HTMLDivElement);

  apiUpdatesManager.attach();

  let offsetIndex = 0;
  let loadDialogsPromise: Promise<any>;
  let loadDialogs = async() => {
    if(loadDialogsPromise) return loadDialogsPromise;

    chatsContainer.append(d);

    //let offset = appMessagesManager.generateDialogIndex();/* appMessagesManager.dialogsNum */;

    try {
      loadDialogsPromise = appMessagesManager.getConversations('', offsetIndex, loadCount);

      let result = await loadDialogsPromise;

      console.log('loaded ' + loadCount + ' dialogs by offset:', offsetIndex, result);

      if(result && result.dialogs && result.dialogs.length) {
        offsetIndex = result.dialogs[result.dialogs.length - 1].index;
        result.dialogs.forEach((dialog: any) => {
          appDialogsManager.addDialog(dialog);
        });
      }
    } catch(err) {
      console.error(err);
    }

    d.remove();
    loadDialogsPromise = undefined;
  };

  let onScroll = () => {
    if(!loadDialogsPromise) {
      let d = Array.from(appDialogsManager.chatList.childNodes).slice(-5);
      for(let node of d) {
        if(isElementInViewport(node)) {
          loadDialogs();
          break;
        }
      }

      //console.log('last 5 dialogs:', d);
    }
  };

  chatsScroll.addEventListener('scroll', onScroll);
  window.addEventListener('resize', () => {
    setTimeout(onScroll, 0);
  });

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
  document.addEventListener('history_multiappend', (e: CustomEvent) => {
    //let msgIDsByPeer = e.detail;

    appDialogsManager.sortDom();
  });

  // @ts-ignore
  document.addEventListener('dialog_top', (e: CustomEvent) => {
    let dialog: any = e.detail;

    appDialogsManager.setLastMessage(dialog);
    appDialogsManager.sortDom();
  });

  // @ts-ignore
  document.addEventListener('history_delete', (e: CustomEvent) => {
    let detail: {
      peerID: string,
      msgs: {[x: number]: boolean}
    } = e.detail;

    appImManager.deleteMessagesByIDs(Object.keys(detail.msgs).map(s => +s));
  });

  // @ts-ignore
  document.addEventListener('dialogs_multiupdate', (e: CustomEvent) => {
    let dialogs = e.detail;

    for(let id in dialogs) {
      let dialog = dialogs[id];

      console.log('updating dialog:', dialog);

      if(!(dialog.peerID in appDialogsManager.doms)) {
        appDialogsManager.addDialog(dialog);
        continue;
      } 

      appDialogsManager.setLastMessage(dialog);
    }

    appDialogsManager.sortDom();
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
  let messageInput = document.getElementById('input-message') as HTMLDivElement/* HTMLInputElement */;
  messageInput.addEventListener('keydown', function(this: typeof messageInput, e: KeyboardEvent) {
    if(e.key == 'Enter') {
      if(e.shiftKey) {
        return;
      }

      sendMessage();
    }
  });

  let lastTimeType = 0;
  messageInput.addEventListener('input', function(this: typeof messageInput, e) {
    //console.log('messageInput input', this.innerText, serializeNodes(Array.from(messageInput.childNodes)));
    if(!this.innerText.trim() && !serializeNodes(Array.from(messageInput.childNodes)).trim()) {
      this.innerHTML = '';
      btnSend.classList.remove('tgico-send');
      btnSend.classList.add('tgico-microphone2');

      appImManager.setTyping('sendMessageCancelAction');
    } else if(!btnSend.classList.contains('tgico-send')) {
      btnSend.classList.add('tgico-send');
      btnSend.classList.remove('tgico-microphone2');

      let time = Date.now();
      if(time - lastTimeType >= 6000) {
        lastTimeType = time;
        appImManager.setTyping('sendMessageTypingAction');
      }
    }
  });

  let serializeNodes = (nodes: Node[]): string => {
    return nodes.reduce((str, child: any) => {
      //console.log('childNode', str, child, typeof(child), typeof(child) === 'string', child.innerText);

      if(typeof(child) === 'object' && child.textContent) return str += child.textContent;
      if(child.innerText) return str += child.innerText;
      if(child.tagName == 'IMG' && child.classList && child.classList.contains('emoji')) return str += child.getAttribute('emoji');

      return str;
    }, '');
  };

  messageInput.addEventListener('copy', function(e) {
    const selection = document.getSelection();
    
    let range = selection.getRangeAt(0);
    let ancestorContainer = range.commonAncestorContainer;

    let str = '';

    let selectedNodes = Array.from(ancestorContainer.childNodes).slice(range.startOffset, range.endOffset);
    if(selectedNodes.length) {
      str = serializeNodes(selectedNodes);
    } else {
      str = selection.toString();
    }

    console.log('messageInput copy', str, ancestorContainer.childNodes, range);

    // @ts-ignore
    event.clipboardData.setData('text/plain', str);
    event.preventDefault();
  });
  
  messageInput.addEventListener('paste', function(this: typeof messageInput, e) {
    e.preventDefault();
    // @ts-ignore
    let text = (e.originalEvent || e).clipboardData.getData('text/plain');

    // console.log('messageInput paste', text);

    text = RichTextProcessor.wrapRichText(text);

    // console.log('messageInput paste after', text);

    // @ts-ignore
    //let html = (e.originalEvent || e).clipboardData.getData('text/html');

    // @ts-ignore
    //console.log('paste text', text, );
    window.document.execCommand('insertHTML', false, text);
  });

  let fileInput = document.getElementById('input-file') as HTMLInputElement;

  fileInput.addEventListener('change', (e) => {
    var file = (e.target as HTMLInputElement & EventTarget).files[0];
    if(!file) {
      return;
    }
    
    console.log('selected file:', file, typeof(file));

    fileInput.value = '';

    appMessagesManager.sendFile(appImManager.peerID, file, {isMedia: true});
    appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;

    /* MTProto.apiFileManager.uploadFile(file).then((inputFile) => {
      console.log('uploaded smthn', inputFile);
    }); */
  }, false);

  pageEl.querySelector('#attach-file').addEventListener('click', () => {
    fileInput.click();
  });

  let inputMessageContainer = document.getElementsByClassName('input-message-container')[0] as HTMLDivElement;
  
  let inputScroll = scrollable(inputMessageContainer);

  let sendMessage = () => {
    let str = serializeNodes(Array.from(messageInput.childNodes));

    //console.log('childnode str after:', str);

    appMessagesManager.sendText(appImManager.peerID, str);
    appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;
    messageInput.innerText = '';

    btnSend.classList.remove('tgico-send');
    btnSend.classList.add('tgico-microphone2');
  };

  let btnSend = document.getElementById('btn-send') as HTMLButtonElement;
  btnSend.addEventListener('click', () => {
    if(btnSend.classList.contains('tgico-send')) {
      sendMessage();
    }
  });

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

  let emoticonsDropdown: HTMLDivElement = null;
  let emoticonsTimeout: number = 0;
  let toggleEmoticons = pageEl.querySelector('.toggle-emoticons') as HTMLButtonElement;
  let emoticonsLazyLoadQueue: LazyLoadQueue = null;
  toggleEmoticons.onmouseover = (e) => {
    clearTimeout(emoticonsTimeout);
    emoticonsTimeout = setTimeout(() => {
      if(!emoticonsDropdown) {
        let res = initEmoticonsDropdown(pageEl, appImManager, 
          appMessagesManager, messageInput, toggleEmoticons, btnSend);
        
        emoticonsDropdown = res.dropdown;
        emoticonsLazyLoadQueue = res.lazyLoadQueue;

        toggleEmoticons.onmouseout = emoticonsDropdown.onmouseout = (e) => {
          clearTimeout(emoticonsTimeout);
          emoticonsTimeout = setTimeout(() => {
            emoticonsDropdown.classList.remove('active');
            toggleEmoticons.classList.remove('active');
            lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
          }, 200);
        };

        emoticonsDropdown.onmouseover = (e) => {
          clearTimeout(emoticonsTimeout);
        };
      } else {
        emoticonsDropdown.classList.add('active');
        emoticonsLazyLoadQueue.check();
      }
  
      toggleEmoticons.classList.add('active');

      lottieLoader.checkAnimations(false, EMOTICONSSTICKERGROUP);
    }, 0/* 200 */);
  };

  /* toggleEmoticons.onclick = (e) => {
    if(!emoticonsDropdown) {
      emoticonsDropdown = initEmoticonsDropdown(pageEl, appImManager, 
        appMessagesManager, messageInput, toggleEmoticons);
    } else {
      emoticonsDropdown.classList.toggle('active');
    }

    toggleEmoticons.classList.toggle('active');
  }; */

  let openedMenu: HTMLDivElement = null;
  let onMouseMove = (e: MouseEvent) => {
    let rect = openedMenu.getBoundingClientRect();
    let {clientX, clientY} = e;

    let diffX = clientX >= rect.right ? clientX - rect.right : rect.left - clientX;
    let diffY = clientY >= rect.bottom ? clientY - rect.bottom : rect.top - clientY;

    if(diffX >= 100 || diffY >= 100) {
      openedMenu.parentElement.click();
    }
    //console.log('mousemove', diffX, diffY);
  };
  
  Array.from(document.getElementsByClassName('btn-menu-toggle')).forEach((el) => {
    el.addEventListener('click', (e) => {
      window.removeEventListener('mousemove', onMouseMove);
      openedMenu = el.querySelector('.btn-menu');
      e.cancelBubble = true;

      if(el.classList.contains('menu-open')) {
        el.classList.remove('menu-open');
        openedMenu.classList.remove('active');
      } else {
        el.classList.add('menu-open');
        openedMenu.classList.add('active');

        window.addEventListener('click', () => {
          //(el as HTMLDivElement).click();
          el.classList.remove('menu-open');
          openedMenu.classList.remove('active');
          window.removeEventListener('mousemove', onMouseMove);
        }, {once: true});

        window.addEventListener('mousemove', onMouseMove);
      }
    });
  });


  loadDialogs().then(result => {
    onScroll();
    appImManager.setScroll(chatScroll);
    appSidebarRight.setScroll(sidebarScroll);
  });
});
