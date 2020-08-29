let emoji = require('./emoji_pretty.json');
//let countries = require('./countries_pretty.json');

let countries = require('fs').readFileSync('./countries.dat').toString();
//console.log(countries);

//console.log(emoji, countries);

let formatted = emoji.filter(e => e.has_img_apple);

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
  
  require('fs').writeFileSync('./emoji.json', JSON.stringify(obj));
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
  formatted.forEach(e => {
    let {unified, name, short_names, category, sheet_x, sheet_y, sort_order} = e;

    let emoji = unified/* .replace(/-FE0F/gi, '') */.split('-')
    .reduce((prev, curr) => prev + String.fromCodePoint(parseInt(curr, 16)), '');

    //emoji = emoji.replace(/\ufe0f/g, '');
    
    let c = categories[category] === undefined ? 9 : categories[category];
    //obj[emoji] = '' + c + sort_order;
    //obj[emoji] = +('' + (c * 1000 + sort_order)).replace(/0+/g, '0').replace(/^(\d)0(\d)/g, '$1$2');
    obj[emoji] = e.sort_order !== undefined ? +('' + c + sort_order) : 0;
  });

  console.log(obj);
  
  require('fs').writeFileSync('./emoji.json', JSON.stringify(obj));
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

{
  let arr = [];
  /* countries.forEach(e => {
    let {name, code, phoneCode} = e;
    
    arr.push([name, code, phoneCode]);
  }); */
  
  const lines = countries.split('\n');
  const data2 = [];
  lines.forEach(x => {
    if(!x.trim()) return;
    const split = x.split(';');
    const item = {
      phoneCode: split[0],
      code: split[1],
      name: split[2],
      pattern: split[3],
      //count: Number(split[4]),
      emoji: split[5]
    };

    arr.push(item);
    //console.log(item);
  });
  
  require('fs').writeFileSync('./countries.json', JSON.stringify(arr));
}
