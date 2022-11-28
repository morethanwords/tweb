// @ts-check

const {spawn} = require('child_process');

const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
const version = process.argv[2] || 'same';
const changelog = process.argv[3] || '';
const child = spawn(npmCmd, ['run', 'change-version', version, changelog].filter(Boolean));
child.stdout.on('data', (chunk) => {
  console.log(chunk.toString());
});

child.on('close', (code) => {
  if(code != 0) {
    console.log(`child process exited with code ${code}`);
  }

  const child = spawn(npmCmd, ['run', 'build']);
  child.stdout.on('data', (chunk) => {
    console.log(chunk.toString());
  });

  child.on('close', (code) => {
    if(code != 0) {
      console.error(`child process exited with code ${code}`);
    } else {
      console.log('Compiled successfully.');
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
