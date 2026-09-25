import fs from 'node:fs';

// A file hash pins all test bodies, titles and parameter tables. Store only
// review decisions here; the full declaration inventory is reproducible.
export function checkManifest(inventory, manifest, readFile = (file) => fs.readFileSync(file, 'utf8')) {
  if(manifest.version !== 2) throw new Error('Unsupported manifest version');
  if(manifest.commit !== inventory.commit) throw new Error('Upstream revision changed');
  if(inventory.extra.length || inventory.unhandled.length || inventory.aliases.length) {
    throw new Error('Unaccounted declarations/aliases: inspect inventory output');
  }
  const entries = new Map(manifest.files.map((entry) => [entry.file, entry]));
  if(entries.size !== manifest.files.length || entries.size !== inventory.files.length) {
    throw new Error('Test file inventory changed');
  }
  if(JSON.stringify(manifest.support) !== JSON.stringify(inventory.support)) {
    throw new Error('Upstream fixtures/helpers/configuration changed');
  }

  const localFiles = new Map();
  let checked = 0;
  const statuses = {};
  for(const file of inventory.files) {
    const entry = entries.get(file.file);
    if(!entry || entry.sha256 !== file.sha256) throw new Error(`Missing or changed file: ${file.file}`);
    if(entry.declarations !== file.tests.length) throw new Error(`Declaration count changed: ${file.file}`);
    const lines = new Set(file.tests.map((test) => test.line));
    const overrides = new Map();
    for(const [review, selectedLines] of Object.entries(entry.overrides || {})) {
      for(const line of selectedLines) {
        if(!lines.has(line) || overrides.has(line)) throw new Error(`Invalid review override: ${file.file}:${line}`);
        overrides.set(line, review);
      }
    }
    for(const test of file.tests) {
      const review = manifest.reviews[overrides.get(test.line) || entry.review];
      if(!review || !['local', 'different-contract', 'dependency', 'not-used', 'gap'].includes(review.status) || !review.reason || !review.evidence?.length) {
        throw new Error(`Unreviewed declaration: ${file.file}:${test.line}`);
      }
      for(const ref of review.evidence) {
        if(!localFiles.has(ref.file)) localFiles.set(ref.file, readFile(ref.file));
        const content = localFiles.get(ref.file);
        if(ref.test && !content.includes(ref.test)) throw new Error(`Missing local test: ${ref.test}`);
        if(ref.symbol && !content.includes(ref.symbol)) throw new Error(`Missing local symbol: ${ref.symbol}`);
      }
      statuses[review.status] = (statuses[review.status] || 0) + 1;
      ++checked;
    }
  }
  return {files: entries.size, declarations: checked, supportFiles: inventory.support.length, unaccounted: 0, statuses};
}
