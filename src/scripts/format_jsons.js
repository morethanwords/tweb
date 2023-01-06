// @ts-check
/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

let emoji = require('./in/emoji_pretty.json');
//let countries = require('./countries_pretty.json');

// let countries = require('fs').readFileSync('./in/countries.dat').toString();
let countries = require('./in/countries.mtproto.json');
//console.log(countries);

//console.log(emoji, countries);

const path = process.argv[2];
const writePathTo = (/* path ||  */__dirname + '/out/');
console.log('Writing to:', writePathTo);

let formatted = emoji.filter(e => e.has_img_apple);

function encodeEmoji(emojiText) {
  const codepoints = toCodePoints(removeVS16s(emojiText)).join('-');
  return codepoints;
}

const vs16RegExp = /\uFE0F/g;
// avoid using a string literal like '\u200D' here because minifiers expand it inline
const zeroWidthJoiner = String.fromCharCode(0x200d);

const removeVS16s = (rawEmoji) => (rawEmoji.indexOf(zeroWidthJoiner) < 0 ? rawEmoji.replace(vs16RegExp, '') : rawEmoji);

function toCodePoints(unicodeSurrogates) {
  const points = [];
  let char = 0;
  let previous = 0;
  let i = 0;
  while(i < unicodeSurrogates.length) {
    char = unicodeSurrogates.charCodeAt(i++);
    if(previous) {
      points.push((0x10000 + ((previous - 0xd800) << 10) + (char - 0xdc00)).toString(16));
      previous = 0;
    } else if (char > 0xd800 && char <= 0xdbff) {
      previous = char;
    } else {
      points.push(char.toString(16));
    }
  }

  if(points.length && points[0].length == 2) {
    points[0] = '00' + points[0];
  }

  return points;
}

/* formatted = formatted.map(e => {
  let {unified, name, short_names, category, sheet_x, sheet_y} = e;
  
  return {
    unified,
    //name,
    //short_names,
    category,
    sheet_x,
    sheet_y
  };
});

require('fs').writeFileSync('./emoji.json', JSON.stringify(formatted)); */

if(false) {
  let obj = {};
  formatted.forEach(e => {
    let {unified, name, short_names, category, sheet_x, sheet_y, sort_order} = e;
    
    let emoji = unified.split('-')
    .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');
    
    obj[/* unified */emoji] = {
      //unified,
      //name,
      //short_names,
      category,
      sheet_x,
      sheet_y,
      sort_order
    };
  });
  
  require('fs').writeFileSync('./out/emoji.json', JSON.stringify(obj));
}

{
  let categories = {
    "Smileys & Emotion": 1
    , "People & Body": 1
    , "Animals & Nature": 2
    , "Food & Drink": 3
    , "Travel & Places": 4
    , "Activities": 5
    , "Objects": 6
    , "Symbols": 6
    , "Flags": 7
    , "Skin Tones": 8
  };

  let concatCategories = [['Objects', 'Symbols'], ['Smileys & Emotion', 'People & Body']];
  let maxIndexes = {};

  let maxObjectsIndex = -1;
  formatted.forEach(e => {
    if(concatCategories.findIndex(c => c[0] == e.category) === -1) return;

    if(!maxIndexes.hasOwnProperty(e.category)) maxIndexes[e.category] = 0;
    if(e.sort_order > maxIndexes[e.category]) {
      maxIndexes[e.category] = e.sort_order;
    }
  });
  formatted.forEach(e => {
    let concatDetails = concatCategories.find(c => c[1] == e.category);
    if(!concatDetails) return;

    e.sort_order += maxIndexes[concatDetails[0]];
  });

  formatted.forEach(e => {
    if(e.skin_variations) {
      for(let i in e.skin_variations) {
        formatted.push(e.skin_variations[i]);
      }
    }
  });

  let obj = {};
  if(false/*  || true */) formatted.forEach(e => {
    let {unified, name, short_names, category, sheet_x, sheet_y, sort_order} = e;

    let emoji = unified/* .replace(/-FE0F/gi, '') */.split('-')
    .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

    //emoji = emoji.replace(/[\ufe0f\u200d]/g, '');
    
    let c = categories[category] === undefined ? 9 : categories[category];
    //obj[emoji] = '' + c + sort_order;
    //obj[emoji] = +('' + (c * 1000 + sort_order)).replace(/0+/g, '0').replace(/^(\d)0(\d)/g, '$1$2');
    obj[emoji] = e.sort_order !== undefined ? +('' + c + sort_order) : 0;
  });

  const migrateFromVersion = 13.1;
  if(true) formatted.forEach(e => {
    let {unified, name, short_names, category, sheet_x, sheet_y, sort_order, added_in} = e;

    let emoji = unified.split('-')
    .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

    emoji = encodeEmoji(emoji);
    emoji = emoji.replace(/-?fe0f/g, '');
    //emoji = emoji.replace(/-?fe0f$/, '');

    let _obj = obj;
    if(migrateFromVersion) {
      const version = +added_in;
      const key = migrateFromVersion >= version ? '' : version;
      _obj = obj[key] ?? (obj[key] = {});
    }
    
    let c = categories[category] === undefined ? 9 : categories[category];
    //obj[emoji] = '' + c + sort_order;
    //obj[emoji] = +('' + (c * 1000 + sort_order)).replace(/0+/g, '0').replace(/^(\d)0(\d)/g, '$1$2');
    _obj[emoji] = e.sort_order !== undefined ? +('' + c + sort_order) : 0;
  });

  console.log(obj);
  
  require('fs').writeFileSync(writePathTo + 'emoji.json', JSON.stringify(obj));
}

/* {
  let obj = {};
  formatted.forEach(e => {
    let {unified, name, short_names, category, sheet_x, sheet_y} = e;
    
    
    let categories = ["Smileys & People", "Animals & Nature", "Food & Drink", 
    "Travel & Places", "Activities", "Objects", "Symbols", "Flags", "Skin Tones"];
    let categoryId = categories.findIndex(c => c == category);
    if(categoryId === -1) throw new Error(category);
    
    obj[unified] = [
      sheet_x,
      sheet_y,
      categoryId
    ];
  });
  
  require('fs').writeFileSync('./emoji.json', JSON.stringify(obj));
} */

// old countries format
// {
//   let arr = [];
//   /* countries.forEach(e => {
//     let {name, code, phoneCode} = e;
    
//     arr.push([name, code, phoneCode]);
//   }); */
  
//   const lines = countries.split('\n');
//   const data2 = [];
//   lines.forEach(x => {
//     if(!x.trim()) return;
//     const split = x.split(';');
//     const item = {
//       phoneCode: split[0],
//       code: split[1],
//       name: split[2],
//       pattern: split[3],
//       //count: Number(split[4]),
//       emoji: split[5]
//     };

//     arr.push(item);
//     //console.log(item);
//   });
  
//   require('fs').writeFileSync(writePathTo + 'countries.json', JSON.stringify(arr));
// }

{
  const c = countries.filter(country => !country.pFlags.hidden);
  c.forEach(country => {
    delete country._;
    delete country.pFlags;
    delete country.flags;

    country.country_codes.forEach(countryCode => {
      delete countryCode._;
      delete countryCode.pFlags;
      delete countryCode.flags;
    });
  });

  require('fs').writeFileSync(writePathTo + 'countries.json', JSON.stringify(c));
}
