// @ts-check

const pipeline = require('./icomoon');
const fs = require('fs');
const path = require('path');

const iconsPath = path.join(__dirname, '../../../assets/icons/');
const tsOutPath = path.join(__dirname, '../../icons.ts');
const files = fs.readdirSync(iconsPath);
const currentIconOrder = new Map(
  Array.from(fs.readFileSync(tsOutPath, 'utf8').matchAll(/^\s+([a-zA-Z0-9_]+):/gm))
  .map((match, index) => [match[1], index])
);
const generatedIconNameOverrides = {
  '1check.svg': 'check',
  '2checks.svg': 'checks',
  'check.svg': 'check1'
};
const getGeneratedIconName = file => generatedIconNameOverrides[file] || path.basename(file, '.svg').replace(/^\d+/, '');
const icons = files
.filter(file => file.endsWith('.svg'))
.sort((left, right) => {
  const leftOrder = currentIconOrder.get(getGeneratedIconName(left)) ?? currentIconOrder.size;
  const rightOrder = currentIconOrder.get(getGeneratedIconName(right)) ?? currentIconOrder.size;
  return leftOrder - rightOrder || left.localeCompare(right);
})
.map(file => iconsPath + file);

function moveFiles(outPath) {
  // const path = './out/';

  const stylesOutPath = path.join(__dirname, '../../scss/tgico/_');

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
  styleText = styleText.replace('\n', '\n@use "../variables" as *;\n');
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
