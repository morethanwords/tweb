// @ts-check

const fs = require('fs');
const {UNRELEASED, getChangelogFiles, parseChangelog, getAppMessage} = require('./changelogs');

const logsPath = './public/changelogs/';
fs.rmSync(logsPath, {force: true, recursive: true});
fs.mkdirSync(logsPath);

getChangelogFiles().forEach(({filePath, lang}) => {
  parseChangelog(fs.readFileSync(filePath, 'utf-8')).forEach(({version, body}) => {
    // * what is coming is nobody's to read yet
    if(version === UNRELEASED) {
      return;
    }

    fs.writeFileSync(`${logsPath}${lang}_${version}.md`, getAppMessage(body) + '\n');
  });
});
