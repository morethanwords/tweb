const {execSync} = require('child_process');
const path = require('path');
const fs = require('fs');

const solidPath = path.join(__dirname, '../solid');
console.log(solidPath);

const solidPackagePath = path.join(solidPath, 'packages/solid');

const json = require(path.join(solidPackagePath, 'package.json'));

execSync(`pnpm run build`, {
  cwd: solidPath
});

const copy = ['package.json'].concat(json.files).map((file) => {
  return path.join(solidPackagePath, file);
});

copy.push(path.join(solidPath, 'LICENSE'));

function deleteFolderRecursive(directoryPath) {
  if(fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const currentPath = path.join(directoryPath, file);

      if(fs.lstatSync(currentPath).isDirectory()) {
        // Recursively delete subdirectory
        deleteFolderRecursive(currentPath);
      } else {
        // Remove file
        fs.unlinkSync(currentPath);
      }
    });

    // Remove now-empty directory
    fs.rmdirSync(directoryPath);
  } else {
    console.error("Directory path " + directoryPath + " not found.");
  }
}

function copyFile(source, target) {
  // Ensure that the directory exists. If not, create it.
  const targetDir = path.dirname(target);
  if(!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, {recursive: true});
  }

  fs.copyFileSync(source, target);
}

function copyFolder(source, target) {
  // Ensure that the directory exists. If not, create it.
  if(!fs.existsSync(target)) {
    fs.mkdirSync(target, {recursive: true});
  }

  const items = fs.readdirSync(source);

  for(const item of items) {
    const sourcePath = path.join(source, item);
    const targetPath = path.join(target, item);

    const stats = fs.statSync(sourcePath);

    if(stats.isDirectory()) {
      copyFolder(sourcePath, targetPath);
    } else if(stats.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

const buildedSolidPath = path.join(__dirname, '../vendor/solid');
deleteFolderRecursive(buildedSolidPath);
copy.forEach((source) => {
  const lastParts = source.split('/').slice(-5);
  for(let i = 0; i < lastParts.length; ++i) {
    if(lastParts[i] === 'packages') {
      lastParts.splice(0, i + 2);
      break;
    }
  }

  const solidIndex = lastParts.indexOf('solid');
  if(solidIndex !== -1) {
    lastParts.splice(0, solidIndex + 1);
  }

  console.log(lastParts);

  const target = path.join(buildedSolidPath, lastParts.join('/'));
  if(fs.statSync(source).isDirectory()) {
    copyFolder(source, target);
  } else {
    copyFile(source, target);
  }
});

// console.log(copy);
