const fs = require('fs');
const path = require('path');
const {spawn, execSync} = require('child_process');

const LANG_FILE_PATH = path.join(__dirname, 'src', 'lang.ts');
const LANG_SIGN_FILE_PATH = path.join(__dirname, 'src', 'langSign.ts');
const ENV_LOCAL_FILE_PATH = path.join(__dirname, '.env.local');
const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

// Function to read current version from App.ts
const getCurrentVersion = () => {
  try {
    const appContent = fs.readFileSync(ENV_LOCAL_FILE_PATH, 'utf8');
    const match = appContent.match(/VITE_LANG_PACK_LOCAL_VERSION=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch(error) {
    console.error('❌ Error reading App.ts:', error.message);
    return 0;
  }
};

// Function to update version in App.ts
const updateVersion = (newVersion) => {
  try {
    let appContent = fs.readFileSync(ENV_LOCAL_FILE_PATH, 'utf8');
    appContent = appContent.replace(
      /(VITE_LANG_PACK_LOCAL_VERSION=)\d+/,
      `$1${newVersion}`
    );
    fs.writeFileSync(ENV_LOCAL_FILE_PATH, appContent, 'utf8');
    console.log(`✅ Version updated to ${newVersion}`);

    execSync(`${npmCmd} run format-lang`);
  } catch(error) {
    console.error('❌ Error updating App.ts:', error.message);
  }
};

// Function to get file hash
const getFileHash = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.mtime.getTime()}_${stats.size}`;
  } catch(error) {
    return null;
  }
};

// Function to handle file change
const handleFileChange = (filePath, fileName, lastHash, currentVersion, isUpdating) => {
  if(isUpdating.value) return; // Prevent multiple updates

  const currentHash = getFileHash(filePath);

  if(currentHash && currentHash !== lastHash.value) {
    console.log(`📝 Changes detected in ${fileName}`);
    isUpdating.value = true;
    currentVersion.value++;
    updateVersion(currentVersion.value);
    lastHash.value = currentHash;

    // Reset updating flag after a delay to prevent immediate re-triggering
    setTimeout(() => {
      isUpdating.value = false;
    }, 200);
  }
};

// Function to check if files exist
const checkFilesExist = (files) => {
  for(const {path, name} of files) {
    if(!fs.existsSync(path)) {
      console.error(`❌ File ${path} not found!`);
      return false;
    }
  }
  return true;
};

// Main watching function using fs.watch
const watchLangFile = () => {
  const files = [
    {path: LANG_FILE_PATH, name: 'lang.ts'},
    {path: LANG_SIGN_FILE_PATH, name: 'langSign.ts'}
  ];

  console.log('🔍 Watching for changes in lang files...');
  console.log(`📁 Files: ${files.map(f => f.path).join(', ')}`);

  const lastHashes = files.map(f => ({value: getFileHash(f.path)}));
  const currentVersion = {value: getCurrentVersion()};
  const isUpdating = {value: false};

  console.log(`📊 Current version: ${currentVersion.value}`);

  // Check if files exist
  if(
    !checkFilesExist(files.concat([{path: ENV_LOCAL_FILE_PATH, name: '.env.local'}]))
  ) {
    console.error('❌ Files not found!');
    return;
  }

  // Create watchers for each file
  const watchers = files.map((file, index) => {
    return fs.watch(file.path, (eventType, filename) => {
      if(eventType === 'change') {
        // Small delay to complete file writing
        setTimeout(() => {
          handleFileChange(file.path, file.name, lastHashes[index], currentVersion, isUpdating);
        }, 100);
      }
    });
  });

  // Error handling
  watchers.forEach((watcher, index) => {
    watcher.on('error', (error) => {
      console.error(`❌ File watching error (${files[index].name}):`, error.message);
    });
  });

  console.log('✅ Watching started. Press Ctrl+C to stop.');

  // Process termination handling
  const cleanup = () => {
    console.log('\n🛑 Stopping watch...');
    watchers.forEach(watcher => watcher.close());
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};

// Alternative function with interval (for cases when fs.watch doesn't work)
const watchLangFileWithInterval = () => {
  const files = [
    {path: LANG_FILE_PATH, name: 'lang.ts'},
    {path: LANG_SIGN_FILE_PATH, name: 'langSign.ts'}
  ];

  console.log('🔍 Watching for changes in lang files (interval mode)...');
  console.log(`📁 Files: ${files.map(f => f.path).join(', ')}`);

  const lastHashes = files.map(f => ({value: getFileHash(f.path)}));
  const currentVersion = {value: getCurrentVersion()};

  console.log(`📊 Current version: ${currentVersion.value}`);

  // Check if files exist
  if(
    !checkFilesExist(files.concat([{path: ENV_LOCAL_FILE_PATH, name: '.env.local'}]))
  ) {
    return;
  }

  const isUpdating = {value: false};

  const interval = setInterval(() => {
    files.forEach((file, index) => {
      handleFileChange(file.path, file.name, lastHashes[index], currentVersion, isUpdating);
    });
  }, 1000);

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
  getCurrentVersion,
  updateVersion
};
