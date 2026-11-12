const fs = require('node:fs');
const configuredId = process.env.API_ID || '';
const configuredHash = process.env.API_HASH || '';
if(Boolean(configuredId) !== Boolean(configuredHash)) {
  throw new Error('Set both API_ID and API_HASH, or leave both empty to use upstream defaults');
}
// Public upstream Webogram credentials; one fallback shared by CI and Docker builds.
const id = configuredId || '2496';
const hash = configuredHash || '8da85b0d5bfe62527e5b244c209159c3';
if(!/^\d+$/.test(id || '') || !/^[a-f0-9]{32}$/.test(hash || '')) throw new Error('Invalid public API_ID/API_HASH');
// Version values follow the checked-out upstream release; do not copy a local .env.
const version = fs.readFileSync('public/version', 'utf8').trim();
const match = /^(\d+\.\d+\.\d+) \((\d+)\)$/.exec(version);
if(!match) throw new Error('Unknown upstream version format');
fs.writeFileSync('.env', `API_ID=${id}\nAPI_HASH=${hash}\nVERSION=${match[1]}\nVERSION_FULL=${version}\nBUILD=${match[2]}\n`);
