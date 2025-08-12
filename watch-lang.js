const fs = require('fs');
const path = require('path');

const LANG_FILE_PATH = path.join(__dirname, 'src', 'lang.ts');
const APP_FILE_PATH = path.join(__dirname, 'src', 'config', 'app.ts');

// Function to read current version from App.ts
const getCurrentVersion = () => {
  try {
    const appContent = fs.readFileSync(APP_FILE_PATH, 'utf8');
    const match = appContent.match(/langPackLocalVersion:\s*(\d+)/);
    return match ? parseInt(match[1]) : 0;
  } catch(error) {
    console.error('❌ Error reading App.ts:', error.message);
    return 0;
  }
};

// Function to update version in App.ts
const updateVersion = (newVersion) => {
  try {
    let appContent = fs.readFileSync(APP_FILE_PATH, 'utf8');
    appContent = appContent.replace(
      /(langPackLocalVersion:\s*)\d+/,
      `$1${newVersion}`
    );
    fs.writeFileSync(APP_FILE_PATH, appContent, 'utf8');
    console.log(`✅ Version updated to ${newVersion}`);
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

// Main watching function using fs.watch
const watchLangFile = () => {
  console.log('🔍 Watching for changes in lang.ts file...');
  console.log(`📁 File: ${LANG_FILE_PATH}`);

  let lastHash = getFileHash(LANG_FILE_PATH);
  let currentVersion = getCurrentVersion();
  let isUpdating = false;

  console.log(`📊 Current version: ${currentVersion}`);

  // Check if file exists
  if(!fs.existsSync(LANG_FILE_PATH)) {
    console.error(`❌ File ${LANG_FILE_PATH} not found!`);
    return;
  }

  // Use fs.watch for file monitoring
  const watcher = fs.watch(LANG_FILE_PATH, (eventType, filename) => {
    if(isUpdating) return; // Avoid recursive updates

    if(eventType === 'change') {
      // Small delay to complete file writing
      setTimeout(() => {
        const currentHash = getFileHash(LANG_FILE_PATH);

        if(currentHash && currentHash !== lastHash) {
          console.log('📝 Changes detected in lang.ts');
          isUpdating = true;
          currentVersion++;
          updateVersion(currentVersion);
          lastHash = currentHash;
          isUpdating = false;
        }
      }, 100);
    }
  });

  // Error handling
  watcher.on('error', (error) => {
    console.error('❌ File watching error:', error.message);
  });

  console.log('✅ Watching started. Press Ctrl+C to stop.');

  // Process termination handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping watch...');
    watcher.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping watch...');
    watcher.close();
    process.exit(0);
  });
};

// Alternative function with interval (for cases when fs.watch doesn't work)
const watchLangFileWithInterval = () => {
  console.log('🔍 Watching for changes in lang.ts file (interval mode)...');
  console.log(`📁 File: ${LANG_FILE_PATH}`);

  let lastHash = getFileHash(LANG_FILE_PATH);
  let currentVersion = getCurrentVersion();

  console.log(`📊 Current version: ${currentVersion}`);

  // Check if file exists
  if(!fs.existsSync(LANG_FILE_PATH)) {
    console.error(`❌ File ${LANG_FILE_PATH} not found!`);
    return;
  }

  const interval = setInterval(() => {
    const currentHash = getFileHash(LANG_FILE_PATH);

    if(currentHash && currentHash !== lastHash) {
      console.log('📝 Changes detected in lang.ts');
      currentVersion++;
      updateVersion(currentVersion);
      lastHash = currentHash;
    }
  }, 1000);

  console.log('✅ Watching started. Press Ctrl+C to stop.');

  // Process termination handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping watch...');
    clearInterval(interval);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping watch...');
    clearInterval(interval);
    process.exit(0);
  });
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
