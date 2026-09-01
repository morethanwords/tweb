import {createRequire} from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

/**
 * Keeps `src/lib/settingsSearch/generated.ts` in step with the settings tabs it
 * is derived from: regenerated on every build and whenever a settings tab (or a
 * language string it may reference) changes during development.
 */
export default function settingsSearchPlugin(rootDir) {
  const GENERATOR = '../src/scripts/generate_settings_search.js';
  const {OUT_FILE} = require(GENERATOR);

  // Reloaded per run so editing the extractor itself takes effect without
  // restarting the dev server.
  const loadGenerator = () => {
    delete require.cache[require.resolve(GENERATOR)];
    return require(GENERATOR).generate;
  };

  const watched = [
    path.join(rootDir, 'src', 'components', 'sidebarLeft'),
    path.join(rootDir, 'src', 'components', 'sidebarRight'),
    path.join(rootDir, 'src', 'components', 'solidJsTabs'),
    path.join(rootDir, 'src', 'lang.ts'),
    path.join(rootDir, 'src', 'scripts', 'generate_settings_search.js'),
    path.join(rootDir, 'src', 'scripts', 'in', 'settings-links.csv')
  ];

  const run = () => {
    try {
      const {sections, entries, changed} = loadGenerator()();
      if(changed) console.log(`[settings-search] ${sections.length} sections, ${entries.length} entries`);
    } catch(err) {
      console.error('[settings-search] failed to generate the index:', err.message);
    }
  };

  let timeout;

  return {
    name: 'tweb:settings-search-index',
    enforce: 'pre',
    buildStart() {
      run();
    },
    handleHotUpdate({file}) {
      if(file === OUT_FILE || !/\.(tsx?|js|csv)$/.test(file) || !watched.some((dir) => file.startsWith(dir))) {
        return;
      }

      clearTimeout(timeout);
      timeout = setTimeout(run, 200);
    }
  };
}
