import type { DownloadOptions } from "./mtproto/apiFileManager";
import { RichTextProcessor } from "./richtextprocessor";

/* export function isInDOM(element: Element, parentNode?: HTMLElement): boolean {
  if(!element) {
    return false;
  }

  parentNode = parentNode || document.body;
  if(element == parentNode) {
    return true;
  }
  return isInDOM(element.parentNode as HTMLElement, parentNode);
} */
export function isInDOM(element: Element): boolean {
  return element?.isConnected;
}

/* export function checkDragEvent(e: any) {
  if(!e || e.target && (e.target.tagName == 'IMG' || e.target.tagName == 'A')) return false
  if(e.dataTransfer && e.dataTransfer.types) {
    for(var i = 0; i < e.dataTransfer.types.length; i++) {
      if(e.dataTransfer.types[i] == 'Files') {
        return true;
      }
    }
  } else {
    return true;
  }

  return false;
} */

export function cancelEvent (event: Event) {
  event = event || window.event;
  if(event) {
    // @ts-ignore
    event = event.originalEvent || event;

    try {
      if(event.stopPropagation) event.stopPropagation();
      if(event.preventDefault) event.preventDefault();
      event.returnValue = false;
      event.cancelBubble = true;
    } catch(err) {}
  }

  return false;
}

export function getRichValue(field: any) {
  if(!field) {
    return '';
  }
  var lines: string[] = [];
  var line: string[] = [];

  getRichElementValue(field, lines, line);
  if (line.length) {
    lines.push(line.join(''));
  }

  var value = lines.join('\n');
  value = value.replace(/\u00A0/g, ' ');

  return value;
}

export function placeCaretAtEnd(el: HTMLElement) {
  el.focus();
  if(typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // @ts-ignore
  } else if(typeof document.body.createTextRange != "undefined") {
    // @ts-ignore
    var textRange = document.body.createTextRange();
    textRange.moveToElementText(el);
    textRange.collapse(false);
    textRange.select();
  }
}

export function getRichElementValue(node: any, lines: string[], line: string[], selNode?: Node, selOffset?: number) {
  if(node.nodeType == 3) { // TEXT
    if(selNode === node) {
      var value = node.nodeValue
      line.push(value.substr(0, selOffset) + '\x01' + value.substr(selOffset))
    } else {
      line.push(node.nodeValue)
    }
    return
  }
  if (node.nodeType != 1) { // NON-ELEMENT
    return
  }
  var isSelected = (selNode === node)
  var isBlock = node.tagName == 'DIV' || node.tagName == 'P'
  var curChild
  if(isBlock && line.length || node.tagName == 'BR') {
    lines.push(line.join(''))
    line.splice(0, line.length)
  } else if(node.tagName == 'IMG') {
    if(node.alt) {
      line.push(node.alt);
    }
  }

  if(isSelected && !selOffset) {
    line.push('\x01');
  }

  var curChild = node.firstChild;
  while(curChild) {
    getRichElementValue(curChild, lines, line, selNode, selOffset);
    curChild = curChild.nextSibling;
  }

  if(isSelected && selOffset) {
    line.push('\x01');
  }

  if(isBlock && line.length) {
    lines.push(line.join(''));
    line.splice(0, line.length);
  }
}

/* if (Config.Modes.animations &&
  typeof window.requestAnimationFrame == 'function') {
  window.onAnimationFrameCallback = function (cb) {
    return (function () {
      window.requestAnimationFrame(cb)
    })
  }
} else {
  window.onAnimationFrameCallback = function (cb) {
    return cb
  }
} */

// generate a path's arc data parameter
// http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands
var arcParameter = function(rx: number, ry: number, xAxisRotation: number, largeArcFlag: number, sweepFlag: number, x: number, y: number) {
  return [rx, ',', ry, ' ',
          xAxisRotation, ' ',
          largeArcFlag, ',',
          sweepFlag, ' ',
          x, ',', y ].join('');
};

