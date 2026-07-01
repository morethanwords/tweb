#!/usr/bin/env node
/*
 * Lists tweb build snapshots — the git "Build" commits that update public/ —
 * newest first, as a paginated table. Each row carries a stable absolute index
 * (1 = newest) that serve-build.cjs accepts via --index, plus the app version
 * recorded in public/version at that commit.
 *
 *   node list-builds.cjs [--page N] [--size M] [--all] [--json]
 *
 *   --all    include every commit that touched public/ (icons, merges, …),
 *            not just the "Build" snapshots
 *   --json   emit machine-readable JSON instead of the table
 */

const {execFileSync} = require('child_process');
const path = require('path');

const SEP = '\x1f';

function parseArgs(argv) {
  const args = {page: 1, size: 15, all: false, json: false};
  for(let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if(a === '--page') args.page = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if(a === '--size') args.size = Math.max(1, parseInt(argv[++i], 10) || 15);
    else if(a === '--all') args.all = true;
    else if(a === '--json') args.json = true;
  }
  return args;
}

// All commits touching public/, newest first. Default keeps only "Build" snapshots.
function getBuilds(all) {
  const out = execFileSync('git', [
    'log',
    `--pretty=format:%H${SEP}%h${SEP}%ad${SEP}%s`,
    '--date=format:%Y-%m-%d %H:%M',
    '--', 'public'
  ], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

  const rows = out.split('\n').filter(Boolean).map((line) => {
    const [hash, short, date, subject] = line.split(SEP);
    return {hash, short, date, subject};
  });

  return all ? rows : rows.filter((r) => r.subject.trim() === 'Build');
}

function versionAt(sha) {
  try {
    return execFileSync('git', ['show', `${sha}:public/version`],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch(_e) {
    return '';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const builds = getBuilds(args.all);
  const total = builds.length;
  const pages = Math.max(1, Math.ceil(total / args.size));
  const page = Math.min(args.page, pages);
  const start = (page - 1) * args.size;
  const slice = builds.slice(start, start + args.size).map((b, i) => ({
    index: start + i + 1,
    version: versionAt(b.hash),
    ...b
  }));

  if(args.json) {
    process.stdout.write(JSON.stringify({total, page, pages, size: args.size, builds: slice}, null, 2) + '\n');
    return;
  }

  const here = path.relative(process.cwd(), __dirname) || '.';
  const label = args.all ? 'commits touching public/' : 'builds';
  console.log(`\n  ${total} ${label} — page ${page}/${pages} (showing ${start + 1}–${start + slice.length})\n`);

  const idxW = String(start + slice.length).length;
  const verW = Math.max(0, ...slice.map((b) => b.version.length));
  for(const b of slice) {
    const idx = String(b.index).padStart(idxW);
    const ver = b.version.padEnd(verW);
    console.log(`  ${idx}.  ${b.date}   ${b.short}   ${ver}   ${b.subject}`);
  }
  console.log('');
  if(page < pages) console.log(`  → more:   node ${here}/list-builds.cjs --page ${page + 1}${args.all ? ' --all' : ''}`);
  console.log(`  → launch: node ${here}/serve-build.cjs --index <n>    (or pass a commit sha)\n`);
}

if(require.main === module) main();

module.exports = {getBuilds, versionAt};
