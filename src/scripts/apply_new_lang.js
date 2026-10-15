const https = require('https');
const fs = require('fs');
const path = require('path');
const {getInvalidLangKeys} = require('./lib/validateLangStrings.ts');

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

    ['lang', 'langSign'].forEach((part) => {
      const filePath = path.resolve(__dirname, `../${part}.ts`);

      let lang = fs.readFileSync(filePath).toString();
      const originalLang = lang;

      const texts = {};
      const plural = {};
      data.split('\n').forEach((line) => {
        const match = line.match(/"(.+?)" = "(.+?)";/);
        if(!match) {
          // console.log('lol', line);
          return;
        }

        const key = match[1];
        // * the export escapes only a line break and a quote, any other backslash is the text's own
        const value = match[2].replace(/\\(?![n"])/g, '\\\\').replace(/'/g, `\\'`).replace(/\\"/g, '"');
        if(key.includes('_') && ignore.has(key.split('_').pop())) {
          const splitted = key.split('_');
          const k = splitted.shift();
          const v = splitted.pop();
          plural[k] ??= {};
          plural[k][v + '_value'] = value;
          return;
        }

        texts[key] = value;
      });

      // * a server text the client would render wrong keeps the local one, and is listed to be fixed on the server
      const used = Object.fromEntries([...Object.entries(texts), ...Object.entries(plural)].filter(([key]) => originalLang.includes(`'${key}': `)));
      const invalidKeys = getInvalidLangKeys(used);
      if(invalidKeys.length) {
        console.warn(`${part}.ts: not imported, fix on the server: ${invalidKeys.join(', ')}`);
        invalidKeys.forEach((key) => {
          delete texts[key];
          delete plural[key];
        });
      }

      for(const key in texts) {
        lang = lang.replace(new RegExp(`('${key}': ').+?('[,\n])`), `$1${texts[key]}$2`);
      }

      for(const key in plural) {
        for(const p in plural[key]) {
          // * stay inside the key's own object (a brace inside a quoted text is not its end): a form it does
          // * not have must not land in the next key's
          const regExp = new RegExp(`('${key}': \\{(?:'(?:[^'\\\\]|\\\\.)*'|[^'}])*?'${p}':\\s*')(?:[^'\\\\]+|\\\\.)*'`, 'g');
          lang = lang.replace(regExp, `$1${plural[key][p]}'`);
        }
      }

      if(originalLang !== lang) {
        fs.writeFileSync(filePath, lang);
      }
    });

    console.log(version);
  });
};

const applyNewLang = () => {
  https.get('https://translations.telegram.org/en/webk/export?mode=prod', onResponse).on("error", (err) => {
    throw new Error('Failed to fetch translations: ' + err.message);
  });
};

applyNewLang();
