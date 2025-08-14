// @ts-check

const {spawn, execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const keepAsset = require('./keepAsset');
const {NodeSSH} = require('node-ssh');
const zlib = require('zlib');

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, 'dist');

function readSSHConfig() {
  let sshConfig;
  try {
    sshConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'ssh.json'), 'utf8'));
  } catch(err) {

  }

  return sshConfig;
}

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

    fs.unlinkSync(path.join(publicPath, file.name));
  });
}

function changeVersion(langVersion) {
  const version = process.argv[2] || 'same';
  const changelog = process.argv[3] || 'same';
  const child = spawn(npmCmd, ['run', 'change-version', version, changelog, langVersion], {shell: true});
  child.stdout.on('data', (chunk) => {
    console.log(chunk.toString());
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if(code != 0) {
        reject(new Error('Failed to change version'));
      } else {
        resolve();
      }
    });
  });
}

function applyNewLang() {
  const child = spawn(npmCmd, ['run', 'apply-new-lang'], {shell: true});
  let data = '';
  child.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if(code != 0) {
        reject(new Error('Failed to apply new lang'));
      } else {
        const version = +data.trim().split(/[\r\n]/).pop();
        resolve(version);
      }
    });
  });
}

function formatLang() {
  const child = spawn(npmCmd, ['run', 'format-lang'], {shell: true});
  child.stdout.on('data', (chunk) => {
    console.log(chunk.toString());
  });

  return new Promise((resolve, reject) => { 
    child.on('close', (code) => {
      if(code != 0) {
        reject(new Error('Failed to format lang'));
      } else {
        resolve();
      }
    });
  });
}

const onCompiled = async() => {
  console.log('Compiled successfully.');
  copyFiles(distPath, publicPath);
  clearOldFiles();

  const sshConfig = readSSHConfig();
  if(!sshConfig) {
    console.log('No SSH config, skipping upload');
    return;
  }

  const archiveName = 'archive.zip';
  const archivePath = path.join(__dirname, archiveName);
  execSync(`zip -r ${archivePath} *`, {
    cwd: publicPath
  });

  const ssh = new NodeSSH();
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

formatLang()
.then(applyNewLang)
.then((version) => {
  console.log('Applied new lang', version);
  return changeVersion(version);
}, () => {
  console.error('Failed to apply new lang');
  return changeVersion('same');
}).then(() => {
  const child = spawn(npmCmd, ['run', 'build'], {shell: true});
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
