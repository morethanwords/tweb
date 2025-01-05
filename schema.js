const {execSync} = require('child_process');
const {readFileSync, writeFileSync} = require('fs');

const willPaste = process.argv[2] === '1';
const sourceFile = process.argv[2];

let sourceContent = (() => {
  if(willPaste) {
    return execSync('pbpaste', {encoding: 'utf8'});
  }
  if(sourceFile) {
    return readFileSync(sourceFile, 'utf8');
  }
})();

if(sourceContent) {
  const path = `${__dirname}/src/scripts/in/schema.json`;
  const schemaIn = readFileSync(path, 'utf8');
  const replaced = schemaIn.replace(/("API": ).+?(,\n)/, `$1${sourceContent}$2`);
  writeFileSync(path, replaced);
}

execSync(`node ${__dirname}/src/scripts/format_schema.js`);
const formattedSchema = readFileSync(`${__dirname}/src/scripts/out/schema.json`, 'utf8');

const schemaTsPath = `${__dirname}/src/lib/mtproto/schema.ts`;
const schemaTs = readFileSync(schemaTsPath, 'utf8');
const replaced = schemaTs.replace(/(export default )\{.+?( as )/, `$1${formattedSchema}$2`);
writeFileSync(schemaTsPath, replaced);

execSync(`npm run generate-mtproto-types`);
