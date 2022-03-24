export default function encodeEntities(value: string) {
  return value.replace(/&/g, '&amp;').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (value) => {
    const hi = value.charCodeAt(0);
    const low = value.charCodeAt(1);
    return '&#' + (((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000) + ';';
  }).replace(/([^\#-~| |!])/g, (value) => { // non-alphanumeric
    return '&#' + value.charCodeAt(0) + ';';
  }).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
