const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const upstream = {API_ID: '2496', API_HASH: '8da85b0d5bfe62527e5b244c209159c3'};
const custom = {API_ID: '12345678', API_HASH: '0123456789abcdef0123456789abcdef'};
for(const [name, variables, expected] of [
  ['absent variables use upstream', {}, upstream],
  ['empty GitHub variables use upstream', {API_ID: '', API_HASH: ''}, upstream],
  ['custom pair overrides upstream', custom, custom],
  ['ID without hash is rejected', {API_ID: custom.API_ID}, null],
  ['hash without ID is rejected', {API_HASH: custom.API_HASH}, null],
  ['invalid ID is rejected', {...custom, API_ID: 'invalid'}, null],
  ['invalid hash is rejected', {...custom, API_HASH: 'invalid'}, null],
  ['multiline value is rejected', {...custom, API_HASH: `${custom.API_HASH}\nBUILD=0`}, null]
]) {
  test(name, () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tweb-build-env-'));
    try {
      fs.mkdirSync(path.join(cwd, 'public'));
      fs.writeFileSync(path.join(cwd, 'public/version'), '1.2.0 (127)');
      fs.writeFileSync(path.join(cwd, '.env'), 'previous configuration\n');
      const env = {...process.env};
      delete env.API_ID;
      delete env.API_HASH;
      const result = spawnSync(process.execPath, [path.resolve('deploy/build-env.cjs')], {
        cwd, env: {...env, ...variables}, encoding: 'utf8'
      });
      const output = fs.readFileSync(path.join(cwd, '.env'), 'utf8');
      if(expected) {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(output, `API_ID=${expected.API_ID}\nAPI_HASH=${expected.API_HASH}\nVERSION=1.2.0\nVERSION_FULL=1.2.0 (127)\nBUILD=127\n`);
      } else {
        assert.notEqual(result.status, 0);
        assert.equal(output, 'previous configuration\n');
      }
    } finally {
      fs.rmSync(cwd, {recursive: true, force: true});
    }
  });
}
