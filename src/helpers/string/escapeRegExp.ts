// credits to https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
export default function escapeRegExp(str: string) {
  return str
  .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  .replace(/-/g, '\\x2d');
}
