import {encodeEntities, copy, emojiUnicode} from './utils';
import Config from './config';

var EmojiHelper = {
  emojiMap: (code) => { return code; },
  shortcuts: [],
  emojis: []
};

var emojiData = Config.Emoji;
var emojiSupported = navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) != -1/*  && false */,
  emojiCode;

// added * to (?:[©®\\u2122\\u265f]\\ufe0f) and removed \\ufe0f from end
// there are no 2640 and 2642 (signs)
var emojiRegExp = '(?:\\ud83d\\udc68\\ud83c\\udffb\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffc-\\udfff]|\\ud83d\\udc68\\ud83c\\udffc\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb\\udffd-\\udfff]|\\ud83d\\udc68\\ud83c\\udffd\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb\\udffc\\udffe\\udfff]|\\ud83d\\udc68\\ud83c\\udffe\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb-\\udffd\\udfff]|\\ud83d\\udc68\\ud83c\\udfff\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb-\\udffe]|\\ud83d\\udc69\\ud83c\\udffb\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffc-\\udfff]|\\ud83d\\udc69\\ud83c\\udffb\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc69\\ud83c[\\udffc-\\udfff]|\\ud83d\\udc69\\ud83c\\udffc\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb\\udffd-\\udfff]|\\ud83d\\udc69\\ud83c\\udffc\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc69\\ud83c[\\udffb\\udffd-\\udfff]|\\ud83d\\udc69\\ud83c\\udffd\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb\\udffc\\udffe\\udfff]|\\ud83d\\udc69\\ud83c\\udffd\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc69\\ud83c[\\udffb\\udffc\\udffe\\udfff]|\\ud83d\\udc69\\ud83c\\udffe\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb-\\udffd\\udfff]|\\ud83d\\udc69\\ud83c\\udffe\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc69\\ud83c[\\udffb-\\udffd\\udfff]|\\ud83d\\udc69\\ud83c\\udfff\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc68\\ud83c[\\udffb-\\udffe]|\\ud83d\\udc69\\ud83c\\udfff\\u200d\\ud83e\\udd1d\\u200d\\ud83d\\udc69\\ud83c[\\udffb-\\udffe]|\\ud83e\\uddd1\\ud83c\\udffb\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1\\ud83c[\\udffb-\\udfff]|\\ud83e\\uddd1\\ud83c\\udffc\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1\\ud83c[\\udffb-\\udfff]|\\ud83e\\uddd1\\ud83c\\udffd\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1\\ud83c[\\udffb-\\udfff]|\\ud83e\\uddd1\\ud83c\\udffe\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1\\ud83c[\\udffb-\\udfff]|\\ud83e\\uddd1\\ud83c\\udfff\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1\\ud83c[\\udffb-\\udfff]|\\ud83e\\uddd1\\u200d\\ud83e\\udd1d\\u200d\\ud83e\\uddd1|\\ud83d\\udc6b\\ud83c[\\udffb-\\udfff]|\\ud83d\\udc6c\\ud83c[\\udffb-\\udfff]|\\ud83d\\udc6d\\ud83c[\\udffb-\\udfff]|\\ud83d[\\udc6b-\\udc6d])|(?:\\ud83d[\\udc68\\udc69]|\\ud83e\\uddd1)(?:\\ud83c[\\udffb-\\udfff])?\\u200d(?:\\u2695\\ufe0f|\\u2696\\ufe0f|\\u2708\\ufe0f|\\ud83c[\\udf3e\\udf73\\udf7c\\udf84\\udf93\\udfa4\\udfa8\\udfeb\\udfed]|\\ud83d[\\udcbb\\udcbc\\udd27\\udd2c\\ude80\\ude92]|\\ud83e[\\uddaf-\\uddb3\\uddbc\\uddbd])|(?:\\ud83c[\\udfcb\\udfcc]|\\ud83d[\\udd74\\udd75]|\\u26f9)((?:\\ud83c[\\udffb-\\udfff]|\\ufe0f)\\u200d[\\u2640\\u2642]\\ufe0f)|(?:\\ud83c[\\udfc3\\udfc4\\udfca]|\\ud83d[\\udc6e\\udc70\\udc71\\udc73\\udc77\\udc81\\udc82\\udc86\\udc87\\ude45-\\ude47\\ude4b\\ude4d\\ude4e\\udea3\\udeb4-\\udeb6]|\\ud83e[\\udd26\\udd35\\udd37-\\udd39\\udd3d\\udd3e\\uddb8\\uddb9\\uddcd-\\uddcf\\uddd6-\\udddd])(?:\\ud83c[\\udffb-\\udfff])?\\u200d[\\u2640\\u2642]\\ufe0f|(?:\\ud83d\\udc68\\u200d\\u2764\\ufe0f\\u200d\\ud83d\\udc8b\\u200d\\ud83d\\udc68|\\ud83d\\udc68\\u200d\\ud83d\\udc68\\u200d\\ud83d\\udc66\\u200d\\ud83d\\udc66|\\ud83d\\udc68\\u200d\\ud83d\\udc68\\u200d\\ud83d\\udc67\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc68\\u200d\\ud83d\\udc69\\u200d\\ud83d\\udc66\\u200d\\ud83d\\udc66|\\ud83d\\udc68\\u200d\\ud83d\\udc69\\u200d\\ud83d\\udc67\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc69\\u200d\\u2764\\ufe0f\\u200d\\ud83d\\udc8b\\u200d\\ud83d[\\udc68\\udc69]|\\ud83d\\udc69\\u200d\\ud83d\\udc69\\u200d\\ud83d\\udc66\\u200d\\ud83d\\udc66|\\ud83d\\udc69\\u200d\\ud83d\\udc69\\u200d\\ud83d\\udc67\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc68\\u200d\\u2764\\ufe0f\\u200d\\ud83d\\udc68|\\ud83d\\udc68\\u200d\\ud83d\\udc66\\u200d\\ud83d\\udc66|\\ud83d\\udc68\\u200d\\ud83d\\udc67\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc68\\u200d\\ud83d\\udc68\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc68\\u200d\\ud83d\\udc69\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc69\\u200d\\u2764\\ufe0f\\u200d\\ud83d[\\udc68\\udc69]|\\ud83d\\udc69\\u200d\\ud83d\\udc66\\u200d\\ud83d\\udc66|\\ud83d\\udc69\\u200d\\ud83d\\udc67\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc69\\u200d\\ud83d\\udc69\\u200d\\ud83d[\\udc66\\udc67]|\\ud83c\\udff3\\ufe0f\\u200d\\u26a7\\ufe0f|\\ud83c\\udff3\\ufe0f\\u200d\\ud83c\\udf08|\\ud83c\\udff4\\u200d\\u2620\\ufe0f|\\ud83d\\udc15\\u200d\\ud83e\\uddba|\\ud83d\\udc3b\\u200d\\u2744\\ufe0f|\\ud83d\\udc41\\u200d\\ud83d\\udde8|\\ud83d\\udc68\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc69\\u200d\\ud83d[\\udc66\\udc67]|\\ud83d\\udc6f\\u200d\\u2640\\ufe0f|\\ud83d\\udc6f\\u200d\\u2642\\ufe0f|\\ud83e\\udd3c\\u200d\\u2640\\ufe0f|\\ud83e\\udd3c\\u200d\\u2642\\ufe0f|\\ud83e\\uddde\\u200d\\u2640\\ufe0f|\\ud83e\\uddde\\u200d\\u2642\\ufe0f|\\ud83e\\udddf\\u200d\\u2640\\ufe0f|\\ud83e\\udddf\\u200d\\u2642\\ufe0f|\\ud83d\\udc08\\u200d\\u2b1b)|[#*0-9]\\ufe0f?\\u20e3|(?:[©®\\u2122\\u265f]\\ufe0f*)|(?:\\ud83c[\\udc04\\udd70\\udd71\\udd7e\\udd7f\\ude02\\ude1a\\ude2f\\ude37\\udf21\\udf24-\\udf2c\\udf36\\udf7d\\udf96\\udf97\\udf99-\\udf9b\\udf9e\\udf9f\\udfcd\\udfce\\udfd4-\\udfdf\\udff3\\udff5\\udff7]|\\ud83d[\\udc3f\\udc41\\udcfd\\udd49\\udd4a\\udd6f\\udd70\\udd73\\udd76-\\udd79\\udd87\\udd8a-\\udd8d\\udda5\\udda8\\uddb1\\uddb2\\uddbc\\uddc2-\\uddc4\\uddd1-\\uddd3\\udddc-\\uddde\\udde1\\udde3\\udde8\\uddef\\uddf3\\uddfa\\udecb\\udecd-\\udecf\\udee0-\\udee5\\udee9\\udef0\\udef3]|[\\u203c\\u2049\\u2139\\u2194-\\u2199\\u21a9\\u21aa\\u231a\\u231b\\u2328\\u23cf\\u23ed-\\u23ef\\u23f1\\u23f2\\u23f8-\\u23fa\\u24c2\\u25aa\\u25ab\\u25b6\\u25c0\\u25fb-\\u25fe\\u2600-\\u2604\\u260e\\u2611\\u2614\\u2615\\u2618\\u2620\\u2622\\u2623\\u2626\\u262a\\u262e\\u262f\\u2638-\\u263a\\u2640\\u2642\\u2648-\\u2653\\u2660\\u2663\\u2665\\u2666\\u2668\\u267b\\u267f\\u2692-\\u2697\\u2699\\u269b\\u269c\\u26a0\\u26a1\\u26a7\\u26aa\\u26ab\\u26b0\\u26b1\\u26bd\\u26be\\u26c4\\u26c5\\u26c8\\u26cf\\u26d1\\u26d3\\u26d4\\u26e9\\u26ea\\u26f0-\\u26f5\\u26f8\\u26fa\\u26fd\\u2702\\u2708\\u2709\\u270f\\u2712\\u2714\\u2716\\u271d\\u2721\\u2733\\u2734\\u2744\\u2747\\u2757\\u2763\\u2764\\u27a1\\u2934\\u2935\\u2b05-\\u2b07\\u2b1b\\u2b1c\\u2b50\\u2b55\\u3030\\u303d\\u3297\\u3299])(?:\\ufe0f|(?!\\ufe0e))|(?:(?:\\ud83c[\\udfcb\\udfcc]|\\ud83d[\\udd74\\udd75\\udd90]|[\\u261d\\u26f7\\u26f9\\u270c\\u270d])(?:\\ufe0f|(?!\\ufe0e))|(?:\\ud83c[\\udf85\\udfc2-\\udfc4\\udfc7\\udfca]|\\ud83d[\\udc42\\udc43\\udc46-\\udc50\\udc66-\\udc69\\udc6e\\udc70-\\udc78\\udc7c\\udc81-\\udc83\\udc85-\\udc87\\udcaa\\udd7a\\udd95\\udd96\\ude45-\\ude47\\ude4b-\\ude4f\\udea3\\udeb4-\\udeb6\\udec0\\udecc]|\\ud83e[\\udd0c\\udd0f\\udd18-\\udd1c\\udd1e\\udd1f\\udd26\\udd30-\\udd39\\udd3d\\udd3e\\udd77\\uddb5\\uddb6\\uddb8\\uddb9\\uddbb\\uddcd-\\uddcf\\uddd1-\\udddd]|[\\u270a\\u270b]))(?:\\ud83c[\\udffb-\\udfff])?|(?:\\ud83c\\udff4\\udb40\\udc67\\udb40\\udc62\\udb40\\udc65\\udb40\\udc6e\\udb40\\udc67\\udb40\\udc7f|\\ud83c\\udff4\\udb40\\udc67\\udb40\\udc62\\udb40\\udc73\\udb40\\udc63\\udb40\\udc74\\udb40\\udc7f|\\ud83c\\udff4\\udb40\\udc67\\udb40\\udc62\\udb40\\udc77\\udb40\\udc6c\\udb40\\udc73\\udb40\\udc7f|\\ud83c\\udde6\\ud83c[\\udde8-\\uddec\\uddee\\uddf1\\uddf2\\uddf4\\uddf6-\\uddfa\\uddfc\\uddfd\\uddff]|\\ud83c\\udde7\\ud83c[\\udde6\\udde7\\udde9-\\uddef\\uddf1-\\uddf4\\uddf6-\\uddf9\\uddfb\\uddfc\\uddfe\\uddff]|\\ud83c\\udde8\\ud83c[\\udde6\\udde8\\udde9\\uddeb-\\uddee\\uddf0-\\uddf5\\uddf7\\uddfa-\\uddff]|\\ud83c\\udde9\\ud83c[\\uddea\\uddec\\uddef\\uddf0\\uddf2\\uddf4\\uddff]|\\ud83c\\uddea\\ud83c[\\udde6\\udde8\\uddea\\uddec\\udded\\uddf7-\\uddfa]|\\ud83c\\uddeb\\ud83c[\\uddee-\\uddf0\\uddf2\\uddf4\\uddf7]|\\ud83c\\uddec\\ud83c[\\udde6\\udde7\\udde9-\\uddee\\uddf1-\\uddf3\\uddf5-\\uddfa\\uddfc\\uddfe]|\\ud83c\\udded\\ud83c[\\uddf0\\uddf2\\uddf3\\uddf7\\uddf9\\uddfa]|\\ud83c\\uddee\\ud83c[\\udde8-\\uddea\\uddf1-\\uddf4\\uddf6-\\uddf9]|\\ud83c\\uddef\\ud83c[\\uddea\\uddf2\\uddf4\\uddf5]|\\ud83c\\uddf0\\ud83c[\\uddea\\uddec-\\uddee\\uddf2\\uddf3\\uddf5\\uddf7\\uddfc\\uddfe\\uddff]|\\ud83c\\uddf1\\ud83c[\\udde6-\\udde8\\uddee\\uddf0\\uddf7-\\uddfb\\uddfe]|\\ud83c\\uddf2\\ud83c[\\udde6\\udde8-\\udded\\uddf0-\\uddff]|\\ud83c\\uddf3\\ud83c[\\udde6\\udde8\\uddea-\\uddec\\uddee\\uddf1\\uddf4\\uddf5\\uddf7\\uddfa\\uddff]|\\ud83c\\uddf4\\ud83c\\uddf2|\\ud83c\\uddf5\\ud83c[\\udde6\\uddea-\\udded\\uddf0-\\uddf3\\uddf7-\\uddf9\\uddfc\\uddfe]|\\ud83c\\uddf6\\ud83c\\udde6|\\ud83c\\uddf7\\ud83c[\\uddea\\uddf4\\uddf8\\uddfa\\uddfc]|\\ud83c\\uddf8\\ud83c[\\udde6-\\uddea\\uddec-\\uddf4\\uddf7-\\uddf9\\uddfb\\uddfd-\\uddff]|\\ud83c\\uddf9\\ud83c[\\udde6\\udde8\\udde9\\uddeb-\\udded\\uddef-\\uddf4\\uddf7\\uddf9\\uddfb\\uddfc\\uddff]|\\ud83c\\uddfa\\ud83c[\\udde6\\uddec\\uddf2\\uddf3\\uddf8\\uddfe\\uddff]|\\ud83c\\uddfb\\ud83c[\\udde6\\udde8\\uddea\\uddec\\uddee\\uddf3\\uddfa]|\\ud83c\\uddfc\\ud83c[\\uddeb\\uddf8]|\\ud83c\\uddfd\\ud83c\\uddf0|\\ud83c\\uddfe\\ud83c[\\uddea\\uddf9]|\\ud83c\\uddff\\ud83c[\\udde6\\uddf2\\uddfc]|\\ud83c[\\udccf\\udd8e\\udd91-\\udd9a\\udde6-\\uddff\\ude01\\ude32-\\ude36\\ude38-\\ude3a\\ude50\\ude51\\udf00-\\udf20\\udf2d-\\udf35\\udf37-\\udf7c\\udf7e-\\udf84\\udf86-\\udf93\\udfa0-\\udfc1\\udfc5\\udfc6\\udfc8\\udfc9\\udfcf-\\udfd3\\udfe0-\\udff0\\udff4\\udff8-\\udfff]|\\ud83d[\\udc00-\\udc3e\\udc40\\udc44\\udc45\\udc51-\\udc65\\udc6a\\udc6f\\udc79-\\udc7b\\udc7d-\\udc80\\udc84\\udc88-\\udca9\\udcab-\\udcfc\\udcff-\\udd3d\\udd4b-\\udd4e\\udd50-\\udd67\\udda4\\uddfb-\\ude44\\ude48-\\ude4a\\ude80-\\udea2\\udea4-\\udeb3\\udeb7-\\udebf\\udec1-\\udec5\\uded0-\\uded2\\uded5-\\uded7\\udeeb\\udeec\\udef4-\\udefc\\udfe0-\\udfeb]|\\ud83e[\\udd0d\\udd0e\\udd10-\\udd17\\udd1d\\udd20-\\udd25\\udd27-\\udd2f\\udd3a\\udd3c\\udd3f-\\udd45\\udd47-\\udd76\\udd78\\udd7a-\\uddb4\\uddb7\\uddba\\uddbc-\\uddcb\\uddd0\\uddde-\\uddff\\ude70-\\ude74\\ude78-\\ude7a\\ude80-\\ude86\\ude90-\\udea8\\udeb0-\\udeb6\\udec0-\\udec2\\uded0-\\uded6]|[\\u23e9-\\u23ec\\u23f0\\u23f3\\u267e\\u26ce\\u2705\\u2728\\u274c\\u274e\\u2753-\\u2755\\u2795-\\u2797\\u27b0\\u27bf\\ue50a])';
var alphaCharsRegExp = 'a-z' +
  '\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u00ff' + // Latin-1
  '\\u0100-\\u024f' + // Latin Extended A and B
  '\\u0253\\u0254\\u0256\\u0257\\u0259\\u025b\\u0263\\u0268\\u026f\\u0272\\u0289\\u028b' + // IPA Extensions
  '\\u02bb' + // Hawaiian
  '\\u0300-\\u036f' + // Combining diacritics
  '\\u1e00-\\u1eff' + // Latin Extended Additional (mostly for Vietnamese)
  '\\u0400-\\u04ff\\u0500-\\u0527' + // Cyrillic
  '\\u2de0-\\u2dff\\ua640-\\ua69f' + // Cyrillic Extended A/B
  '\\u0591-\\u05bf\\u05c1-\\u05c2\\u05c4-\\u05c5\\u05c7' +
  '\\u05d0-\\u05ea\\u05f0-\\u05f4' + // Hebrew
  '\\ufb1d-\\ufb28\\ufb2a-\\ufb36\\ufb38-\\ufb3c\\ufb3e\\ufb40-\\ufb41' +
  '\\ufb43-\\ufb44\\ufb46-\\ufb4f' + // Hebrew Pres. Forms
  '\\u0610-\\u061a\\u0620-\\u065f\\u066e-\\u06d3\\u06d5-\\u06dc' +
  '\\u06de-\\u06e8\\u06ea-\\u06ef\\u06fa-\\u06fc\\u06ff' + // Arabic
  '\\u0750-\\u077f\\u08a0\\u08a2-\\u08ac\\u08e4-\\u08fe' + // Arabic Supplement and Extended A
  '\\ufb50-\\ufbb1\\ufbd3-\\ufd3d\\ufd50-\\ufd8f\\ufd92-\\ufdc7\\ufdf0-\\ufdfb' + // Pres. Forms A
  '\\ufe70-\\ufe74\\ufe76-\\ufefc' + // Pres. Forms B
  '\\u200c' + // Zero-Width Non-Joiner
  '\\u0e01-\\u0e3a\\u0e40-\\u0e4e' + // Thai
  '\\u1100-\\u11ff\\u3130-\\u3185\\uA960-\\uA97F\\uAC00-\\uD7AF\\uD7B0-\\uD7FF' + // Hangul (Korean)
  '\\u3003\\u3005\\u303b' + // Kanji/Han iteration marks
  '\\uff21-\\uff3a\\uff41-\\uff5a' + // full width Alphabet
  '\\uff66-\\uff9f' + // half width Katakana
  '\\uffa1-\\uffdc'; // half width Hangul (Korean)
