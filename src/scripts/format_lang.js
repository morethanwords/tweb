const fs = require('fs');
const path = require('path');

const f = (key, value, plural) => {
  if (typeof value !== 'string') return '';
  value = value
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
  return `"${key}${plural ? '_' + plural.replace('_value', '') : ''}" = "${value}";\n`;
};

let out = '';

const shortDomain = process.env.VITE_SHORT_DOMAIN || 't.me';
const appName = process.env.VITE_APP_NAME || 'Telegram';

['lang', 'langSign'].forEach(part => {
  const filePath = path.join(__dirname, `../${part}.ts`);
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Remove imports and export keywords
  code = code
    .replace(/import\s+[^;]+;/g, '')
    .replace(/export\s+default\s+/g, 'return ')
    .replace(/export\s+const\s+\w+\s*:\s*[^=]+=\s*/g, 'return ')
    .replace(/export\s+const\s+\w+\s*=\s*/g, 'return ');

  // 2. Strip existing const/let/var declarations of shortDomain & appName so new Function() doesn't throw redeclaration errors
  code = code
    .replace(/(?:const|let|var)\s+shortDomain\s*=[^;]+;/g, '')
    .replace(/(?:const|let|var)\s+appName\s*=[^;]+;/g, '');

  try {
    const parseLangObj = new Function('shortDomain', 'appName', code);
    const json = parseLangObj(shortDomain, appName);

    for (const key in json) {
      const value = json[key];
      if (typeof value === 'string') {
        out += f(key, value);
      } else if (typeof value === 'object' && value !== null) {
        for (const plural in value) {
          out += f(key, value[plural], plural);
        }
      }
    }
  } catch (err) {
    console.error(`Error parsing ${part}.ts:`, err.message);
  }
});

const outDir = path.join(__dirname, './out');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'langPack.strings'), out);