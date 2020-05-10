/*!
 * Webogram v0.7.0 - messaging web application for MTProto
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */
var _logTimer = Date.now();
export function dT () {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']'
}

export function checkClick (e, noprevent) {
  if (e.which == 1 && (e.ctrlKey || e.metaKey) || e.which == 2) {
    return true
  }

  if (!noprevent) {
    e.preventDefault()
  }

  return false
}

export function isInDOM (element, parentNode) {
  if (!element) {
    return false
  }
  parentNode = parentNode || document.body
  if (element == parentNode) {
    return true
  }
  return isInDOM(element.parentNode, parentNode)
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
  event = event || window.event
  if (event) {
    event = event.originalEvent || event

    if (event.stopPropagation) event.stopPropagation()
    if (event.preventDefault) event.preventDefault()
    event.returnValue = false
    event.cancelBubble = true
  }

  return false
}

export function setFieldSelection (field, from, to) {
  field = $(field)[0]
  try {
    field.focus()
    if (from === undefined || from === false) {
      from = field.value.length
    }
    if (to === undefined || to === false) {
      to = from
    }
    if (field.createTextRange) {
      var range = field.createTextRange()
      range.collapse(true)
      range.moveEnd('character', to)
      range.moveStart('character', from)
      range.select()
    }
    else if (field.setSelectionRange) {
      field.setSelectionRange(from, to)
    }
  } catch(e) {}
}

