/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// @ts-check

const fs = require('fs');
const fileNames = fs.readdirSync('./');

const logsPath = './public/changelogs/';
fs.rmSync(logsPath, {force: true, recursive: true});
fs.mkdirSync(logsPath);

const processChangelog = (fileName) => {
  const text = fs.readFileSync('./' + fileName).toString('utf-8');

  const lang = (fileName.split('_')[1] || 'en').split('.')[0];
  const writeTo = `${logsPath}${lang}_{VERSION}.md`;

  const separator = '### ';
  const splitted = text.split(separator);
  splitted.forEach(text => {
    if(!text.trim()) return;
    text = separator + text;
    text = text.replace(/^\*(\s)/gm, '•$1');
    const splitted = text.split('\n');

    for(let i = splitted.length - 1; i >= 0; --i) {
      const line = splitted[i];
      if(!line.trim()) {
        splitted.splice(i, 1);
      } else {
        break;
      }
    }

    const firstLine = splitted.shift();
    const version = firstLine.split(' ')[1];
    fs.writeFileSync(writeTo.replace('{VERSION}', version), splitted.join('\n') + '\n');
  });
};

fileNames.forEach(fileName => {
  if(fileName.endsWith('.md') && fileName.startsWith('CHANGELOG')) {
    processChangelog(fileName);
  }
});
