/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// @ts-check

const fs = require('fs');

const version = process.argv[2];
const changelog = process.argv[3];
const PREFIX = 'VITE_';
const BUILD_KEY = PREFIX + 'BUILD';
const VERSION_KEY = PREFIX + 'VERSION';
const VERSION_FULL_KEY = PREFIX + 'VERSION_FULL';

const envStr = fs.readFileSync('./.env').toString();
const env = {};
envStr.split('\n').forEach(line => {
  if(!line) return;
  const [key, value] = line.split('=', 2);
  env[key] = value;
});

if(version !== 'same') {
  env[VERSION_KEY] = version;
}

env[BUILD_KEY] = +env[BUILD_KEY] + 1;
env[VERSION_FULL_KEY] = `${env[VERSION_KEY]} (${env[BUILD_KEY]})`;

const lines = [];
for(const key in env) {
  lines.push(`${key}=${env[key]}`);
}
fs.writeFileSync('./.env', lines.join('\n') + '\n', 'utf-8');
fs.writeFileSync('./public/version', env[VERSION_FULL_KEY], 'utf-8');

if(changelog) {
  const data = fs.readFileSync('./CHANGELOG.md');
  const fd = fs.openSync('./CHANGELOG.md', 'w+');
  const lines = [
    `### ${env[VERSION_FULL_KEY]}`
  ];
  changelog.trim().split('\n').forEach(line => {
    lines.push(`* ${line}`);
  });
  const insert = Buffer.from(lines.join('\n') + '\n\n');
  fs.writeSync(fd, insert, 0, insert.length, 0);
  fs.writeSync(fd, data, 0, data.length, insert.length);
  fs.close(fd, () => {
    process.exit(0);
  });
}
