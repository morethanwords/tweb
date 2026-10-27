import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {getInvalidLangKeys} from '@/scripts/lib/validateLangStrings';

const source = readFileSync('src/scripts/apply_new_lang.js', 'utf8');

function createImport() {
  const files = {
    'lang.ts': `const lang = {
  'Gift': {
    'one_value': '%2$s sent %1$d gift',
    'other_value': '%2$s sent %1$d gifts'
  },
  'Apps': {
    'other_value': '%2$s & %1$d Other'
  },
  'Sent': {
    'one_value': 'Star sent!',
    'other_value': 'Stars sent!'
  }
};`,
    'langSign.ts': `const lang = {
  'Greeting': 'Hello',
  'Formula': 'x',
  'Fragment': 'Get it on [Fragment]()'
};`
  };
  const response = Object.assign(new EventEmitter(), {
    headers: {'content-disposition': 'attachment; filename="lang_v1.strings"'}
  });
  const writeFileSync = vi.fn((file: string, text: string) => {
    files[path.basename(file) as keyof typeof files] = text;
  });
  const modules = {
    https: {
      get: (_url: string, callback: (response: EventEmitter) => void) => {
        callback(response);
        return new EventEmitter();
      }
    },
    fs: {readFileSync: (file: string) => files[path.basename(file) as keyof typeof files], writeFileSync},
    path,
    './lib/validateLangStrings.ts': {getInvalidLangKeys}
  };
  const warn = vi.fn();
  runInNewContext(source, {
    __dirname: path.resolve('src/scripts'),
    require: (name: keyof typeof modules) => modules[name],
    console: {log: vi.fn(), warn}
  });

  return {
    files,
    writeFileSync,
    warn,
    apply: (text: string) => {
      response.emit('data', text);
      response.emit('end');
    }
  };
}

describe('translation import', () => {
  it('imports the texts that count by argument 1 and ignores keys the client does not use', () => {
    const {apply, files, writeFileSync, warn} = createImport();

    apply([
      '"Greeting" = "Welcome";',
      '"Gift_one" = "%2$s bought %1$d gift";',
      '"Gift_other" = "%2$s bought %1$d gifts";',
      '"Unused_other" = "%s bought %d gifts";'
    ].join('\n'));

    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(files['lang.ts']).toContain(`'other_value': '%2$s bought %1$d gifts'`);
    expect(files['langSign.ts']).toContain(`'Greeting': 'Welcome'`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the local text of a server text that counts by another argument, imports the rest and lists it', () => {
    const {apply, files, warn} = createImport();

    apply([
      '"Greeting" = "Welcome";',
      '"Gift_one" = "%1$s bought %2$d gift";',
      '"Gift_other" = "%1$s bought %2$d gifts";'
    ].join('\n'));

    expect(files['lang.ts']).toContain(`'other_value': '%2$s sent %1$d gifts'`);
    expect(files['langSign.ts']).toContain(`'Greeting': 'Welcome'`);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fix on the server: Gift'));
  });

  it('keeps the local text of a server link whose address is a placeholder', () => {
    const {apply, files, warn} = createImport();

    apply([
      '"Greeting" = "Welcome";',
      '"Fragment" = "Get it on [Fragment](%1$@)";'
    ].join('\n'));

    expect(files['langSign.ts']).toContain(`'Fragment': 'Get it on [Fragment]()'`);
    expect(files['langSign.ts']).toContain(`'Greeting': 'Welcome'`);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fix on the server: Fragment'));
  });

  it('drops a form the client does not have instead of writing it into the next text', () => {
    const {apply, files} = createImport();

    apply([
      '"Apps_one" = "%2$s & %1$d Other";',
      '"Apps_other" = "%2$s & %1$d Others";'
    ].join('\n'));

    expect(files['lang.ts']).toContain(`'other_value': '%2$s & %1$d Others'`);
    expect(files['lang.ts']).toContain(`'one_value': 'Star sent!'`);
  });

  it('reaches a later form past a brace inside an earlier one', () => {
    const {apply, files} = createImport();

    apply([
      '"Gift_one" = "%2$s sent {%1$d} gift";',
      '"Gift_other" = "%2$s sent {%1$d} gifts";'
    ].join('\n'));

    expect(files['lang.ts']).toContain(`'one_value': '%2$s sent {%1$d} gift'`);
    expect(files['lang.ts']).toContain(`'other_value': '%2$s sent {%1$d} gifts'`);
  });

  it('keeps a backslash of the text itself escaped in the source', () => {
    const {apply, files} = createImport();

    apply(String.raw`"Formula" = "x=\frac{a}{b}\nand \"y\"";`);

    expect(files['langSign.ts']).toContain(String.raw`'Formula': 'x=\\frac{a}{b}\nand "y"'`);
  });
});
