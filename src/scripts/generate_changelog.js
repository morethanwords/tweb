/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// @ts-check

const fs = require('fs');
const text = fs.readFileSync('./CHANGELOG.md').toString('utf-8');

const writeTo = `./public/changelogs/{VERSION}.md`;

const splitted = text.split('\n\n');
splitted.forEach(text => {
  text = text.replace(/^\*/gm, '•');
  const splitted = text.split('\n').filter(line => !!line.trim());
  const firstLine = splitted.shift();
  fs.writeFileSync(writeTo.replace('{VERSION}', firstLine.substr(4)), splitted.join('\n') + '\n');
});
