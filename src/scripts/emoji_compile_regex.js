// @ts-check
const fs = require('fs');

const data = fs.readFileSync(__dirname + '/in/emoji_test.txt').toString();

/** @type {number[][]} */
const codepoints = [];

/** @type {Map<number, number[][]>} */
const codepointsByLength = new Map();

data.split('\n').forEach(line => {
  if(!line || /^#/.test(line)) {
    return;
  }

  const splitted = line.split(';');
  if(splitted.length < 2 || !splitted[1].includes('fully-qualified')) {
    return;
  }

  const a = String.fromCodePoint(...splitted[0].trim().split(' ').map((hex) => parseInt(hex, 16))).split('').map(str => str.charCodeAt(0));
  codepoints.push(a);

  let byLength = codepointsByLength.get(a.length);
  if(!byLength) {
    byLength = [];
    codepointsByLength.set(a.length, byLength);
  }

  byLength.push(a);
});

/** @type {(codepoints: number[][]) => void} */
const sort = (codepoints) => {
  codepoints.sort((a, b) => {
    const length = Math.min(a.length, b.length);
    for(let i = 0; i < length; ++i) {
      const diff = a[i] - b[i];
      if(diff) {
        return diff;
      }
    }
  
    return a.length - b.length;
  });
};

sort(codepoints);

/** @type {(arr1: number[], arr2: number[]) => boolean} */
const isEqualArray = (arr1, arr2) => {
  if(arr1.length !== arr2.length) {
    return false;
  }

  for(let i = 0; i < arr1.length; ++i) {
    if(arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
};

/** @type {(num: number) => string} */
const ttt = (num) => {
  return '\\u' + num.toString(16);
};

/** @type {(arr: number[][], j: number) => string} */
const makeGroup = (arr, j) => {
  let str = '';
  if(arr.length > 1) str += '[';
  str += arr.map(e => e.slice(0, j).map(ttt)).join('');
  if(arr.length > 1) str += ']';
  return str;
};

let str = '(?:';
let groups = [];
/* codepointsByLength.forEach((value) => {
  sort(value);

  value.forEach(s => {
    str += s.reduce((acc, v) => acc + '\\u' + v.toString(16), '');
  });
}); */
// for(let j = 1; j < 5; ++j) {
//   for(let i = 0; i < codepoints.length; ++i) {
//     const a = codepoints[i];
//     /** @type {number[][]} */
//     const set = [];

//     //for(let j = 1; j < a.length; ++j) {
//       const ending = a.slice(j);

//       for(let k = i + 1; k < codepoints.length; ++k) {
//         const b = codepoints[k];
//         const e = b.slice(j);
    
//         if(isEqualArray(ending, e)) {
//           codepoints.splice(k, 1);
//           set.push(b);
//         }
//       }
//     //}

//     if(set.length) {
//       set.unshift(a);
//       codepoints.splice(i, 1);
//       console.log(set.length);
//     } else if(j !== (5 - 1)) {
//       continue;
//     } else {
//       set.push(a);
//     }
    
//     let group = makeGroup(set, j);
//     group += ending.map(ttt).join('');
//     groups.push(group);
//     str += group;
//   }
// }
/* codepointsByLength.forEach((codepoints) => {
  for(let i = 0; i < codepoints.length; ++i) {
    const a = codepoints[i];
  }
}); */
for(let i = 0; i < codepoints.length; ++i) {
  const a = codepoints[i];

  for(let j = i + 1; j < codepoints.length; ++j) {
    
  }
}
str += ')';

//console.log(codepointsByLength.get(1));

console.log(str);

/* let i = 0;
let s = [codepoints[i++][0]];
for(; i < codepoints.length; ++i) {
  const c = codepoints[i];
  if((c[0] - s[s.length - 1]) > 1) {
    if(s.length > 1) {
      console.log('start from', s);
    }
    s = [c[0]];
  } else {
    s.push(c[0]);
  }
} */
//console.log(codepoints);
