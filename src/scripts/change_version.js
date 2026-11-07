// @ts-check

const fs = require('fs');
const {getChangelogFiles, releaseChangelog} = require('./changelogs');

const version = process.argv[2] || 'same';
const langVersion = process.argv[3] || 'same';
const PREFIX = 'VITE_';
const BUILD_KEY = PREFIX + 'BUILD';
const VERSION_KEY = PREFIX + 'VERSION';
const VERSION_FULL_KEY = PREFIX + 'VERSION_FULL';
const LANG_PACK_VERSION_KEY = PREFIX + 'LANG_PACK_VERSION';

console.log('Change version to:', {version, langVersion});

const envStr = fs.readFileSync('./.env').toString();
const env = {};
envStr.split('\n').forEach(line => {
  if(!line) return;
  const [key, value] = line.split('=', 2);
  env[key] = value;
});

const isNewVersion = version !== 'same' && version !== env[VERSION_KEY];
if(version !== 'same') {
  env[VERSION_KEY] = version;
}

env[BUILD_KEY] = +env[BUILD_KEY] + 1;
env[VERSION_FULL_KEY] = `${env[VERSION_KEY]} (${env[BUILD_KEY]})`;

if(langVersion !== 'same') {
  env[LANG_PACK_VERSION_KEY] = langVersion;
}

// * a new version is what people are told about, so there is none without its changelog;
// * checked before anything is written, so a refused one leaves the build number as it was
const changelogs = [];
for(const {fileName, filePath} of isNewVersion ? getChangelogFiles() : []) {
  try {
    changelogs.push({filePath, text: releaseChangelog(fs.readFileSync(filePath, 'utf-8'), env[VERSION_FULL_KEY])});
  } catch(err) {
    console.error(`Version ${version} is not released, ${fileName}: ${err.message}. What is new goes there first: .claude/skills/changelog/SKILL.md`);
    process.exit(1);
  }
}

const lines = [];
for(const key in env) {
  lines.push(`${key}=${env[key]}`);
}
fs.writeFileSync('./.env', lines.join('\n') + '\n', 'utf-8');
fs.writeFileSync('./public/version', env[VERSION_FULL_KEY], 'utf-8');

changelogs.forEach(({filePath, text}) => fs.writeFileSync(filePath, text, 'utf-8'));
