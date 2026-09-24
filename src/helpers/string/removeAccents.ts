/*
 * Ported from Telegram Desktop - lib_ui `TextUtilities::RemoveAccents` (ui/text/text_entity.cpp)
 * https://github.com/desktop-app/lib_ui
 * The accent table there is taken from https://github.com/aristus/accent-folding
 */

/**
 * The letters an accented one is folded down to, each followed by everything that folds to it. It is
 * tdesktop's table as it stands, quirks included (`Ĺ` folds to `a` there), since what is sorted with
 * it has to come out in the order tdesktop puts it in. Its combining marks are left out - those are
 * dropped before the table is ever looked at.
 */
const FOLDED_TO: {[to: string]: string} = {
  '0': '０',
  '1': '１',
  '2': '２',
  '3': '３',
  '4': '４',
  '5': '５',
  '6': '６',
  '7': '７',
  '8': '８',
  '9': '９',
  A: 'Ａ',
  B: 'Ｂ',
  C: 'Ｃ',
  D: 'Ｄ',
  E: 'Ｅ',
  F: 'Ｆ',
  G: 'Ｇ',
  H: 'Ｈ',
  I: 'Ｉ',
  J: 'Ｊ',
  K: 'Ｋ',
  L: 'Ｌ',
  M: 'Ｍ',
  N: 'Ｎ',
  O: 'Ｏ',
  P: 'Ｐ',
  Q: 'Ｑ',
  R: 'Ｒ',
  S: 'Ｓ',
  T: 'Ｔ',
  U: 'Ｕ',
  V: 'Ｖ',
  W: 'Ｗ',
  X: 'Ｘ',
  Y: 'Ｙ',
  Z: 'Ｚ',
  a: 'ÀÁÂÃÄÅàáâãäåĀāĂăĄąĹǍǎǞǟǠǡǢǣǺǻǼǽȀȁȂȃȦȧȺḀḁẚẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặⱥａ',
  b: 'ƀƁƂƃɃɓᵬḂḃḄḅḆḇｂ',
  c: 'ÇçĆćĈĉĊċČčƇƈȻȼɕḈḉｃ',
  d: 'ðĎďĐđƉƊƋƌȡɖɗᵭḊḋḌḍḎḏḐḑḒḓｄ',
  e: 'ÈÉÊËèéêëĒēĔĕĖėĘęĚěƎƏǝȄȅȆȇȨȩɆɇɚɝḔḕḖḗḘḙḚḛḜḝẸẹẺẻẼẽẾếỀềỂểỄễỆệｅ',
  f: 'ƑƒᵮḞḟｆ',
  g: 'ĜĝĞğĠġĢģƓǤǥǦǧǴǵɠḠḡｇ',
  h: 'ĤĥĦħȞȟḢḣḤḥḦḧḨḩḪḫẖⱧⱨｈ',
  i: 'ÌÍÎÏìíîïĨĩĪīĬĭĮįİıƗǏǐȈȉȊȋɨḬḭḮḯỈỉỊịｉ',
  j: 'ĴĵǰȷɈɉɟʄʝｊ',
  k: 'ĶķƘƙǨǩḰḱḲḳḴḵⱩⱪｋ',
  l: 'ĺĻļĽľĿŀŁłƚȴȽɫɬɭḶḷḸḹḺḻḼḽⱠⱡⱢｌ',
  m: 'ɱḾḿṀṁṂṃｍ',
  n: 'ÑñŃńŅņŇňƝƞǸǹȠȵɲɳṄṅṆṇṈṉṊṋｎ',
  o: 'ÒÓÔÕÖØòóôõöøŌōŎŏŐőƟƠơǑǒǪǫǬǭǾǿȌȍȎȏȪȫȬȭȮȯȰȱɵṌṍṎṏṐṑṒṓỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợｏ',
  p: 'ƤƥṔṕṖṗⱣｐ',
  q: 'Ɋɋʠｑ',
  r: 'ŔŕŖŗŘřȐȑȒȓɌɍɼɽɾᵲᵳṘṙṚṛṜṝṞṟⱤｒ',
  s: 'ßŚśŜŝŞşŠšȘșʂṠṡṢṣṤṥṦṧṨṩẛｓ',
  t: 'ÞþŢţŤťŦŧƫƬƭƮȚțȶȾʈᵵṪṫṬṭṮṯṰṱẗⱦｔ',
  u: 'ÙÚÛÜùúûüŨũŪūŬŭŮůŰűŲųƯưǓǔǕǖǗǘǙǚǛǜȔȕȖȗɄʉṲṳṴṵṶṷṸṹṺṻỤụỦủỨứỪừỬửỮữỰựｕ',
  v: 'ƲʋṼṽṾṿｖ',
  w: 'ŴŵẀẁẂẃẄẅẆẇẈẉẘｗ',
  x: 'ẊẋẌẍｘ',
  y: 'ÝýÿŶŷŸƳƴȲȳɎɏʏẎẏẙỲỳỴỵỶỷỸỹｙ',
  z: 'ŹźŻżŽžƵƶƺǮǯȤȥʐʑẐẑẒẓẔẕⱫⱬｚ',
  'е': 'ё'
};

const ACCENTS: Map<string, string> = new Map();
for(const to in FOLDED_TO) {
  for(const from of FOLDED_TO[to]) {
    ACCENTS.set(from, to);
  }
}

/** A diacritic or a variation selector - what tdesktop's `IsDiacritic` drops */
const DIACRITIC_REGEXP = /\p{Mn}/u;
function isDiacritic(ch: string, code: number) {
  return DIACRITIC_REGEXP.test(ch) || code === 0x0674 || (code >= 0xFC5E && code <= 0xFC63);
}

/**
 * Drops the diacritics from a text and folds the accented letters down to the plain ones, as
 * tdesktop does it: one UTF-16 unit at a time, so a surrogate pair goes through as it is (nothing
 * outside the BMP is folded there either).
 */
export default function removeAccents(text: string) {
  let result = '';
  for(let i = 0, length = text.length; i < length; ++i) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if(code < 128) {
      result += ch;
    } else if(!isDiacritic(ch, code)) {
      result += ACCENTS.get(ch) ?? ch;
    }
  }

  return result;
}
