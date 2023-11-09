const https = require('https');
const fs = require('fs');

https.get('https://translations.telegram.org/en/webk/export', (response) => {
  let data = '';

  response.on('data', (chunk) => {
    data += chunk;
  });

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
      const path = `../${part}.ts`;
    
      let lang = fs.readFileSync(path).toString();

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

      fs.writeFileSync(path, lang);
    });
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
