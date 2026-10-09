import {createRequire} from 'module';

const require = createRequire(import.meta.url);

/**
 * Keeps `src/lib/settingsSearch/generated.ts` in step with the settings tabs it
 * is derived from: generated when a build starts, and again whenever one of the
 * files it was built from changes — in the dev server or under
 * `vite build --watch`.
 */
export default function settingsSearchPlugin() {
  const GENERATOR = '../src/scripts/generate_settings_search.js';

  // Reloaded per run so editing the extractor itself takes effect without
  // restarting the dev server.
  const loadGenerator = () => {
    delete require.cache[require.resolve(GENERATOR)];
    return require(GENERATOR).generate;
  };

  // The files the last run built the index from (the generator lists them): the
  // tabs it followed, the strings, the link table, the extractor itself.
  let inputs = new Set();
  // `vite build --watch` starts a build on every edit, and parsing the tabs costs
  // most of a second: only an edit to one of the inputs makes it worth it.
  let stale = true;

  const run = () => {
    try {
      const {sections, entries, changed, inputs: read} = loadGenerator()();
      inputs = new Set(read);
      stale = false;
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
      if(stale) run();
      // a watched build hears only of the files it watches, and the link table and
      // the extractor are in no module graph
      inputs.forEach((file) => this.addWatchFile(file));
    },
    watchChange(file) {
      if(inputs.has(file)) stale = true;
    },
    handleHotUpdate({file}) {
      if(!inputs.has(file)) {
        return;
      }

      clearTimeout(timeout);
      timeout = setTimeout(run, 200);
    }
  };
}
