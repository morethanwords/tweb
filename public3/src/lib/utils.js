/*!
 * Webogram v0.7.0 - messaging web application for MTProto
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */
var _logTimer = Date.now();
export function dT () {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']';
}

export function isInDOM(element, parentNode) {
  if(!element) {
    return false;
  }

  parentNode = parentNode || document.body;
  if(element == parentNode) {
    return true;
  }
  return isInDOM(element.parentNode, parentNode);
}

export function checkDragEvent(e) {
  if (!e || e.target && (e.target.tagName == 'IMG' || e.target.tagName == 'A')) return false
  if (e.dataTransfer && e.dataTransfer.types) {
    for (var i = 0; i < e.dataTransfer.types.length; i++) {
      if (e.dataTransfer.types[i] == 'Files') {
        return true
      }
    }
  } else {
    return true
  }

  return false
}

export function cancelEvent (event) {
  event = event || window.event;
  if(event) {
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

export function getRichValue (field) {
  if (!field) {
    return ''
  }
  var lines = []
  var line = []

  getRichElementValue(field, lines, line)
  if (line.length) {
    lines.push(line.join(''))
  }

  var value = lines.join('\n')
  value = value.replace(/\u00A0/g, ' ')

  return value
}

export function placeCaretAtEnd(el) {
  el.focus();
  if (typeof window.getSelection != "undefined"
          && typeof document.createRange != "undefined") {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
  } else if (typeof document.body.createTextRange != "undefined") {
      var textRange = document.body.createTextRange();
      textRange.moveToElementText(el);
      textRange.collapse(false);
      textRange.select();
  }
}

export function getRichElementValue (node, lines, line, selNode, selOffset) {
  if (node.nodeType == 3) { // TEXT
    if (selNode === node) {
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
  if (isBlock && line.length || node.tagName == 'BR') {
    lines.push(line.join(''))
    line.splice(0, line.length)
  }
  else if (node.tagName == 'IMG') {
    if (node.alt) {
      line.push(node.alt)
    }
  }
  if (isSelected && !selOffset) {
    line.push('\x01')
  }
  var curChild = node.firstChild
  while (curChild) {
    getRichElementValue(curChild, lines, line, selNode, selOffset)
    curChild = curChild.nextSibling
  }
  if (isSelected && selOffset) {
    line.push('\x01')
  }
  if (isBlock && line.length) {
    lines.push(line.join(''))
    line.splice(0, line.length)
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

export const $rootScope = {
  $broadcast: (name/* : string */, detail/*? : any */) => {
    /* if(name != 'user_update') {
      console.log(dT(), 'Broadcasting ' + name + ' event, with args:', detail);
    } */

    let myCustomEvent = new CustomEvent(name, {detail});
    document.dispatchEvent(myCustomEvent);
  },
  $on: (name/* : string */, callback/* : any */) => {
    document.addEventListener(name, callback);
  },

  selectedPeerID: 0,
  myID: 0,
  idle: {
    isIDLE: false
  }
};

// generate a path's arc data parameter
// http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands
var arcParameter = function(rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y) {
  return [rx, ',', ry, ' ',
          xAxisRotation, ' ',
          largeArcFlag, ',',
          sweepFlag, ' ',
          x, ',', y ].join('');
};

export function generatePathData( x, y, width, height, tl, tr, br, bl ) {
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

export const langPack = {
  "messageActionChatCreate": "created the group",
	"messageActionChatEditTitle": "changed group name",
	"messageActionChatEditPhoto": "changed group photo",
	"messageActionChatDeletePhoto": "removed group photo",
	"messageActionChatReturn": "returned to group",
	"messageActionChatJoined": "joined the group",
  "messageActionChatAddUser": "invited {user}",
  "messageActionChatAddUsers": "invited {} users",
	"messageActionChatLeave": "left the group",
	"messageActionChatDeleteUser": "removed user",
	"messageActionChatJoinedByLink": "joined the group",
  "messageActionPinMessage": "pinned message",
  "messageActionContactSignUp": "joined Telegram",
	"messageActionChannelCreate": "Channel created",
	"messageActionChannelEditTitle": "Channel renamed",
	"messageActionChannelEditPhoto": "Channel photo updated",
  "messageActionChannelDeletePhoto": "Channel photo removed",
  "messageActionHistoryClear": "History cleared",

  "messageActionPhoneCall.in_ok": "Incoming Call",
	"messageActionPhoneCall.out_ok": "Outgoing Call",
	"messageActionPhoneCall.in_missed": "Missed Call",
	"messageActionPhoneCall.out_missed": "Cancelled Call",
};

export const _ = (str/* : string */) => {
  str = str.replace('_raw', '');

  return langPack[str] ? langPack[str] : str;
};

export function isObject(object) {
  return typeof(object) === 'object' && object !== null;
}

export function tsNow (seconds) {
  var t = +new Date();
  return seconds ? Math.floor(t / 1000) : t;
}

export function safeReplaceObject (wasObject, newObject) {
  for (var key in wasObject) {
    if (!newObject.hasOwnProperty(key) && key.charAt(0) != '$') {
      delete wasObject[key]
    }
  }
  for (var key in newObject) {
    //if (newObject.hasOwnProperty(key)) { // useless
      wasObject[key] = newObject[key]
    //}
  }
}

export function numberWithCommas(x) {
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export function findUpClassName(el, className) {
  if(el.classList.contains(className)) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.classList.contains(className)) 
      return el;
  }
  return null;
}

export function findUpTag(el, tag) {
  if(el.tagName == tag) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.tagName === tag) 
      return el;
  }
  return null;
}

export function findUpAttribute(el, attribute) {
  if(el.getAttribute(attribute) != null) return el; // 03.02.2020

  while(el.parentElement) {
    el = el.parentElement;
    if(el.getAttribute(attribute) != null) 
      return el;
  }
  return null;
}

export function whichChild(elem/* : Node */) {
  let i = 0;
  // @ts-ignore
  while((elem = elem.previousElementSibling) != null) ++i;
  return i;
};

export function copy(obj) {
  //in case of premitives
  if(obj===null || typeof obj !== "object"){
    return obj;
  }
 
  //date objects should be 
  if(obj instanceof Date){
    return new Date(obj.getTime());
  }
 
  //handle Array
  if(Array.isArray(obj)){
    var clonedArr = [];
    obj.forEach(function(element){
      clonedArr.push(copy(element))
    });
    return clonedArr;
  }
 
  //lastly, handle objects
  let clonedObj = new obj.constructor();
  for(var prop in obj){
    if(obj.hasOwnProperty(prop)){
      clonedObj[prop] = copy(obj[prop]);
    }
  }
  return clonedObj;
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatNumber(bytes, decimals = 2) {
  if(bytes === 0) return '0';

  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['', 'K', 'M', 'B', 'T'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + sizes[i];
}

export function deepEqual(x, y) {
  const ok = Object.keys, tx = typeof x, ty = typeof y;
  return x && y && tx === 'object' && tx === ty ? (
    ok(x).length === ok(y).length &&
      ok(x).every(key => deepEqual(x[key], y[key]))
  ) : (x === y);
}

export function listMergeSorted (list1, list2) {
  list1 = list1 || []
  list2 = list2 || []

  var result = copy(list1);

  var minID = list1.length ? list1[list1.length - 1] : 0xFFFFFFFF
  for (var i = 0; i < list2.length; i++) {
    if (list2[i] < minID) {
      result.push(list2[i])
    }
  }

  return result
}

// credits to https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
export function escapeRegExp(str) {
  return str
    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    .replace(/-/g, '\\x2d');
}

export function encodeEntities (value) {
  return value.replace(/&/g, '&amp;').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function (value) {
    var hi = value.charCodeAt(0)
    var low = value.charCodeAt(1)
    return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';'
  }).replace(/([^\#-~| |!])/g, function (value) { // non-alphanumeric
    return '&#' + value.charCodeAt(0) + ';'
  }).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function fillPropertyValue(str) {
  let splitted = str.split(' ');
  if(splitted.length != 4) {
    if(!splitted[0]) splitted[0] = '0px';
    for(let i = splitted.length; i < 4; ++i) {
      splitted[i] = splitted[i % 2] || splitted[0] || '0px';
    }
  }

  return splitted;
}

export function calcImageInBox (imageW, imageH, boxW, boxH, noZooom) {
  if(imageW < boxW && imageH < boxH) {
    return {w: imageW, h: imageH};
  }

  var boxedImageW = boxW
  var boxedImageH = boxH

  if((imageW / imageH) > (boxW / boxH)) {
    boxedImageH = parseInt(imageH * boxW / imageW)
  } else {
    boxedImageW = parseInt(imageW * boxH / imageH)
    if(boxedImageW > boxW) {
      boxedImageH = parseInt(boxedImageH * boxW / boxedImageW)
      boxedImageW = boxW
    }
  }

  // if (Config.Navigator.retina) {
  //   imageW = Math.floor(imageW / 2)
  //   imageH = Math.floor(imageH / 2)
  // }

  if(noZooom && boxedImageW >= imageW && boxedImageH >= imageH) {
    boxedImageW = imageW
    boxedImageH = imageH
  }

  return {w: boxedImageW, h: boxedImageH}
}

/**
 * emojiUnicode
 * Get the unicode code of an emoji in base 16.
 *
 * @name emojiUnicode
 * @function
 * @param {String} input The emoji character.
 * @returns {String} The base 16 unicode code.
 */
export function emojiUnicode(input) {
  let pairs = emojiUnicode.raw(input).split(' ').map(val => parseInt(val).toString(16))/* .filter(p => p != 'fe0f') */;
  if(pairs.length && pairs[0].length == 2) pairs[0] = '00' + pairs[0];
  return pairs.join('-');
}

/**
* emojiunicode.raw
* Get the unicode code points of an emoji in base 16.
*
* @name emojiunicode.raw
* @function
* @param {String} input The emoji character.
* @returns {String} The unicode code points.
*/
emojiUnicode.raw = function(input) {
  if(input.length === 1) {
    return input.charCodeAt(0).toString();
  } else if(input.length > 1) {
    const pairs = [];
    for(var i = 0; i < input.length; i++) {
      // high surrogate
      if(input.charCodeAt(i) >= 0xd800 && input.charCodeAt(i) <= 0xdbff) {
        if(input.charCodeAt(i + 1) >= 0xdc00 && input.charCodeAt(i + 1) <= 0xdfff) {
          // low surrogate
          pairs.push(
            (input.charCodeAt(i) - 0xd800) * 0x400
            + (input.charCodeAt(i + 1) - 0xdc00) + 0x10000
          );
        }
      } else if(input.charCodeAt(i) < 0xd800 || input.charCodeAt(i) > 0xdfff) {
        // modifiers and joiners
        pairs.push(input.charCodeAt(i))
      }
    }

    return pairs.join(' ');
  }

  return '';
};

export function getEmojiToneIndex(input) {
  let match = input.match(/[\uDFFB-\uDFFF]/);
  return match ? 5 - (57343 - match[0].charCodeAt(0)) : 0;
}
