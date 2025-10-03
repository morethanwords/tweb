// @ts-check

const pipeline = require('./icomoon');
const fs = require('fs');
const path = require('path');

const iconsPath = path.join(__dirname, '../../../assets/icons/');
const files = fs.readdirSync(iconsPath);
const icons = files.filter(file => file.endsWith('.svg')).map(file => iconsPath + file);

function moveFiles(outPath) {
  // const path = './out/';

  const stylesOutPath = path.join(__dirname, '../../scss/tgico/_');
  const tsOutPath = path.join(__dirname, '../../icons.ts');

  let styleText = fs.readFileSync(outPath + 'style.scss').toString();
  styleText = styleText
  .replace(/icomoon/g, 'tgico')
  // .replace('.tgico {', '.tgico:before {')
  .replace(/ +color: .+;\n/g, '') // remove color
  .replace('[class^="tgico-"], [class*=" tgico-"]', `/* [class^="tgico-"]:before,
[class^="tgico-"]:after, */
[class^="tgico-"],
.tgico:before,
.tgico:after,
[class*=" tgico-"]:before,
[class*=" tgico-"]:after`);

  // slice css :before
  const p = `-moz-osx-font-smoothing: grayscale;
}`;
  const idx = styleText.indexOf(p);
  styleText = styleText.slice(0, idx + p.length) + '\n';
  fs.writeFileSync(stylesOutPath + 'style.scss', styleText);

  let variablesText = fs.readFileSync(outPath + 'variables.scss').toString();
  variablesText = variablesText.slice(variablesText.indexOf('\n\n') + 2);
  const variables = variablesText.split('\n');
  const jsVariables = {}, o = [];
  variables.forEach((line) => {
    if(!line.trim()) return;
    const match = line.match(/\$tgico-(.+?): .+(\\e.+?)[\\"]/);
    // @ts-ignore
    jsVariables[match[1]] = match[2];
    // @ts-ignore
    o.push(`${match[1]}: '${match[2].slice(1)}'`);
  });
  const TAB = '  ';
  fs.writeFileSync(tsOutPath, `const Icons = {\n${TAB}${o.join(`,\n${TAB}`)}\n};\n\nexport default Icons;\n`);
  fs.writeFileSync(stylesOutPath + 'variables.scss', variablesText);

  const fontsPath = outPath + 'fonts/';
  const files = fs.readdirSync(fontsPath);
  files.forEach(fileName => {
    fs.cpSync(fontsPath + fileName, path.join(__dirname, '../../../public/assets/fonts/' + fileName));
  });
}

// moveFiles();
// process.exit(0);

pipeline({
  icons,
  // names: ['new1', 'new2'],
  selectionPath: path.join(__dirname, './selection.json'),
  outputDir: path.join(__dirname, './out'),
  forceOverride: true,
  visible: false,
  whenFinished: (result) => {
    moveFiles(result.outputDir + '/');
  }
});
