/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const fs = require('fs');
const path = require('path');

const f = (key, value, plural) => {
  value = value
  .replace(/\n/g, '\\n')
  .replace(/"/g, '\\"');
  return `"${key}${plural ? '_' + plural.replace('_value', '') : ''}" = "${value}";\n`;
};

let out = '';

['lang', 'langSign'].forEach(part => {
  const filePath = path.join(__dirname, `../${part}.ts`);

  let str = fs.readFileSync(filePath).toString()
  .replace(/\s+\/\/.+/g, '')
  // .replace(/\\'/g, '')
  .replace(/"/g, `\\"`)
  // .replace(/'/g, '"')
  .replace(/([^\\])'/g, '$1"')
  .replace(/\\'/g, '\'')
  // .replace(/"(.+?)(?:")(.*?)"/g, '"$1\"$2"');
  {
    const pattern = '= {';
    str = str.slice(str.indexOf(pattern) + pattern.length - 1);
  }

  {
    const pattern = '};';
    str = str.slice(0, str.indexOf(pattern) + pattern.length - 1);
  }

  // console.log(`'${str}'`);
  // var idx = 21865;
  // idx -= 1;
  // console.log(str.slice(idx, idx + 100));
  const json = JSON.parse(str);
  // console.log(json);

  for(const key in json) {
    const value = json[key];
    if(typeof(value) === 'string') {
      out += f(key, value);
    } else {
      for(const plural in value) {
        out += f(key, value[plural], plural);
      }
    }
  }
});

fs.writeFileSync(path.join(__dirname, './out/langPack.strings'), out);
