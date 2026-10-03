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
  // use glyf bboxes instead of full-em
  padTgicoGlyphBBoxes(fontsPath);
  const files = fs.readdirSync(fontsPath);
  files.forEach(fileName => {
    fs.cpSync(fontsPath + fileName, path.join(__dirname, '../../../public/assets/fonts/' + fileName));
  });
}

function padTgicoGlyphBBoxes(fontsPath) {
  const {spawnSync} = require('child_process');
  const py = `
from fontTools.ttLib import TTFont
from pathlib import Path
import sys
fonts = Path(sys.argv[1])
ttf = fonts / 'tgico.ttf'
woff = fonts / 'tgico.woff'
em = 1024
font = TTFont(str(ttf))
n = 0
for name in font.getGlyphOrder():
    g = font['glyf'][name]
    if getattr(g, 'numberOfContours', 0) <= 0:
        continue
    new = (0, 0, max(int(g.xMax), 0), em)
    if (g.xMin, g.yMin, g.xMax, g.yMax) != new:
        g.xMin, g.yMin, g.xMax, g.yMax = new
        n += 1
xs, ys = [], []
for name in font.getGlyphOrder():
    g = font['glyf'][name]
    if getattr(g, 'numberOfContours', 0) > 0:
        xs += [g.xMin, g.xMax]; ys += [g.yMin, g.yMax]
if xs:
    font['head'].xMin, font['head'].xMax = min(xs), max(xs)
    font['head'].yMin, font['head'].yMax = min(ys), max(ys)
font.recalcBBoxes = False
font.save(str(ttf))
if woff.is_file():
    w = TTFont(str(ttf))
    w.flavor = 'woff'
    w.recalcBBoxes = False
    w.save(str(woff))
check = TTFont(str(ttf))
assert len(check['hmtx'].metrics) == check['maxp'].numGlyphs
print('[tgico] padded', n, 'glyph header bboxes to full em')
`;
  const result = spawnSync('python3', ['-c', py, fontsPath], {encoding: 'utf8'});
  if(result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    throw new Error('padTgicoGlyphBBoxes failed (python3 and fonttools are required)');
  }
  if(result.stdout) console.log(result.stdout.trimEnd());
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
