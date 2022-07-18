const delta = '０'.charCodeAt(0) - '0'.charCodeAt(0);
const buggedRegExp = /[０-９]/g;

// function hasBuggedNumbers(str: string) {
//   return !!str.match(a);
// }

function getDistanceFromBuggedToNormal(char: string) {
  return String.fromCharCode(char.charCodeAt(0) - delta);
}

export function fixBuggedNumbers(str: string) {
  return str.replace(buggedRegExp, getDistanceFromBuggedToNormal);
}