var alphaNumericRegExp = '0-9\_' + alphaCharsRegExp;
var domainAddChars = '\u00b7';
// Based on Regular Expression for URL validation by Diego Perini
var urlRegExp = '((?:https?|ftp)://|mailto:)?' +
  // user:pass authentication
  '(?:\\S{1,64}(?::\\S{0,64})?@)?' +
  '(?:' +
  // sindresorhus/ip-regexp
  '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}' +
  '|' +
  // host name
  '[' + alphaCharsRegExp + '0-9][' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}' +
  // domain name
  '(?:\\.[' + alphaCharsRegExp + '0-9][' + alphaCharsRegExp + domainAddChars + '0-9\-]{0,64}){0,10}' +
  // TLD identifier
  '(?:\\.(xn--[0-9a-z]{2,16}|[' + alphaCharsRegExp + ']{2,24}))' +
  ')' +
  // port number
  '(?::\\d{2,5})?' +
  // resource path
  '(?:/(?:\\S{0,255}[^\\s.;,(\\[\\]{}<>"\'])?)?'
var usernameRegExp = '[a-zA-Z\\d_]{5,32}'
var botCommandRegExp = '\\/([a-zA-Z\\d_]{1,32})(?:@(' + usernameRegExp + '))?(\\b|$)'
var fullRegExp = new RegExp('(^| )(@)(' + usernameRegExp + ')|(' + urlRegExp + ')|(\\n)|(' + emojiRegExp + ')|(^|[\\s\\(\\]])(#[' + alphaNumericRegExp + ']{2,64})|(^|\\s)' + botCommandRegExp, 'i')
var emailRegExp = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
var markdownTestRegExp = /[`_*@]/
var markdownRegExp = /(^|\s|\n)(````?)([\s\S]+?)(````?)([\s\n\.,:?!;]|$)|(^|\s)(`|\*\*|__)([^\n]+?)\7([\s\.,:?!;]|$)|@(\d+)\s*\((.+?)\)/m
var siteHashtags = {
  Telegram: 'tg://search_hashtag?hashtag={1}',
  Twitter: 'https://twitter.com/hashtag/{1}',
  Instagram: 'https://instagram.com/explore/tags/{1}/',
  'Google Plus': 'https://plus.google.com/explore/{1}'
}
var siteMentions = {
  Telegram: '#/im?p=%40{1}',
  Twitter: 'https://twitter.com/{1}',
  Instagram: 'https://instagram.com/{1}/',
  GitHub: 'https://github.com/{1}'
}
var markdownEntities = {
  '`': 'messageEntityCode',
  '**': 'messageEntityBold',
  '__': 'messageEntityItalic'
} 
function getEmojiSpritesheetCoords(emojiCode) {
  let emojiInfo = emojiData[emojiCode.replace(/\ufe0f/g, '')];
  if(emojiInfo === undefined) {
    //console.error('no emoji by code:', emojiCode, emojiCode && emojiCode.length, new TextEncoder().encode(emojiCode), emojiUnicode(emojiCode));
    return null;
  }

  return emojiUnicode(emojiCode);
}
function parseEntities(text, options = {}) {
  var match;
  var raw = text, url;
  var entities = [], matchIndex;
  var rawOffset = 0;
  // var start = tsNow()
  while((match = raw.match(fullRegExp))) {
    matchIndex = rawOffset + match.index;

    //console.log('parseEntities match:', match);

    if(match[3]) { // mentions
      entities.push({
        _: 'messageEntityMention',
        offset: matchIndex + match[1].length,
        length: match[2].length + match[3].length
      });
    } else if(match[4]) {
      if(emailRegExp.test(match[4])) { // email
        entities.push({
          _: 'messageEntityEmail',
          offset: matchIndex,
          length: match[4].length
        });
      } else {
        var url = false;
        var protocol = match[5];
        var tld = match[6];
        var excluded = '';
        if(tld) { // URL
          if(!protocol && (tld.substr(0, 4) === 'xn--' || Config.TLD.indexOf(tld.toLowerCase()) !== -1)) {
            protocol = 'http://';
          }

          if(protocol) {
            var balanced = checkBrackets(match[4]);
            if (balanced.length !== match[4].length) {
              excluded = match[4].substring(balanced.length);
              match[4] = balanced;
            }

            url = (match[5] ? '' : protocol) + match[4];
          }
        } else { // IP address
          url = (match[5] ? '' : 'http://') + match[4];
        }

        if (url) {
          entities.push({
            _: 'messageEntityUrl',
            offset: matchIndex,
            length: match[4].length
          });
        }
      }
    } else if(match[7]) { // New line
      entities.push({
        _: 'messageEntityLinebreak',
        offset: matchIndex,
        length: 1
      });
    } else if(match[8]) { // Emoji
      //console.log('hit', match[8]);
      let emojiCoords = getEmojiSpritesheetCoords(match[8]);
      if(emojiCoords) {
        entities.push({
          _: 'messageEntityEmoji',
          offset: matchIndex,
          length: match[8].length,
          unicode: emojiCoords
        });
      }
    } else if(match[10]) { // Hashtag
      entities.push({
        _: 'messageEntityHashtag',
        offset: matchIndex + (match[9] ? match[9].length : 0),
        length: match[10].length
      });
    } else if(match[12]) { // Bot command
      entities.push({
        _: 'messageEntityBotCommand',
        offset: matchIndex + (match[11] ? match[11].length : 0),
        length: 1 + match[12].length + (match[13] ? 1 + match[13].length : 0)
      });
    }

    raw = raw.substr(match.index + match[0].length);
    rawOffset += match.index + match[0].length;
  }

  // if (entities.length) {
  //   console.log('parse entities', text, entities.slice())
  // }
  return entities
}
function parseEmojis (text) {
  return text.replace(/:([a-z0-9\-\+\*_]+?):/gi, function (all, shortcut) {
    var emojiCode = EmojiHelper.shortcuts[shortcut]
    if (emojiCode !== undefined) {
      return EmojiHelper.emojis[emojiCode][0]
    }
    return all
  })
}
function parseMarkdown (text, entities, noTrim) {
   if (!markdownTestRegExp.test(text)) {
    return noTrim ? text : text.trim()
  }
  var raw = text
  var match
  var newText = []
  var rawOffset = 0
  var matchIndex
  while (match = raw.match(markdownRegExp)) {
    matchIndex = rawOffset + match.index
    newText.push(raw.substr(0, match.index))
    var text = (match[3] || match[8] || match[11])
    rawOffset -= text.length
    text = text.replace(/^\s+|\s+$/g, '')
    rawOffset += text.length
    if (text.match(/^`*$/)) {
      newText.push(match[0])
    }
    else if (match[3]) { // pre
      if (match[5] == '\n') {
        match[5] = ''
        rawOffset -= 1
      }
      newText.push(match[1] + text + match[5])
      entities.push({
        _: 'messageEntityPre',
        language: '',
        offset: matchIndex + match[1].length,
        length: text.length
      })
      rawOffset -= match[2].length + match[4].length
    } else if (match[7]) { // code|italic|bold
      newText.push(match[6] + text + match[9])
      entities.push({
        _: markdownEntities[match[7]],
        offset: matchIndex + match[6].length,
        length: text.length
      })
      rawOffset -= match[7].length * 2
    } else if (match[11]) { // custom mention
      newText.push(text)
      entities.push({
        _: 'messageEntityMentionName',
        user_id: match[10],
        offset: matchIndex,
        length: text.length
      })
      rawOffset -= match[0].length - text.length
    }
    raw = raw.substr(match.index + match[0].length)
    rawOffset += match.index + match[0].length
  }
  newText.push(raw)
  newText = newText.join('')
  if (!newText.replace(/\s+/g, '').length) {
    newText = text
    entities.splice(0, entities.length)
  }
  if (!entities.length && !noTrim) {
    newText = newText.trim()
  }
  return newText
}
function mergeEntities (currentEntities, newEntities, fromApi) {
  var totalEntities = newEntities.slice()
  var i
  var len = currentEntities.length
  var j
  var len2 = newEntities.length
  var startJ = 0
  var curEntity
  var newEntity
  var start, end
  var cStart, cEnd
  var bad
  for (i = 0; i < len; i++) {
    curEntity = currentEntities[i]
    if (fromApi &&
      curEntity._ != 'messageEntityLinebreak' &&
      curEntity._ != 'messageEntityEmoji') {
      continue
    }
    // console.log('s', curEntity, newEntities)
    start = curEntity.offset
    end = start + curEntity.length
    bad = false
    for (j = startJ; j < len2; j++) {
      newEntity = newEntities[j]
      cStart = newEntity.offset
      cEnd = cStart + newEntity.length
      if (cStart <= start) {
        startJ = j
      }
      if (start >= cStart && start < cEnd ||
        end > cStart && end <= cEnd) {
        // console.log('bad', curEntity, newEntity)
        if (fromApi &&
          start >= cStart && end <= cEnd) {
          if (newEntity.nested === undefined) {
            newEntity.nested = []
          }
          curEntity.offset -= cStart
          newEntity.nested.push(copy(curEntity))
        }
        bad = true
        break
      }
      if (cStart >= end) {
        break
      }
    }
    if (bad) {
      continue
    }
    totalEntities.push(curEntity)
  }
  totalEntities.sort(function (a, b) {
    return a.offset - b.offset
  })
  // console.log('merge', currentEntities, newEntities, totalEntities)
  return totalEntities
}
function wrapRichNestedText (text, nested, options) {
  if (nested === undefined) {
    return encodeEntities(text)
  }
  options.hasNested = true
  return wrapRichText(text, {entities: nested, nested: true})
}
function wrapRichText (text, options = {}) {
  if(!text || !text.length) {
    return ''
  }

  var entities = options.entities;
  var contextSite = options.contextSite || 'Telegram';
  var contextExternal = contextSite != 'Telegram';
  var emojiFound = false;
  if(entities === undefined) {
    entities = parseEntities(text, options);
  }

  //console.log('wrapRichText got entities:', text, entities);
  var len = entities.length;
  var entity;
  var entityText;
  var skipEntity;
  var url;
  var html = [];
  var lastOffset = 0;
  for(var i = 0; i < len; i++) {
    entity = entities[i];
    if(entity.offset > lastOffset) {
      html.push(
        encodeEntities(text.substr(lastOffset, entity.offset - lastOffset))
      );
    } else if(entity.offset < lastOffset) {
      continue;
    }

    skipEntity = false;
    entityText = text.substr(entity.offset, entity.length);
    switch(entity._) {
      case 'messageEntityMention':
        var contextUrl = !options.noLinks && siteMentions[contextSite]
        if (!contextUrl) {
          skipEntity = true
          break
        }
        var username = entityText.substr(1)
        var attr = ''
        if (options.highlightUsername &&
          options.highlightUsername.toLowerCase() == username.toLowerCase()) {
          attr = 'class="im_message_mymention"'
        }
        html.push(
          '<a ',
          attr,
          contextExternal ? ' target="_blank" rel="noopener noreferrer" ' : '',
          ' href="',
          contextUrl.replace('{1}', encodeURIComponent(username)),
          '">',
          encodeEntities(entityText),
          '</a>'
        )
        break
      case 'messageEntityMentionName':
        if (options.noLinks) {
          skipEntity = true
          break
        }
        html.push(
          '<a href="#/im?p=u',
          encodeURIComponent(entity.user_id),
          '">',
          encodeEntities(entityText),
          '</a>'
        )
        break
      case 'messageEntityHashtag':
        var contextUrl = !options.noLinks && siteHashtags[contextSite]
        if (!contextUrl) {
          skipEntity = true
          break
        }
        var hashtag = entityText.substr(1)
        html.push(
          '<a ',
          contextExternal ? ' target="_blank" rel="noopener noreferrer" ' : '',
          'href="',
          contextUrl.replace('{1}', encodeURIComponent(hashtag))
          ,
          '">',
          encodeEntities(entityText),
          '</a>'
        )
        break
      case 'messageEntityEmail':
        if (options.noLinks) {
          skipEntity = true
          break
        }
        html.push(
          '<a href="',
          encodeEntities('mailto:' + entityText),
          '" target="_blank" rel="noopener noreferrer">',
          encodeEntities(entityText),
          '</a>'
        )
        break
      case 'messageEntityUrl':
      case 'messageEntityTextUrl':
        var inner
        if (entity._ == 'messageEntityTextUrl') {
          url = entity.url
          url = wrapUrl(url, true)
          inner = wrapRichNestedText(entityText, entity.nested, options)
        } else {
          url = wrapUrl(entityText, false)
          inner = encodeEntities(replaceUrlEncodings(entityText))
        }
        if (options.noLinks) {
          html.push(inner);
        } else {
          html.push(
            '<a href="',
            encodeEntities(url),
            '" target="_blank" rel="noopener noreferrer">',
            inner,
            '</a>'
          )
        }
        break
      case 'messageEntityLinebreak':
        html.push(options.noLinebreaks ? ' ' : '<br/>')
        break
      case 'messageEntityEmoji':
        html.push(emojiSupported ? 
          `<span class="emoji" contenteditable="false">${encodeEntities(entityText)}</span>` : 
          `<img src="assets/img/emoji/${entity.unicode}.png" alt="${encodeEntities(entityText)}" class="emoji">`);

        emojiFound = true;
        break
      case 'messageEntityBotCommand':
        if (options.noLinks || options.noCommands || contextExternal) {
          skipEntity = true
          break
        }
        var command = entityText.substr(1)
        var bot
        var atPos
        if ((atPos = command.indexOf('@')) != -1) {
          bot = command.substr(atPos + 1)
          command = command.substr(0, atPos)
        } else {
          bot = options.fromBot
        }
        html.push(
          '<a href="',
          encodeEntities('tg://bot_command?command=' + encodeURIComponent(command) + (bot ? '&bot=' + encodeURIComponent(bot) : '')),
          '">',
          encodeEntities(entityText),
          '</a>'
        )
        break
      case 'messageEntityBold':
        if(options.noTextFormat) {
          html.push(wrapRichNestedText(entityText, entity.nested, options));
          break;
        }
        
        html.push(
          '<strong>',
          wrapRichNestedText(entityText, entity.nested, options),
          '</strong>'
        )
        break
      case 'messageEntityItalic':
        if(options.noTextFormat) {
          html.push(wrapRichNestedText(entityText, entity.nested, options));
          break;
        }

        html.push(
          '<em>',
          wrapRichNestedText(entityText, entity.nested, options),
          '</em>'
        )
        break
      case 'messageEntityHighlight':
        html.push(
          '<i>',
          wrapRichNestedText(entityText, entity.nested, options),
          '</i>'
        )
        break;
      case 'messageEntityCode':
        if(options.noTextFormat) {
          html.push(encodeEntities(entityText));
          break;
        }

        html.push(
          '<code>',
          encodeEntities(entityText),
          '</code>'
        )
        break
      case 'messageEntityPre':
        if(options.noTextFormat) {
          html.push(encodeEntities(entityText));
          break;
        }
        
        html.push(
          '<pre><code', (entity.language ? ' class="language-' + encodeEntities(entity.language) + '"' : ''), '>',
          encodeEntities(entityText),
          '</code></pre>'
        )
        break
      default:
        skipEntity = true
    }
    lastOffset = entity.offset + (skipEntity ? 0 : entity.length)
  }

  html.push(encodeEntities(text.substr(lastOffset))); // may be empty string
  //console.log(html);
  text = html.join('')//$sanitize(html.join(''))
  /* if (!options.nested && (emojiFound || options.hasNested)) {
    text = text.replace(/\ufe0f|&#65039;|&#65533;|&#8205;/g, '', text)
    var emojiSizeClass = curEmojiSize == 18 ? '' : (' emoji-w' + curEmojiSize)
    text = text.replace(/<span((?: [^>]*)?) class="emoji emoji-(\d)-(\d+)-(\d+)"(.+?)<\/span>/g,
      '<span$1 class="emoji ' + emojiSizeClass + ' emoji-spritesheet-$2" style="background-position: -$3px -$4px;" $5</span>')
  } */
  return text;//$sce.trustAs('html', text)
}
function wrapDraftText (text, options) {
  if (!text || !text.length) {
    return ''
  }
  options = options || {}
  var entities = options.entities
  if (entities === undefined) {
    entities = parseEntities(text, options)
  }
  var i = 0
  var len = entities.length
  var entity
  var entityText
  var skipEntity
  var code = []
  var lastOffset = 0
  for (i = 0; i < len; i++) {
    entity = entities[i]
    if (entity.offset > lastOffset) {
      code.push(
        text.substr(lastOffset, entity.offset - lastOffset)
      )
    }
    else if (entity.offset < lastOffset) {
      continue
    }
    skipEntity = false
    entityText = text.substr(entity.offset, entity.length)
    switch (entity._) {
      case 'messageEntityEmoji':
        code.push(
          ':',
          entity.title,
          ':'
        )
        break
      case 'messageEntityCode':
        code.push(
          '`', entityText, '`'
        )
        break
      case 'messageEntityBold':
        code.push(
          '**', entityText, '**'
        )
        break
      case 'messageEntityItalic':
        code.push(
          '__', entityText, '__'
        )
        break
      case 'messageEntityPre':
        code.push(
          '```', entityText, '```'
        )
        break
      case 'messageEntityMentionName':
        code.push(
          '@', entity.user_id, ' (', entityText, ')'
        )
        break
      default:
        skipEntity = true
    }
    lastOffset = entity.offset + (skipEntity ? 0 : entity.length)
  }
  code.push(text.substr(lastOffset))
  return code.join('')
}
function checkBrackets (url) {
  var urlLength = url.length
  var urlOpenBrackets = url.split('(').length - 1
  var urlCloseBrackets = url.split(')').length - 1
  while (urlCloseBrackets > urlOpenBrackets &&
    url.charAt(urlLength - 1) === ')') {
    url = url.substr(0, urlLength - 1)
    urlCloseBrackets--
    urlLength--
  }
  if (urlOpenBrackets > urlCloseBrackets) {
    url = url.replace(/\)+$/, '')
  }
  return url
}

function replaceUrlEncodings(urlWithEncoded) {
  return urlWithEncoded.replace(/(%[A-Z\d]{2})+/g, function (str) {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  });
}

function wrapPlainText(text, options = {}) {
  if(emojiSupported) {
    return text;
  }

  if(!text || !text.length) {
    return '';
  }

  text = text.replace(/\ufe0f/g, '', text);
  var match;
  var raw = text;
  var text = [],
    emojiTitle;
  while((match = raw.match(fullRegExp))) {
    text.push(raw.substr(0, match.index))
    if(match[8]) {
      if((emojiCode = EmojiHelper.emojiMap[match[8]]) &&
        (emojiTitle = emojiData[emojiCode][1][0])) {
        text.push(':' + emojiTitle + ':');
      } else {
        text.push(match[0]);
      }
    } else {
      text.push(match[0]);
    }

    raw = raw.substr(match.index + match[0].length);
  }
  text.push(raw);
  return text.join('');
}
function wrapEmojiText(text) {
  if(!text) return '';

  let entities = parseEntities(text).filter(e => e._ == 'messageEntityEmoji');
  return wrapRichText(text, {entities});
}
function wrapUrl (url, unsafe) {
  if (!url.match(/^https?:\/\//i)) {
    url = 'http://' + url
  }
  var tgMeMatch
  var telescoPeMatch
  if (unsafe == 2) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url)
  }
  else if ((tgMeMatch = url.match(/^https?:\/\/t(?:elegram)?\.me\/(.+)/))) {
    var fullPath = tgMeMatch[1]
    var path = fullPath.split('/')
    switch (path[0]) {
      case 'joinchat':
        url = 'tg://join?invite=' + path[1]
        break
      case 'addstickers':
        url = 'tg://addstickers?set=' + path[1]
        break
      default:
        if (path[1] && path[1].match(/^\d+$/)) {
          url = 'tg://resolve?domain=' + path[0] + '&post=' + path[1]
        }
        else if (path.length == 1) {
          var domainQuery = path[0].split('?')
          var domain = domainQuery[0]
          var query = domainQuery[1]
          if (domain == 'iv') {
            var match = (query || '').match(/url=([^&=]+)/)
            if (match) {
              url = match[1]
              try {
                url = decodeURIComponent(url)
              } catch (e) {}
              return wrapUrl(url, unsafe)
            }
          }
          url = 'tg://resolve?domain=' + domain + (query ? '&' + query : '')
        }
    }
  }
  else if ((telescoPeMatch = url.match(/^https?:\/\/telesco\.pe\/([^/?]+)\/(\d+)/))) {
    url = 'tg://resolve?domain=' + telescoPeMatch[1] + '&post=' + telescoPeMatch[2]
  }
  else if (unsafe) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url)
  }
  return url
}

let RichTextProcessor = {
  wrapRichText: wrapRichText,
  wrapPlainText: wrapPlainText,
  wrapDraftText: wrapDraftText,
  wrapUrl: wrapUrl,
  wrapEmojiText: wrapEmojiText,
  parseEntities: parseEntities,
  parseMarkdown: parseMarkdown,
  parseEmojis: parseEmojis,
  mergeEntities: mergeEntities,
  getEmojiSpritesheetCoords: getEmojiSpritesheetCoords,
  emojiSupported: emojiSupported
};

window.RichTextProcessor = RichTextProcessor;

export {RichTextProcessor};

