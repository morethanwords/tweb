// @ts-check

const {spawn} = require('child_process');
const fs = require('fs');
const path = require('path');
const keepAsset = require('./keepAsset');

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
const version = process.argv[2] || 'same';
const changelog = process.argv[3] || '';
const child = spawn(npmCmd, ['run', 'change-version', version, changelog].filter(Boolean));
child.stdout.on('data', (chunk) => {
  console.log(chunk.toString());
});

const publicPath = __dirname + '/public/';
const distPath = __dirname + '/dist/';

function copyFiles(source, destination) {
  if(!fs.existsSync(destination)) {
    fs.mkdirSync(destination);
  }

  const files = fs.readdirSync(source, {withFileTypes: true});
  files.forEach((file) => {
    const sourcePath = path.join(source, file.name);
    const destinationPath = path.join(destination, file.name);

    if(file.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    } else if(file.isDirectory()) {
      copyFiles(sourcePath, destinationPath);
    }
  });
}

function clearOldFiles() {
  const bundleFiles = fs.readdirSync(distPath);
  const files = fs.readdirSync(publicPath, {withFileTypes: true});
  files.forEach((file) => {
    if(file.isDirectory() ||
      bundleFiles.some((bundleFile) => bundleFile === file.name) ||
      keepAsset(file.name)) {
      return;
    }

    fs.unlinkSync(publicPath + file.name);
  });
}

child.on('close', (code) => {
  if(code != 0) {
    console.log(`child process exited with code ${code}`);
  }

  const child = spawn(npmCmd, ['run', 'build:vite']);
  child.stdout.on('data', (chunk) => {
    console.log(chunk.toString());
  });

  child.on('close', (code) => {
    if(code != 0) {
      console.error(`child process exited with code ${code}`);
    } else {
      console.log('Compiled successfully.');
      copyFiles(distPath, publicPath);
      clearOldFiles();
    }
  });
});

/* exec(`npm run change-version ${version}${changelog ? ' ' + changelog : ''}; npm run build`, (err, stdout, stderr) => {
  if(err) {
    return;
  }

  // the *entire* stdout and stderr (buffered)
  console.log(`stdout: ${stdout}`);
  console.log(`stderr: ${stderr}`);
}); */
