const {execSync} = require('child_process');
const {readFileSync, writeFileSync} = require('fs');

const willPaste = process.argv[2];
if(willPaste) {
  const newSchemaIn = execSync('pbpaste', {encoding: 'utf8'});
  const path = `${__dirname}/src/scripts/in/schema.json`;
  const schemaIn = readFileSync(path, 'utf8');
  const replaced = schemaIn.replace(/("API": ).+?(,\n)/, `$1${newSchemaIn}$2`);
  writeFileSync(path, replaced);
}

execSync(`node ${__dirname}/src/scripts/format_schema.js`);
const formattedSchema = readFileSync(`${__dirname}/src/scripts/out/schema.json`, 'utf8');

const schemaTsPath = `${__dirname}/src/lib/mtproto/schema.ts`;
const schemaTs = readFileSync(schemaTsPath, 'utf8');
const replaced = schemaTs.replace(/(export default )\{.+?( as )/, `$1${formattedSchema}$2`);
writeFileSync(schemaTsPath, replaced);

execSync(`npm run generate-mtproto-types`);