export function generatePathData(x: number, y: number, width: number, height: number, tl: number, tr: number, br: number, bl: number) {
  var data = [];

  // start point in top-middle of the rectangle
  data.push('M' + (x + width / 2) + ',' + y);

  // next we go to the right
  data.push('H' + (x + width - tr));

  if (tr > 0) {
      // now we draw the arc in the top-right corner
      data.push('A' + arcParameter(tr, tr, 0, 0, 1, (x + width), (y + tr)));
  }

  // next we go down
  data.push('V' + (y + height - br));

  if (br > 0) {
      // now we draw the arc in the lower-right corner
      data.push('A' + arcParameter(br, br, 0, 0, 1, (x + width - br), (y + height)));
  }

  // now we go to the left
  data.push('H' + (x + bl));

  if (bl > 0) {
      // now we draw the arc in the lower-left corner
      data.push('A' + arcParameter(bl, bl, 0, 0, 1, (x + 0), (y + height - bl)));
  }

  // next we go up
  data.push('V' + (y + tl));

  if (tl > 0) {
      // now we draw the arc in the top-left corner
      data.push('A' + arcParameter(tl, tl, 0, 0, 1, (x + tl), (y + 0)));
  }

  // and we close the path
  data.push('Z');

  return data.join(' ');
};

export const langPack: {[actionType: string]: string} = {
  "messageActionChatCreate": "created the group",
	"messageActionChatEditTitle": "changed group name",
	"messageActionChatEditPhoto": "changed group photo",
	"messageActionChatDeletePhoto": "removed group photo",
	"messageActionChatReturn": "returned to group",
	"messageActionChatJoined": "joined the group",
  "messageActionChatAddUser": "invited {}",
  "messageActionChatAddUsers": "invited {} users",
	"messageActionChatLeave": "left the group",
	"messageActionChatDeleteUser": "removed user {}",
	"messageActionChatJoinedByLink": "joined the group",
  "messageActionPinMessage": "pinned message",
  "messageActionContactSignUp": "joined Telegram",
	"messageActionChannelCreate": "Channel created",
	"messageActionChannelEditTitle": "Channel renamed",
	"messageActionChannelEditPhoto": "Channel photo updated",
  "messageActionChannelDeletePhoto": "Channel photo removed",
  "messageActionHistoryClear": "",//"History cleared",

  "messageActionChannelMigrateFrom": "",

  "messageActionPhoneCall.in_ok": "Incoming Call",
	"messageActionPhoneCall.out_ok": "Outgoing Call",
	"messageActionPhoneCall.in_missed": "Missed Call",
	"messageActionPhoneCall.out_missed": "Cancelled Call",
};

export function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

export function tsNow(seconds?: boolean) {
  var t = +new Date();
  return seconds ? Math.floor(t / 1000) : t;
}

const el = document.createElement('span');
export function getAbbreviation(str: string, onlyFirst = false) {
  const wrapped = RichTextProcessor.wrapEmojiText(str);
  el.innerHTML = wrapped;

  const childNodes = el.childNodes;
  let first = '', last = '';

  const firstNode = childNodes[0];
  if('length' in firstNode) first = (firstNode as any).textContent.charAt(0).toUpperCase(); 
  else first = (firstNode as HTMLElement).outerHTML;

  if(onlyFirst) return first;

  if(str.indexOf(' ') !== -1) {
    const lastNode = childNodes[childNodes.length - 1];
    if(lastNode == firstNode) last = lastNode.textContent.split(' ').pop().charAt(0).toUpperCase();
    else if('length' in lastNode) last = (lastNode as any).textContent.charAt(0).toUpperCase(); 
    else last = (lastNode as HTMLElement).outerHTML;
  }

  return first + last;
}

export function safeReplaceObject(wasObject: any, newObject: any) {
  for(var key in wasObject) {
    if(!newObject.hasOwnProperty(key) && key.charAt(0) != '$') {
      delete wasObject[key];
    }
  }

  for(var key in newObject) {
    //if (newObject.hasOwnProperty(key)) { // useless
      wasObject[key] = newObject[key];
    //}
  }
}

/**
 * Will be used for FILE_REFERENCE_EXPIRED
 * @param key 
 * @param wasObject 
 * @param newObject 
 */
