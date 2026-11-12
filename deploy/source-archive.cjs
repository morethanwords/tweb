// Run in the exact tested checkout with submodules initialized. No Git credentials.
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tweb-source-'));
const destination = path.resolve(process.argv[2] || 'source.tar.gz');
try {
  const files = execFileSync('git', ['ls-files', '--recurse-submodules', '-z']).toString().split('\0').filter(Boolean);
  for(const file of files) {
    const target = path.join(tmp, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(file, target);
  }
  execFileSync('tar', ['-czf', destination, '-C', tmp, '.']);
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}
