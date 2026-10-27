const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execSync} = require('child_process');

const SRC_DIR = path.join(__dirname, 'src');
const LANG_FILE_NAMES = ['lang.ts', 'langSign.ts'];
const LANG_FILES = LANG_FILE_NAMES.map((name) => path.join(SRC_DIR, name));
const EDIT_FILE_PATH = path.join(SRC_DIR, 'langPackLocalVersion.ts');
const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

// The version tells a client that its cached language pack is older than the local strings, so it
// goes up only when lang.ts or langSign.ts really changed. Next to it the file keeps a hash of the
// two: a dev server that starts with the same strings leaves the file alone, since rewriting it
// reloads every page served from this checkout - previews, a test suite's server - for nothing.
const HASH_PREFIX = '// lang.ts + langSign.ts: ';

const readVersionFile = () => {
  try {
    const content = fs.readFileSync(EDIT_FILE_PATH, 'utf8');
    const version = content.match(/const langPackLocalVersion = (\d+);/);
    const hashLine = content.split('\n').find((line) => line.startsWith(HASH_PREFIX));
    return {version: version ? +version[1] : 0, hash: hashLine?.slice(HASH_PREFIX.length)};
  } catch(error) {
    return {version: 0};
  }
};

const getStringsHash = () => {
  const hash = crypto.createHash('sha1');
  for(const filePath of LANG_FILES) {
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }

  return hash.digest('hex');
};

// the strings format-lang last failed on: skipped while they stay, tried again once other strings are
// seen - even if the edit later goes back to them - or in a new process
let failedHash;

// Regenerates langPack.strings and bumps the version when the strings differ from the last bump.
// The version is written only after format-lang succeeds. Returns true when it bumped, false when
// the strings had not changed, and nothing when it failed.
const updateVersionIfChanged = () => {
  let hash;
  try {
    hash = getStringsHash();
    if(hash !== failedHash) {
      failedHash = undefined;
    }

    const {version, hash: lastHash} = readVersionFile();
    if(hash === lastHash) {
      return false;
    }

    if(hash === failedHash) {
      return;
    }

    execSync(`${npmCmd} run format-lang`);
    // written whole, then renamed into place: the dev server reloads on this file and must never read
    // it half-written
    const tmpPath = EDIT_FILE_PATH + '.tmp';
    fs.writeFileSync(tmpPath, `const langPackLocalVersion = ${version + 1};export default langPackLocalVersion;
${HASH_PREFIX}${hash}
`, 'utf8');
    fs.renameSync(tmpPath, EDIT_FILE_PATH);
    console.log(`✅ Version updated to ${version + 1}`);
    return true;
  } catch(error) {
    failedHash = hash;
    console.error('❌ Error updating the language pack version:', error.message);
  }
};

const checkFilesExist = () => {
  for(const filePath of LANG_FILES) {
    if(!fs.existsSync(filePath)) {
      console.error(`❌ File ${filePath} not found!`);
      return false;
    }
  }

  return true;
};

const startCheck = () => {
  if(updateVersionIfChanged() === false) {
    console.log(`📊 Current version: ${readVersionFile().version}, the strings have not changed`);
  }
};

// Vite evaluates vite.config.ts again, in the same process, on every dev-server restart. Each start
// checks the strings again; the watcher is made once per process, or every restart would stack
// another one.
const WATCHING_KEY = Symbol.for('tweb.watchLangFile');

// Main watching function using fs.watch
const watchLangFile = () => {
  if(!checkFilesExist()) {
    return;
  }

  startCheck();
  if(globalThis[WATCHING_KEY]) {
    return;
  }

  console.log('🔍 Watching for changes in lang files...');
  console.log(`📁 Files: ${LANG_FILES.join(', ')}`);

  // The folder rather than the files: an editor that saves by renaming a new file over the old one
  // would leave a watcher on the file looking at a file that is gone. A small delay lets the write
  // complete; extra events are cheap, the hash tells a real change.
  const watcher = fs.watch(SRC_DIR, (eventType, filename) => {
    if(!filename || LANG_FILE_NAMES.includes(filename)) {
      setTimeout(updateVersionIfChanged, 100);
    }
  });
  watcher.on('error', (error) => {
    console.error('❌ File watching error:', error.message);
  });

  console.log('✅ Watching started. Press Ctrl+C to stop.');
  globalThis[WATCHING_KEY] = true;

  // Process termination handling
  const cleanup = () => {
    console.log('\n🛑 Stopping watch...');
    watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};

// Alternative function with interval (for cases when fs.watch doesn't work)
const watchLangFileWithInterval = () => {
  if(!checkFilesExist()) {
    return;
  }

  startCheck();
  console.log('🔍 Watching for changes in lang files (interval mode)...');
  console.log(`📁 Files: ${LANG_FILES.join(', ')}`);

  const interval = setInterval(updateVersionIfChanged, 1000);

  console.log('✅ Watching started. Press Ctrl+C to stop.');

  // Process termination handling
  const cleanup = () => {
    console.log('\n🛑 Stopping watch...');
    clearInterval(interval);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};

// Start watching
if(require.main === module) {
  // Try to use fs.watch, if it doesn't work - switch to interval mode
  try {
    watchLangFile();
  } catch(error) {
    console.log('⚠️ fs.watch unavailable, switching to interval mode...');
    watchLangFileWithInterval();
  }
}

module.exports = {
  watchLangFile,
  watchLangFileWithInterval,
  updateVersionIfChanged
};