export function safeReplaceArrayInObject<K>(key: K, wasObject: any, newObject: any) {
  if('byteLength' in newObject[key]) { // Uint8Array
    newObject[key] = [...newObject[key]];
  }

  if(wasObject && wasObject[key] != newObject[key]) {
    wasObject[key].length = newObject[key].length;
    (newObject[key] as any[]).forEach((v, i) => {
      wasObject[key][i] = v;
    });

    /* wasObject[key].set(newObject[key]); */
    newObject[key] = wasObject[key];
  }
}

export function limitSymbols(str: string, length: number, limitFrom = length + 10) {
  if(str.length > limitFrom) {
    str = str.slice(0, length).replace(/(\n|\s)+$/, '') + '...';
  }

  return str;
}

export function numberWithCommas(x: number) {
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

//export function findUpClassName<T>(el: any, className: string): T;
export function findUpClassName(el: any, className: string): HTMLElement {
  if(el.classList.contains(className)) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.classList.contains(className)) 
      return el;
  }
  return null;
}

export function findUpTag(el: any, tag: string): HTMLElement {
  if(el.tagName == tag) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.tagName === tag) 
      return el;
  }
  return null;
}

export function findUpAttribute(el: any, attribute: string): HTMLElement {
  if(el.getAttribute(attribute) != null) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.getAttribute(attribute) != null) 
      return el;
  }
  return null;
}

export function getObjectKeysAndSort(object: any, sort: 'asc' | 'desc' = 'asc') {
  const ids = Object.keys(object).map(i => +i);
  if(sort == 'asc') return ids.sort((a, b) => a - b);
  else return ids.sort((a, b) => b - a);
}

export function whichChild(elem: Node) {
  if(!elem.parentNode) {
    return -1;
  }
  
  let i = 0;
  // @ts-ignore
  while((elem = elem.previousElementSibling) != null) ++i;
  return i;
};

