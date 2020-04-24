import {encodeEntities, copy/* , emojiUnicode */} from './utils';

var EmojiHelper = {
  emojiMap: (code) => { return code; },
  shortcuts: [],
  emojis: []
};

var emojiData = Config.Emoji;
var emojiIconSize = emojiData.img_size;
var emojiSupported = navigator.userAgent.search(/OS X|iPhone|iPad|iOS|Android/i) != -1/*  && false */,
  emojiCode;
//var emojiRegExp = '\\u0023\\u20E3|\\u00a9|\\u00ae|\\u203c|\\u2049|\\u2139|[\\u2194-\\u2199]|\\u21a9|\\u21aa|\\u231a|\\u231b|\\u23e9|[\\u23ea-\\u23ec]|\\u23f0|\\u24c2|\\u25aa|\\u25ab|\\u25b6|\\u2611|\\u2614|\\u26fd|\\u2705|\\u2709|[\\u2795-\\u2797]|\\u27a1|\\u27b0|\\u27bf|\\u2934|\\u2935|[\\u2b05-\\u2b07]|\\u2b1b|\\u2b1c|\\u2b50|\\u2b55|\\u3030|\\u303d|\\u3297|\\u3299|[\\uE000-\\uF8FF\\u270A-\\u2764\\u2122\\u25C0\\u25FB-\\u25FE\\u2615\\u263a\\u2648-\\u2653\\u2660-\\u2668\\u267B\\u267F\\u2693\\u261d\\u26A0-\\u26FA\\u2708\\u2702\\u2601\\u260E]|[\\u2600\\u26C4\\u26BE\\u23F3\\u2764]|\\uD83D[\\uDC00-\\uDFFF]|\\uD83C[\\uDDE8-\\uDDFA\uDDEC]\\uD83C[\\uDDEA-\\uDDFA\uDDE7]|[0-9]\\u20e3|\\uD83C[\\uDC00-\\uDFFF]';
//var emojiRegExp = '\\u00a9|\\u00ae|[\\u2000-\\u3300]|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff]';
var emojiRegExp = '\\uD83C\\uDFF4\\uDB40\\uDC67\\uDB40\\uDC62(?:\\uDB40\\uDC77\\uDB40\\uDC6C\\uDB40\\uDC73|\\uDB40\\uDC73\\uDB40\\uDC63\\uDB40\\uDC74|\\uDB40\\uDC65\\uDB40\\uDC6E\\uDB40\\uDC67)\\uDB40\\uDC7F|(?:\\uD83E\\uDDD1\\uD83C\\uDFFB\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1|\\uD83D\\uDC69\\uD83C\\uDFFC\\u200D\\uD83E\\uDD1D\\u200D\\uD83D\\uDC69)\\uD83C\\uDFFB|\\uD83D\\uDC68(?:\\uD83C\\uDFFC\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68\\uD83C\\uDFFB|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFF\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB-\\uDFFE])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFE\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB-\\uDFFD])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFD\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB\\uDFFC])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\u200D(?:\\u2764\\uFE0F\\u200D(?:\\uD83D\\uDC8B\\u200D)?\\uD83D\\uDC68|(?:\\uD83D[\\uDC68\\uDC69])\\u200D(?:\\uD83D\\uDC66\\u200D\\uD83D\\uDC66|\\uD83D\\uDC67\\u200D(?:\\uD83D[\\uDC66\\uDC67]))|\\uD83D\\uDC66\\u200D\\uD83D\\uDC66|\\uD83D\\uDC67\\u200D(?:\\uD83D[\\uDC66\\uDC67])|(?:\\uD83D[\\uDC68\\uDC69])\\u200D(?:\\uD83D[\\uDC66\\uDC67])|[\\u2695\\u2696\\u2708]\\uFE0F|\\uD83D[\\uDC66\\uDC67]|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|(?:\\uD83C\\uDFFB\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFF\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFE\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFD\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFC\\u200D[\\u2695\\u2696\\u2708])\\uFE0F|\\uD83C\\uDFFB\\u200D(?:\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C[\\uDFFB-\\uDFFF])|\\uD83E\\uDDD1(?:\\uD83C\\uDFFF\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1(?:\\uD83C[\\uDFFB-\\uDFFF])|\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1)|\\uD83D\\uDC69(?:\\uD83C\\uDFFE\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB-\\uDFFD\\uDFFF])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFD\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB\\uDFFC\\uDFFE\\uDFFF])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFC\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFB\\uDFFD-\\uDFFF])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFB\\u200D(?:\\uD83E\\uDD1D\\u200D\\uD83D\\uDC68(?:\\uD83C[\\uDFFC-\\uDFFF])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\u200D(?:\\u2764\\uFE0F\\u200D(?:\\uD83D\\uDC8B\\u200D(?:\\uD83D[\\uDC68\\uDC69])|\\uD83D[\\uDC68\\uDC69])|\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD])|\\uD83C\\uDFFF\\u200D(?:\\uD83C[\\uDF3E\\uDF73\\uDF93\\uDFA4\\uDFA8\\uDFEB\\uDFED]|\\uD83D[\\uDCBB\\uDCBC\\uDD27\\uDD2C\\uDE80\\uDE92]|\\uD83E[\\uDDAF-\\uDDB3\\uDDBC\\uDDBD]))|(?:\\uD83E\\uDDD1\\uD83C\\uDFFE\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1|\\uD83D\\uDC69\\uD83C\\uDFFF\\u200D\\uD83E\\uDD1D\\u200D(?:\\uD83D[\\uDC68\\uDC69]))(?:\\uD83C[\\uDFFB-\\uDFFE])|(?:\\uD83E\\uDDD1\\uD83C\\uDFFD\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1|\\uD83D\\uDC69\\uD83C\\uDFFE\\u200D\\uD83E\\uDD1D\\u200D\\uD83D\\uDC69)(?:\\uD83C[\\uDFFB-\\uDFFD])|(?:\\uD83E\\uDDD1\\uD83C\\uDFFC\\u200D\\uD83E\\uDD1D\\u200D\\uD83E\\uDDD1|\\uD83D\\uDC69\\uD83C\\uDFFD\\u200D\\uD83E\\uDD1D\\u200D\\uD83D\\uDC69)(?:\\uD83C[\\uDFFB\\uDFFC])|\\uD83D\\uDC69\\u200D\\uD83D\\uDC69\\u200D(?:\\uD83D\\uDC66\\u200D\\uD83D\\uDC66|\\uD83D\\uDC67\\u200D(?:\\uD83D[\\uDC66\\uDC67]))|\\uD83D\\uDC69\\u200D\\uD83D\\uDC66\\u200D\\uD83D\\uDC66|\\uD83D\\uDC69\\u200D\\uD83D\\uDC69\\u200D(?:\\uD83D[\\uDC66\\uDC67])|(?:\\uD83D\\uDC41\\uFE0F\\u200D\\uD83D\\uDDE8|\\uD83D\\uDC69(?:\\uD83C\\uDFFF\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFE\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFD\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFC\\u200D[\\u2695\\u2696\\u2708]|\\uD83C\\uDFFB\\u200D[\\u2695\\u2696\\u2708]|\\u200D[\\u2695\\u2696\\u2708])|(?:\\uD83C[\\uDFC3\\uDFC4\\uDFCA]|\\uD83D[\\uDC6E\\uDC71\\uDC73\\uDC77\\uDC81\\uDC82\\uDC86\\uDC87\\uDE45-\\uDE47\\uDE4B\\uDE4D\\uDE4E\\uDEA3\\uDEB4-\\uDEB6]|\\uD83E[\\uDD26\\uDD37-\\uDD39\\uDD3D\\uDD3E\\uDDB8\\uDDB9\\uDDCD-\\uDDCF\\uDDD6-\\uDDDD])(?:\\uD83C[\\uDFFB-\\uDFFF])\\u200D[\\u2640\\u2642]|(?:\\u26F9|\\uD83C[\\uDFCB\\uDFCC]|\\uD83D\\uDD75)(?:\\uFE0F\\u200D[\\u2640\\u2642]|(?:\\uD83C[\\uDFFB-\\uDFFF])\\u200D[\\u2640\\u2642])|\\uD83C\\uDFF4\\u200D\\u2620|(?:\\uD83C[\\uDFC3\\uDFC4\\uDFCA]|\\uD83D[\\uDC6E\\uDC6F\\uDC71\\uDC73\\uDC77\\uDC81\\uDC82\\uDC86\\uDC87\\uDE45-\\uDE47\\uDE4B\\uDE4D\\uDE4E\\uDEA3\\uDEB4-\\uDEB6]|\\uD83E[\\uDD26\\uDD37-\\uDD39\\uDD3C-\\uDD3E\\uDDB8\\uDDB9\\uDDCD-\\uDDCF\\uDDD6-\\uDDDF])\\u200D[\\u2640\\u2642])\\uFE0F|\\uD83D\\uDC69\\u200D\\uD83D\\uDC67\\u200D(?:\\uD83D[\\uDC66\\uDC67])|\\uD83C\\uDFF3\\uFE0F\\u200D\\uD83C\\uDF08|\\uD83D\\uDC69\\u200D\\uD83D\\uDC67|\\uD83D\\uDC69\\u200D\\uD83D\\uDC66|\\uD83D\\uDC15\\u200D\\uD83E\\uDDBA|\\uD83C\\uDDFD\\uD83C\\uDDF0|\\uD83C\\uDDF6\\uD83C\\uDDE6|\\uD83C\\uDDF4\\uD83C\\uDDF2|\\uD83E\\uDDD1(?:\\uD83C[\\uDFFB-\\uDFFF])|\\uD83D\\uDC69(?:\\uD83C[\\uDFFB-\\uDFFF])|\\uD83C\\uDDFF(?:\\uD83C[\\uDDE6\\uDDF2\\uDDFC])|\\uD83C\\uDDFE(?:\\uD83C[\\uDDEA\\uDDF9])|\\uD83C\\uDDFC(?:\\uD83C[\\uDDEB\\uDDF8])|\\uD83C\\uDDFB(?:\\uD83C[\\uDDE6\\uDDE8\\uDDEA\\uDDEC\\uDDEE\\uDDF3\\uDDFA])|\\uD83C\\uDDFA(?:\\uD83C[\\uDDE6\\uDDEC\\uDDF2\\uDDF3\\uDDF8\\uDDFE\\uDDFF])|\\uD83C\\uDDF9(?:\\uD83C[\\uDDE6\\uDDE8\\uDDE9\\uDDEB-\\uDDED\\uDDEF-\\uDDF4\\uDDF7\\uDDF9\\uDDFB\\uDDFC\\uDDFF])|\\uD83C\\uDDF8(?:\\uD83C[\\uDDE6-\\uDDEA\\uDDEC-\\uDDF4\\uDDF7-\\uDDF9\\uDDFB\\uDDFD-\\uDDFF])|\\uD83C\\uDDF7(?:\\uD83C[\\uDDEA\\uDDF4\\uDDF8\\uDDFA\\uDDFC])|\\uD83C\\uDDF5(?:\\uD83C[\\uDDE6\\uDDEA-\\uDDED\\uDDF0-\\uDDF3\\uDDF7-\\uDDF9\\uDDFC\\uDDFE])|\\uD83C\\uDDF3(?:\\uD83C[\\uDDE6\\uDDE8\\uDDEA-\\uDDEC\\uDDEE\\uDDF1\\uDDF4\\uDDF5\\uDDF7\\uDDFA\\uDDFF])|\\uD83C\\uDDF2(?:\\uD83C[\\uDDE6\\uDDE8-\\uDDED\\uDDF0-\\uDDFF])|\\uD83C\\uDDF1(?:\\uD83C[\\uDDE6-\\uDDE8\\uDDEE\\uDDF0\\uDDF7-\\uDDFB\\uDDFE])|\\uD83C\\uDDF0(?:\\uD83C[\\uDDEA\\uDDEC-\\uDDEE\\uDDF2\\uDDF3\\uDDF5\\uDDF7\\uDDFC\\uDDFE\\uDDFF])|\\uD83C\\uDDEF(?:\\uD83C[\\uDDEA\\uDDF2\\uDDF4\\uDDF5])|\\uD83C\\uDDEE(?:\\uD83C[\\uDDE8-\\uDDEA\\uDDF1-\\uDDF4\\uDDF6-\\uDDF9])|\\uD83C\\uDDED(?:\\uD83C[\\uDDF0\\uDDF2\\uDDF3\\uDDF7\\uDDF9\\uDDFA])|\\uD83C\\uDDEC(?:\\uD83C[\\uDDE6\\uDDE7\\uDDE9-\\uDDEE\\uDDF1-\\uDDF3\\uDDF5-\\uDDFA\\uDDFC\\uDDFE])|\\uD83C\\uDDEB(?:\\uD83C[\\uDDEE-\\uDDF0\\uDDF2\\uDDF4\\uDDF7])|\\uD83C\\uDDEA(?:\\uD83C[\\uDDE6\\uDDE8\\uDDEA\\uDDEC\\uDDED\\uDDF7-\\uDDFA])|\\uD83C\\uDDE9(?:\\uD83C[\\uDDEA\\uDDEC\\uDDEF\\uDDF0\\uDDF2\\uDDF4\\uDDFF])|\\uD83C\\uDDE8(?:\\uD83C[\\uDDE6\\uDDE8\\uDDE9\\uDDEB-\\uDDEE\\uDDF0-\\uDDF5\\uDDF7\\uDDFA-\\uDDFF])|\\uD83C\\uDDE7(?:\\uD83C[\\uDDE6\\uDDE7\\uDDE9-\\uDDEF\\uDDF1-\\uDDF4\\uDDF6-\\uDDF9\\uDDFB\\uDDFC\\uDDFE\\uDDFF])|\\uD83C\\uDDE6(?:\\uD83C[\\uDDE8-\\uDDEC\\uDDEE\\uDDF1\\uDDF2\\uDDF4\\uDDF6-\\uDDFA\\uDDFC\\uDDFD\\uDDFF])|[#\\*0-9]\\uFE0F\\u20E3|(?:\\uD83C[\\uDFC3\\uDFC4\\uDFCA]|\\uD83D[\\uDC6E\\uDC71\\uDC73\\uDC77\\uDC81\\uDC82\\uDC86\\uDC87\\uDE45-\\uDE47\\uDE4B\\uDE4D\\uDE4E\\uDEA3\\uDEB4-\\uDEB6]|\\uD83E[\\uDD26\\uDD37-\\uDD39\\uDD3D\\uDD3E\\uDDB8\\uDDB9\\uDDCD-\\uDDCF\\uDDD6-\\uDDDD])(?:\\uD83C[\\uDFFB-\\uDFFF])|(?:\\u26F9|\\uD83C[\\uDFCB\\uDFCC]|\\uD83D\\uDD75)(?:\\uD83C[\\uDFFB-\\uDFFF])|(?:[\\u261D\\u270A-\\u270D]|\\uD83C[\\uDF85\\uDFC2\\uDFC7]|\\uD83D[\\uDC42\\uDC43\\uDC46-\\uDC50\\uDC66\\uDC67\\uDC6B-\\uDC6D\\uDC70\\uDC72\\uDC74-\\uDC76\\uDC78\\uDC7C\\uDC83\\uDC85\\uDCAA\\uDD74\\uDD7A\\uDD90\\uDD95\\uDD96\\uDE4C\\uDE4F\\uDEC0\\uDECC]|\\uD83E[\\uDD0F\\uDD18-\\uDD1C\\uDD1E\\uDD1F\\uDD30-\\uDD36\\uDDB5\\uDDB6\\uDDBB\\uDDD2-\\uDDD5])(?:\\uD83C[\\uDFFB-\\uDFFF])|(?:[\\u231A\\u231B\\u23E9-\\u23EC\\u23F0\\u23F3\\u25FD\\u25FE\\u2614\\u2615\\u2648-\\u2653\\u267F\\u2693\\u26A1\\u26AA\\u26AB\\u26BD\\u26BE\\u26C4\\u26C5\\u26CE\\u26D4\\u26EA\\u26F2\\u26F3\\u26F5\\u26FA\\u26FD\\u2705\\u270A\\u270B\\u2728\\u274C\\u274E\\u2753-\\u2755\\u2757\\u2795-\\u2797\\u27B0\\u27BF\\u2B1B\\u2B1C\\u2B50\\u2B55]|\\uD83C[\\uDC04\\uDCCF\\uDD8E\\uDD91-\\uDD9A\\uDDE6-\\uDDFF\\uDE01\\uDE1A\\uDE2F\\uDE32-\\uDE36\\uDE38-\\uDE3A\\uDE50\\uDE51\\uDF00-\\uDF20\\uDF2D-\\uDF35\\uDF37-\\uDF7C\\uDF7E-\\uDF93\\uDFA0-\\uDFCA\\uDFCF-\\uDFD3\\uDFE0-\\uDFF0\\uDFF4\\uDFF8-\\uDFFF]|\\uD83D[\\uDC00-\\uDC3E\\uDC40\\uDC42-\\uDCFC\\uDCFF-\\uDD3D\\uDD4B-\\uDD4E\\uDD50-\\uDD67\\uDD7A\\uDD95\\uDD96\\uDDA4\\uDDFB-\\uDE4F\\uDE80-\\uDEC5\\uDECC\\uDED0-\\uDED2\\uDED5\\uDEEB\\uDEEC\\uDEF4-\\uDEFA\\uDFE0-\\uDFEB]|\\uD83E[\\uDD0D-\\uDD3A\\uDD3C-\\uDD45\\uDD47-\\uDD71\\uDD73-\\uDD76\\uDD7A-\\uDDA2\\uDDA5-\\uDDAA\\uDDAE-\\uDDCA\\uDDCD-\\uDDFF\\uDE70-\\uDE73\\uDE78-\\uDE7A\\uDE80-\\uDE82\\uDE90-\\uDE95])|(?:[#\\*0-9\\xA9\\xAE\\u203C\\u2049\\u2122\\u2139\\u2194-\\u2199\\u21A9\\u21AA\\u231A\\u231B\\u2328\\u23CF\\u23E9-\\u23F3\\u23F8-\\u23FA\\u24C2\\u25AA\\u25AB\\u25B6\\u25C0\\u25FB-\\u25FE\\u2600-\\u2604\\u260E\\u2611\\u2614\\u2615\\u2618\\u261D\\u2620\\u2622\\u2623\\u2626\\u262A\\u262E\\u262F\\u2638-\\u263A\\u2640\\u2642\\u2648-\\u2653\\u265F\\u2660\\u2663\\u2665\\u2666\\u2668\\u267B\\u267E\\u267F\\u2692-\\u2697\\u2699\\u269B\\u269C\\u26A0\\u26A1\\u26AA\\u26AB\\u26B0\\u26B1\\u26BD\\u26BE\\u26C4\\u26C5\\u26C8\\u26CE\\u26CF\\u26D1\\u26D3\\u26D4\\u26E9\\u26EA\\u26F0-\\u26F5\\u26F7-\\u26FA\\u26FD\\u2702\\u2705\\u2708-\\u270D\\u270F\\u2712\\u2714\\u2716\\u271D\\u2721\\u2728\\u2733\\u2734\\u2744\\u2747\\u274C\\u274E\\u2753-\\u2755\\u2757\\u2763\\u2764\\u2795-\\u2797\\u27A1\\u27B0\\u27BF\\u2934\\u2935\\u2B05-\\u2B07\\u2B1B\\u2B1C\\u2B50\\u2B55\\u3030\\u303D\\u3297\\u3299]|\\uD83C[\\uDC04\\uDCCF\\uDD70\\uDD71\\uDD7E\\uDD7F\\uDD8E\\uDD91-\\uDD9A\\uDDE6-\\uDDFF\\uDE01\\uDE02\\uDE1A\\uDE2F\\uDE32-\\uDE3A\\uDE50\\uDE51\\uDF00-\\uDF21\\uDF24-\\uDF93\\uDF96\\uDF97\\uDF99-\\uDF9B\\uDF9E-\\uDFF0\\uDFF3-\\uDFF5\\uDFF7-\\uDFFF]|\\uD83D[\\uDC00-\\uDCFD\\uDCFF-\\uDD3D\\uDD49-\\uDD4E\\uDD50-\\uDD67\\uDD6F\\uDD70\\uDD73-\\uDD7A\\uDD87\\uDD8A-\\uDD8D\\uDD90\\uDD95\\uDD96\\uDDA4\\uDDA5\\uDDA8\\uDDB1\\uDDB2\\uDDBC\\uDDC2-\\uDDC4\\uDDD1-\\uDDD3\\uDDDC-\\uDDDE\\uDDE1\\uDDE3\\uDDE8\\uDDEF\\uDDF3\\uDDFA-\\uDE4F\\uDE80-\\uDEC5\\uDECB-\\uDED2\\uDED5\\uDEE0-\\uDEE5\\uDEE9\\uDEEB\\uDEEC\\uDEF0\\uDEF3-\\uDEFA\\uDFE0-\\uDFEB]|\\uD83E[\\uDD0D-\\uDD3A\\uDD3C-\\uDD45\\uDD47-\\uDD71\\uDD73-\\uDD76\\uDD7A-\\uDDA2\\uDDA5-\\uDDAA\\uDDAE-\\uDDCA\\uDDCD-\\uDDFF\\uDE70-\\uDE73\\uDE78-\\uDE7A\\uDE80-\\uDE82\\uDE90-\\uDE95])\\uFE0F|(?:[\\u261D\\u26F9\\u270A-\\u270D]|\\uD83C[\\uDF85\\uDFC2-\\uDFC4\\uDFC7\\uDFCA-\\uDFCC]|\\uD83D[\\uDC42\\uDC43\\uDC46-\\uDC50\\uDC66-\\uDC78\\uDC7C\\uDC81-\\uDC83\\uDC85-\\uDC87\\uDC8F\\uDC91\\uDCAA\\uDD74\\uDD75\\uDD7A\\uDD90\\uDD95\\uDD96\\uDE45-\\uDE47\\uDE4B-\\uDE4F\\uDEA3\\uDEB4-\\uDEB6\\uDEC0\\uDECC]|\\uD83E[\\uDD0F\\uDD18-\\uDD1F\\uDD26\\uDD30-\\uDD39\\uDD3C-\\uDD3E\\uDDB5\\uDDB6\\uDDB8\\uDDB9\\uDDBB\\uDDCD-\\uDDCF\\uDDD1-\\uDDDD])';
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
var youtubeRegExp = /^(?:https?:\/\/)?(?:www\.)?youtu(?:|\.be|be\.com|\.b)(?:\/v\/|\/watch\\?v=|e\/|(?:\/\??#)?\/watch(?:.+)v=)(.{11})(?:\&[^\s]*)?/
var vimeoRegExp = /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/
var instagramRegExp = /^https?:\/\/(?:instagr\.am\/p\/|instagram\.com\/p\/)([a-zA-Z0-9\-\_]+)/i
var vineRegExp = /^https?:\/\/vine\.co\/v\/([a-zA-Z0-9\-\_]+)/i
var twitterRegExp = /^https?:\/\/twitter\.com\/.+?\/status\/\d+/i
var facebookRegExp = /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?:.+?\/posts\/\d+|(?:story\.php|permalink\.php)\?story_fbid=(\d+)(?:&substory_index=\d+)?&id=(\d+))/i
var gplusRegExp = /^https?:\/\/plus\.google\.com\/\d+\/posts\/[a-zA-Z0-9\-\_]+/i
var soundcloudRegExp = /^https?:\/\/(?:soundcloud\.com|snd\.sc)\/([a-zA-Z0-9%\-\_]+)\/([a-zA-Z0-9%\-\_]+)/i
var spotifyRegExp = /(https?:\/\/(open\.spotify\.com|play\.spotify\.com|spoti\.fi)\/(.+)|spotify:(.+))/i
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
  //////////////emojiCode = emojiUnicode(emojiCode);

  let emojiInfo = emojiData.emoji[emojiCode];
  if(!emojiInfo) {
    //console.error('no emoji by code:', emojiCode, emojiCode.length, new TextEncoder().encode(emojiCode));
    return null;
  }

  let sheetX = 0;
  let sheetNo = '';
  if(emojiData.splitted) {
    sheetX = emojiInfo[emojiData.keyX] % 6;
    sheetNo = (emojiInfo[emojiData.keyX] / 6 | 0) + 1;
  } else {
    sheetX = emojiInfo[emojiData.keyX];
  }

  /* let xPos = 100 * (((emojiInfo.sheet_x * (img_size + 2)) + 1) / (sheetSizeX - img_size));
  let yPos = 100 * (((emojiInfo.sheet_y * (img_size + 2)) + 1) / (sheetSizeY - img_size)); */
  let xPos = sheetX * emojiData.multiplyX;
  let yPos = 100 / emojiData.side * emojiInfo[emojiData.keyY];

  if(emojiData.splitted) {
    /* if(sheetX != 2 && sheetX != 3) {
      xPos += ((sheetX + 1) > (6 / 2) ? -1 : 1) * 100 / 204;
    } */

    if(sheetNo == 9) {
      xPos = sheetX * 100 / 5;
    } else {
      xPos = sheetX * 100 / 6;
    }
  }

  //console.log({row: yPos, column: xPos, sheetNo});

  return {row: yPos, column: xPos, sheetNo};
}
function parseEntities (text, options) {
  options = options || {}
  var match
  var raw = text,
    url
  var entities = [],
    emojiCode = '',
    emojiCoords,
    matchIndex
  var rawOffset = 0
  // var start = tsNow()
  while ((match = raw.match(fullRegExp))) {
    matchIndex = rawOffset + match.index;

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
    } else if(match[8]/*  && !emojiSupported */) { // Emoji
      if(emojiCode) matchIndex -= match[8].length;
      emojiCode += match[8];
      //console.log('hit', match[8], emojiCode.length);
      if((emojiCoords = getEmojiSpritesheetCoords(emojiCode))) {
        entities.push({
          _: 'messageEntityEmoji',
          offset: matchIndex,
          length: emojiCode.length,
          coords: emojiCoords/* ,
          title: emojiData[emojiCode][1][0] */
        });

        emojiCode = '';
      }
    } else if(match[10]) { // Hashtag
      entities.push({
        _: 'messageEntityHashtag',
        offset: matchIndex + match[9].length,
        length: match[10].length
      });
    } else if(match[12]) { // Bot command
      entities.push({
        _: 'messageEntityBotCommand',
        offset: matchIndex + match[11].length,
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
  var curEmojiSize = options.emojiIconSize || emojiIconSize;
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
        
        /* var inner = `<span class="emoji-inner" style="background: url(${emojiData.sheetUrl}${entity.coords.sheetNo}.png);
        background-position:${entity.coords.column}% ${entity.coords.row}%;
        background-size:${emojiData.sizeX}% ${emojiData.sizeY}%">${encodeEntities(entityText)}</span>`; */
        /* var inner = `<span class="emoji-inner" style="background: url(${emojiData.sheetUrl}${entity.coords.sheetNo}.png);
        background-position:${entity.coords.column}% ${entity.coords.row}%;
        background-size:${emojiData.sizeX}% ${emojiData.sizeY}%">\u200B</span>`; */

        /* if(emojiSupported) {
          html.push(encodeEntities(entityText));
        } else {
           *///html.push(`<span class="emoji-outer emoji-sizer" contenteditable="false">${emojiSupported ? encodeEntities(entityText) : inner}\u200B</span>`);
        //}

        inner = `<img src="assets/img/blank.gif" alt="${encodeEntities(entityText)}" class="emoji" style="background: url(${emojiData.sheetUrl}${entity.coords.sheetNo}.png);
        background-position:${entity.coords.column}% ${entity.coords.row}%;
        background-size:${emojiData.sizeX}% ${emojiData.sizeY}%">`;

        //html.push(`<span class="emoji-outer emoji-sizer" contenteditable="false">${emojiSupported ? encodeEntities(entityText) : inner}\u200B</span>`);

        html.push(emojiSupported ? `<span class="emoji" contenteditable="false">${encodeEntities(entityText)}</span>` : inner);

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

