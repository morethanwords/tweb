const https = require('https');
const fs = require('fs');
const path = require('path');
const {getInvalidPluralKeys} = require('./lib/validatePluralStrings.ts');

const onResponse = (response) => {
  let data = '';

  response.on('data', (chunk) => {
    data += chunk;
  });

  const version = response.headers['content-disposition'].match(/filename=".+v(\d+)\./)[1];

  if(!version) {
    console.log(response.headers);
    throw new Error('No version found');
  }

  response.on('end', () => {
    const ignore = new Set([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other'
    ]);

    const updates = ['lang', 'langSign'].map((part) => {
      const filePath = path.resolve(__dirname, `../${part}.ts`);
    
      let lang = fs.readFileSync(filePath).toString();
      const originalLang = lang;

      const plural = {};
      data.split('\n').forEach((line) => {
        const match = line.match(/"(.+?)" = "(.+?)";/);
        if(!match) {
          // console.log('lol', line);
          return;
        }
  
        const key = match[1];
        const value = match[2].replace(/'/g, `\\'`).replace(/\\"/g, '"');
        if(key.includes('_') && ignore.has(key.split('_').pop())) {
          const splitted = key.split('_');
          const k = splitted.shift();
          const v = splitted.pop();
          plural[k] ??= {};
          plural[k][v + '_value'] = value;
          return;
        }

        lang = lang.replace(new RegExp(`('${key}': ').+?('[,\n])`), `$1${value}$2`);
        // console.log(key, value);
      });

      for(const key in plural) {
        for(const p in plural[key]) {
          const regExp = new RegExp(`('${key}':[\\s\\S]*?'${p}':\\s*')(?:[^'\\\\]+|\\\\.)*'`, 'g');
          lang = lang.replace(regExp, `$1${plural[key][p]}'`);
        }
      }

      const importedPlurals = Object.fromEntries(Object.entries(plural).filter(([key]) => originalLang.includes(`'${key}': {`)));
      const invalidKeys = getInvalidPluralKeys(importedPlurals);
      if(invalidKeys.length) {
        throw new Error(`Translation import would move the plural count out of argument 1: ${invalidKeys.join(', ')}`);
      }

      return {filePath, lang, originalLang};
    });

    // Validate both packs before writing either one, so a rejected import preserves the local texts.
    for(const {filePath, lang, originalLang} of updates) {
      if(originalLang !== lang) fs.writeFileSync(filePath, lang);
    }

    console.log(version);
  });
};

const applyNewLang = () => {
  https.get('https://translations.telegram.org/en/webk/export?mode=prod', onResponse).on("error", (err) => {
    throw new Error('Failed to fetch translations: ' + err.message);
  });
};

applyNewLang();