export function copy<T>(obj: T): T {
  //in case of premitives
  if(obj === null || typeof(obj) !== "object") {
    return obj;
  }
 
  //date objects should be 
  if(obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
 
  //handle Array
  if(Array.isArray(obj)){
    var clonedArr: any = [];
    obj.forEach(function(element){
      clonedArr.push(copy(element))
    });
    return clonedArr;
  }
 
  //lastly, handle objects
  // @ts-ignore
  let clonedObj = new obj.constructor();
  for(var prop in obj){
    if(obj.hasOwnProperty(prop)){
      clonedObj[prop] = copy(obj[prop]);
    }
  }
  return clonedObj;
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatNumber(bytes: number, decimals = 2) {
  if(bytes === 0) return '0';

  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['', 'K', 'M', 'B', 'T'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

export function deepEqual(x: any, y: any): boolean {
  const ok = Object.keys, tx = typeof x, ty = typeof y;
  return x && y && tx === 'object' && tx === ty ? (
    ok(x).length === ok(y).length &&
      ok(x).every(key => deepEqual(x[key], y[key]))
  ) : (x === y);
}

export function listMergeSorted(list1: any, list2: any) {
  list1 = list1 || [];
  list2 = list2 || [];

  var result = copy(list1);

  var minID = list1.length ? list1[list1.length - 1] : 0xFFFFFFFF;
  for (var i = 0; i < list2.length; i++) {
    if (list2[i] < minID) {
      result.push(list2[i]);
    }
  }

  return result;
}

// credits to https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
export function escapeRegExp(str: string) {
  return str
    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    .replace(/-/g, '\\x2d');
}

export function encodeEntities(value: string) {
  return value.replace(/&/g, '&amp;').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (value) => {
    var hi = value.charCodeAt(0);
    var low = value.charCodeAt(1);
    return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';';
  }).replace(/([^\#-~| |!])/g, (value) => { // non-alphanumeric
    return '&#' + value.charCodeAt(0) + ';';
  }).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fillPropertyValue(str: string) {
  let splitted = str.split(' ');
  if(splitted.length != 4) {
    if(!splitted[0]) splitted[0] = '0px';
    for(let i = splitted.length; i < 4; ++i) {
      splitted[i] = splitted[i % 2] || splitted[0] || '0px';
    }
  }

  return splitted;
}

export function calcImageInBox (imageW: number, imageH: number, boxW: number, boxH: number, noZoom?: boolean) {
  if(imageW < boxW && imageH < boxH) {
    return {w: imageW, h: imageH};
  }

  var boxedImageW = boxW;
  var boxedImageH = boxH;

  if((imageW / imageH) > (boxW / boxH)) {
    boxedImageH = (imageH * boxW / imageW) | 0;
  } else {
    boxedImageW = (imageW * boxH / imageH) | 0;
    if(boxedImageW > boxW) {
      boxedImageH = (boxedImageH * boxW / boxedImageW) | 0;
      boxedImageW = boxW;
    }
  }

  // if (Config.Navigator.retina) {
  //   imageW = Math.floor(imageW / 2)
  //   imageH = Math.floor(imageH / 2)
  // }

  if(noZoom && boxedImageW >= imageW && boxedImageH >= imageH) {
    boxedImageW = imageW;
    boxedImageH = imageH;
  }

  return {w: boxedImageW, h: boxedImageH};
}

export function getEmojiToneIndex(input: string) {
  let match = input.match(/[\uDFFB-\uDFFF]/);
  return match ? 5 - (57343 - match[0].charCodeAt(0)) : 0;
}

export type FileURLType = 'photo' | 'thumb' | 'document' | 'stream' | 'download';
export function getFileURL(type: FileURLType, options: DownloadOptions) {
  //console.log('getFileURL', location);
  //const perf = performance.now();
  const encoded = encodeURIComponent(JSON.stringify(options));
  //console.log('getFileURL encode:', performance.now() - perf, encoded);

  return '/' + type + '/' + encoded;
}

export function positionElementByIndex(element: HTMLElement, container: HTMLElement, pos: number) {
  const prevPos = whichChild(element);

  if(prevPos == pos) {
    return false;
  } else if(prevPos != -1 && prevPos < pos) { // was higher
    pos += 1;
  }

  if(container.childElementCount > pos) {
    container.insertBefore(element, container.children[pos]);
  } else {
    container.append(element);
  }

  return true;
}

export function splitStringByLength(str: string, maxLength: number) {
  if(str.length < maxLength) return [str];
  let length = 0, lastSliceStartIndex = 0, arrayIndex = 0;
  const delimiter = ' ';//'\n';
  const out: string[] = [];

  const cut = (end?: number) => {
    let part = str.slice(lastSliceStartIndex, end);
    const _arrayIndex = arrayIndex++;
    if(part.length > maxLength) {
      let overflowPart = part.slice(maxLength);
      const splitted = splitStringByLength(overflowPart, maxLength);
      splitted.forEach(part => {
        out[arrayIndex++] = part;
      });

      part = part.slice(0, maxLength);
    }

    lastSliceStartIndex = end;
    length = 0;
    out[_arrayIndex] = (out[_arrayIndex] || '') + part;
  };

  let lastIndex = 0;
  do {
    let index = str.indexOf(delimiter, lastIndex);
    if(index === -1) {
      if(lastIndex != (str.length - 1)) {
        cut();
      }

      break;
    }

    index += delimiter.length;

    const partLength = index - lastIndex;
    if((length + partLength) > maxLength) {
      cut(length);
    }
    
    lastIndex = index;
    length += partLength;
  } while(true);

  return out;
}

export function defineNotNumerableProperties(obj: {[key: string]: any}, names: string[]) {
  //const perf = performance.now();
  const props = {writable: true, configurable: true};
  const out: {[name: string]: typeof props} = {};
  names.forEach(name => {
    if(obj[name] === undefined) {
      out[name] = props;
    }
  });
  Object.defineProperties(obj, out);
  //console.log('defineNotNumerableProperties time:', performance.now() - perf);
}

export function cancelSelection() {
  if(window.getSelection) {
    if(window.getSelection().empty) {  // Chrome
      window.getSelection().empty();
    } else if(window.getSelection().removeAllRanges) {  // Firefox
      window.getSelection().removeAllRanges();
    }
    // @ts-ignore
  } else if(document.selection) {  // IE?
    // @ts-ignore
    document.selection.empty();
  }
}

export function getSelectedText() {
  if(window.getSelection) {
    return window.getSelection().toString();
    // @ts-ignore
  } else if(document.selection) {
    // @ts-ignore
    return document.selection.createRange().text;
  }
  return '';
}​

//(window as any).splitStringByLength = splitStringByLength;
