// @ts-check

const {spawn, execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const keepAsset = require('./keepAsset');
const {NodeSSH} = require('node-ssh');
const sshConfig = require('./ssh.json');
const zlib = require('zlib');

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

  const child = spawn(npmCmd, ['run', 'build']);
  child.stdout.on('data', (chunk) => {
    console.log(chunk.toString());
  });

  let error = '';
  child.stderr.on('data', (chunk) => {
    error += chunk.toString();
  });

  child.on('close', (code) => {
    if(code != 0) {
      console.error(error, `build child process exited with code ${code}`);
    } else {
      onCompiled();
    }
  });
});

const ssh = new NodeSSH();
const onCompiled = async() => {
  console.log('Compiled successfully.');
  copyFiles(distPath, publicPath);
  clearOldFiles();

  const archiveName = 'archive.zip';
  const archivePath = path.join(__dirname, archiveName);
  execSync(`zip -r ${archivePath} *`, {
    cwd: publicPath
  });

  await ssh.connect({
    ...sshConfig,
    tryKeyboard: true
  });
  console.log('SSH connected');
  await ssh.execCommand(`rm -rf ${sshConfig.publicPath}/*`);
  console.log('Cleared old files');
  await ssh.putFile(archivePath, path.join(sshConfig.publicPath, archiveName));
  console.log('Uploaded archive');
  await ssh.execCommand(`cd ${sshConfig.publicPath} && unzip ${archiveName} && rm ${archiveName}`);
  console.log('Unzipped archive');
  fs.unlinkSync(archivePath);
  ssh.connection?.destroy();
};

function compressFolder(folderPath) {
  const archive = {};

  function processFolder(folderPath, parentKey) {
    const folderName = path.basename(folderPath);
    const folderKey = parentKey ? `${parentKey}/${folderName}` : folderName;
    archive[folderKey] = {};

    const files = fs.readdirSync(folderPath);
    for(const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      if(stats.isFile()) {
        const fileContent = fs.readFileSync(filePath);
        const compressedContent = zlib.deflateSync(fileContent);
        archive[folderKey][file] = compressedContent;
        break;
      }/*  else if(stats.isDirectory()) {
        processFolder(filePath, folderKey);
      } */
    }
  }

  processFolder(folderPath);

  const compressedArchive = zlib.gzipSync(JSON.stringify(archive));
  return compressedArchive;
}

/* exec(`npm run change-version ${version}${changelog ? ' ' + changelog : ''}; npm run build`, (err, stdout, stderr) => {
  if(err) {
    return;
  }

  // the *entire* stdout and stderr (buffered)
  console.log(`stdout: ${stdout}`);
  console.log(`stderr: ${stderr}`);
}); */