export function getFieldSelection (field) {
  if (field.selectionStart) {
    return field.selectionStart
  }
  else if (!document.selection) {
    return 0
  }

  var c = '\x01'
  var sel = document.selection.createRange()
  var txt = sel.text
  var dup = sel.duplicate()
  var len = 0

  try {
    dup.moveToElementText(field)
  } catch(e) {
    return 0
  }

  sel.text = txt + c
  len = dup.text.indexOf(c)
  sel.moveStart('character', -1)
  sel.text = ''

  // if (browser.msie && len == -1) {
  //   return field.value.length
  // }
  return len
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

export function getRichValueWithCaret (field) {
  if (!field) {
    return []
  }
  var lines = []
  var line = []

  var sel = window.getSelection ? window.getSelection() : false
  var selNode
  var selOffset
  if (sel && sel.rangeCount) {
    var range = sel.getRangeAt(0)
    /* if (range.startContainer &&
      range.startContainer == range.endContainer &&
      range.startOffset == range.endOffset) { */
      selNode = range.startContainer
      selOffset = range.startOffset
    //}
  }

  getRichElementValue(field, lines, line, selNode, selOffset)

  if (line.length) {
    lines.push(line.join(''))
  }

  var value = lines.join('\n')
  var caretPos = value.indexOf('\x01')
  if (caretPos != -1) {
    value = value.substr(0, caretPos) + value.substr(caretPos + 1)
  }
  value = value.replace(/\u00A0/g, ' ')

  return [value, caretPos]
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

export function setRichFocus (field, selectNode, noCollapse) {
  field.focus()
  if (selectNode &&
    selectNode.parentNode == field &&
    !selectNode.nextSibling &&
    !noCollapse) {
    field.removeChild(selectNode)
    selectNode = null
  }
  if (window.getSelection && document.createRange) {
    var range = document.createRange()
    if (selectNode) {
      range.selectNode(selectNode)
    } else {
      range.selectNodeContents(field)
    }
    if (!noCollapse) {
      range.collapse(false)
    }

    var sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
  else if (document.body.createTextRange !== undefined) {
    var textRange = document.body.createTextRange()
    textRange.moveToElementText(selectNode || field)
    if (!noCollapse) {
      textRange.collapse(false)
    }
    textRange.select()
  }
}

export function getSelectedText() {
  var sel = (
  window.getSelection && window.getSelection() ||
  document.getSelection && document.getSelection() ||
  document.selection && document.selection.createRange().text || ''
    ).toString().replace(/^\s+|\s+$/g, '')

  return sel
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
    console.log(dT(), 'Broadcasting ' + name + ' event, with args:', detail);
    //console.trace();
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
    if (newObject.hasOwnProperty(key)) {
      wasObject[key] = newObject[key]
    }
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

export function isElementInViewport(el) {
  var rect   = el.getBoundingClientRect(),
    vWidth   = window.innerWidth || document.documentElement.clientWidth,
    vHeight  = window.innerHeight || document.documentElement.clientHeight,
    efp      = function(x, y) { return document.elementFromPoint(x, y) };     

  // Return false if it's not in the viewport
  if(rect.right < 0 || rect.bottom < 0 
    || rect.left > vWidth || rect.top > vHeight 
    || !rect.width || !rect.height) {
    return false;
  }

  let elements = [
    efp(rect.left + 1,  rect.top + 1),
    efp(rect.right - 1, rect.top + 1),
    efp(rect.right - 1, rect.bottom - 1),
    efp(rect.left + 1,  rect.bottom - 1)
  ];

  // Return true if any of its four corners are visible
  return elements.find(e => el.contains(e) || el.parentElement == e) !== undefined;
}

export function isScrolledIntoView(el) {
  var rect = el.getBoundingClientRect();
  var elemTop = rect.top;
  var elemBottom = rect.bottom;

  // Only completely visible elements return true:
  //var isVisible = (elemTop >= 0) && (elemBottom <= window.innerHeight);
  // Partially visible elements return true:
  var isVisible = elemTop < window.innerHeight && elemBottom >= 0;
  return isVisible;
}

/* export function isScrolledIntoView(el) {
  var rect = el.getBoundingClientRect(), top = rect.top, height = rect.height, 
    el = el.parentNode
  // Check if bottom of the element is off the page
  if (rect.bottom < 0) return false
  // Check its within the document viewport
  if (top > document.documentElement.clientHeight) return false
  do {
    rect = el.getBoundingClientRect()
    if (top <= rect.bottom === false) return false
    // Check if the element is out of view due to a container scrolling
    if ((top + height) <= rect.top) return false
    el = el.parentNode
  } while (el != document.body)
  return true
}; */

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

/* export function ripple(elem) {
  elem.addEventListener('mousedown', function(e) {
    let rect = this.getBoundingClientRect();

    const startTime = Date.now();
    const animationTime = 350;

    let X = e.clientX - rect.left;
    let Y = e.clientY - rect.top;
    let rippleDiv = document.createElement("div");
    rippleDiv.classList.add("ripple");
    rippleDiv.setAttribute("style", "top:" + Y + "px; left:" + X + "px;");
    this.appendChild(rippleDiv);

    elem.addEventListener('mouseup', () => {
      let elapsed = Date.now() - startTime;

      setTimeout(() => {
        rippleDiv.parentElement.removeChild(rippleDiv);
      }, elapsed < animationTime ? animationTime - elapsed : 0);
    }, {once: true});
  });
}; */

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

export function listUniqSorted (list) {
  list = list || []
  var resultList = []
  var prev = false
  for (var i = 0; i < list.length; i++) {
    if (list[i] !== prev) {
      resultList.push(list[i])
    }
    prev = list[i]
  }

  return resultList
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
/* export function emojiUnicode (input) {
  let pairs = emojiUnicode.raw(input).split(' ').map(val => parseInt(val).toString(16));
  if(pairs[0].length == 2) pairs[0] = '00' + pairs[0];
  return pairs.join('-').toUpperCase();
} */

/**
* emojiunicode.raw
* Get the unicode code points of an emoji in base 16.
*
* @name emojiunicode.raw
* @function
* @param {String} input The emoji character.
* @returns {String} The unicode code points.
*/
/* emojiUnicode.raw = function (input) {
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
          } else if (input.charCodeAt(i) < 0xd800 || input.charCodeAt(i) > 0xdfff) {
              // modifiers and joiners
              pairs.push(input.charCodeAt(i))
          }
    }

    return pairs.join(' ');
  }

  return '';
}; */

// country code regex
const CC_REGEX = /^[a-z]{2}$/i;

// offset between uppercase ascii and regional indicator symbols
const OFFSET = 127397;

/**
 * convert country code to corresponding emoji flag
 * @param {string} cc - country code string
 * @returns {string} country code emoji
 */
export function countryCodeEmoji(cc/* : string */) {
  if(!CC_REGEX.test(cc)) {
    const type = typeof cc;
    throw new TypeError(
      `cc argument must be an ISO 3166-1 alpha-2 string, but got '${
        type === 'string' ? cc : type
      }' instead.`,
    );
  }

  const chars = [...cc.toUpperCase()].map(c => c.charCodeAt(0) + OFFSET);
  //console.log(chars);
  return String.fromCodePoint(...chars);
}

export function unifiedCountryCodeEmoji(cc/* : string */) {
  if(!CC_REGEX.test(cc)) {
    const type = typeof cc;
    throw new TypeError(
      `cc argument must be an ISO 3166-1 alpha-2 string, but got '${
        type === 'string' ? cc : type
      }' instead.`,
    );
  }

  const chars = [...cc.toUpperCase()].map(c => c.charCodeAt(0) + OFFSET);
  return chars.map(c => c.toString(16).toUpperCase()).join('-');
}

function versionCompare (ver1, ver2) {
  if (typeof ver1 !== 'string') {
    ver1 = ''
  }
  if (typeof ver2 !== 'string') {
    ver2 = ''
  }
  ver1 = ver1.replace(/^\s+|\s+$/g, '').split('.')
  ver2 = ver2.replace(/^\s+|\s+$/g, '').split('.')

  var a = Math.max(ver1.length, ver2.length), i

  for (i = 0; i < a; i++) {
    if (ver1[i] == ver2[i]) {
      continue
    }
    if (ver1[i] > ver2[i]) {
      return 1
    } else {
      return -1
    }
  }

  return 0
}


  var badCharsRe = /[`~!@#$%^&*()\-_=+\[\]\\|{}'";:\/?.>,<\s]+/g,
    trimRe = /^\s+|\s$/g

  function createIndex () {
    return {
      shortIndexes: {},
      fullTexts: {}
    }
  }

  function cleanSearchText (text) {
    var hasTag = text.charAt(0) == '%'
    text = text.replace(badCharsRe, ' ').replace(trimRe, '')
    text = text.replace(/[^A-Za-z0-9]/g, function (ch) {
      var latinizeCh = Config.LatinizeMap[ch]
      return latinizeCh !== undefined ? latinizeCh : ch
    })
    text = text.toLowerCase()
    if (hasTag) {
      text = '%' + text
    }

    return text
  }

  function cleanUsername (username) {
    return username && username.toLowerCase() || ''
  }

  function indexObject (id, searchText, searchIndex) {
    if (searchIndex.fullTexts[id] !== undefined) {
      return false
    }

    searchText = cleanSearchText(searchText)

    if (!searchText.length) {
      return false
    }

    var shortIndexes = searchIndex.shortIndexes

    searchIndex.fullTexts[id] = searchText

    searchText.split(' ').forEach(function(searchWord) {
      var len = Math.min(searchWord.length, 3),
        wordPart, i
      for (i = 1; i <= len; i++) {
        wordPart = searchWord.substr(0, i)
        if (shortIndexes[wordPart] === undefined) {
          shortIndexes[wordPart] = [id]
        } else {
          shortIndexes[wordPart].push(id)
        }
      }
    })
  }

  function search (query, searchIndex) {
    var shortIndexes = searchIndex.shortIndexes
    var fullTexts = searchIndex.fullTexts

    query = cleanSearchText(query)

    var queryWords = query.split(' ')
    var foundObjs = false,
      newFoundObjs, i
    var j, searchText
    var found

    for (i = 0; i < queryWords.length; i++) {
      newFoundObjs = shortIndexes[queryWords[i].substr(0, 3)]
      if (!newFoundObjs) {
        foundObjs = []
        break
      }
      if (foundObjs === false || foundObjs.length > newFoundObjs.length) {
        foundObjs = newFoundObjs
      }
    }

    newFoundObjs = {}

    for (j = 0; j < foundObjs.length; j++) {
      found = true
      searchText = fullTexts[foundObjs[j]]
      for (i = 0; i < queryWords.length; i++) {
        if (searchText.indexOf(queryWords[i]) == -1) {
          found = false
          break
        }
      }
      if (found) {
        newFoundObjs[foundObjs[j]] = true
      }
    }

    return newFoundObjs
  }

  let SearchIndexManager = {
    createIndex: createIndex,
    indexObject: indexObject,
    cleanSearchText: cleanSearchText,
    cleanUsername: cleanUsername,
    search: search
  };
  //window.SearchIndexManager = SearchIndexManager;

  export {SearchIndexManager};
//})(window)
