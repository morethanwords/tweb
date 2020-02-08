let emoji = require('./emoji_pretty.json');
//let countries = require('./countries_pretty.json');

let countries = require('fs').readFileSync('./countries.dat').toString();
console.log(countries);

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

{
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
    console.log(item);
  });
  
  require('fs').writeFileSync('./countries.json', JSON.stringify(arr));
}
