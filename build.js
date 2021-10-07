// @ts-check

const { spawn } = require('child_process');

const version = process.argv[2] || 'same';
const changelog = '';
const child = spawn(`npm`, ['run', 'change-version', version, changelog].filter(Boolean));
child.stdout.on('data', (chunk) => {
  console.log(chunk.toString());
});

child.on('close', (code) => {
  if(code != 0) {
    console.log(`child process exited with code ${code}`);
  }

  const child = spawn(`npm`, ['run', 'build']);
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
