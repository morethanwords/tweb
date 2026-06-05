// @ts-check
/*
 * Offline symbolication for logs exported by the in-app log buffer
 * (@lib/debug/exportLogs -> window.downloadLogs()).
 *
 * Takes the NDJSON dump + the dist/ folder of the EXACT build that produced it
 * (match `version`/`versionFull` from the meta line against the deploy), and
 * rewrites every captured stack frame from minified `file.js:line:col` to the
 * original `src/…:line:col` using the .map files Vite emits (build.sourcemap is
 * on). Dependency-free: a small VLQ source-map decoder is inlined below.
 *
 * Usage:
 *   node src/scripts/symbolicate-logs.js <logs.ndjson> [distDir=dist]
 *   node src/scripts/symbolicate-logs.js logs.ndjson dist > logs.symbolicated.txt
 */

const fs = require('fs');
const path = require('path');

const [, , logsPath, distDirArg] = process.argv;
if(!logsPath) {
  console.error('usage: node src/scripts/symbolicate-logs.js <logs.ndjson> [distDir=dist]');
  process.exit(1);
}
const distDir = distDirArg || 'dist';

const LEVELS = {1: 'ERROR', 2: 'WARN', 4: 'LOG', 8: 'DEBUG'};
const levelName = (l) => LEVELS[l] || String(l);

// ---- VLQ base64 source-map decoder -----------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHAR_TO_INT = {};
for(let i = 0; i < B64.length; ++i) CHAR_TO_INT[B64[i]] = i;

// Decode one comma-separated segment string into its delta integers. Uses float
// math (not <<) so columns wider than 31 bits in big minified lines are safe.
function decodeVLQs(segment) {
  const result = [];
  let shift = 0;
  let value = 0;
  for(const c of segment) {
    const integer = CHAR_TO_INT[c];
    if(integer === undefined) throw new Error('invalid VLQ char: ' + c);
    const hasContinuation = integer & 32;
    value += (integer & 31) * Math.pow(2, shift);
    if(hasContinuation) {
      shift += 5;
    } else {
      const negate = value % 2 === 1;
      value = Math.floor(value / 2);
      result.push(negate ? (value === 0 ? -0x7fffffff : -value) : value);
      value = 0;
      shift = 0;
    }
  }
  return result;
}

// Parse a raw source map into per-generated-line mapping arrays (sorted by
// generated column, which the delta encoding already guarantees).
function parseSourceMap(raw) {
  const map = JSON.parse(raw);
  const sources = (map.sources || []).map((s) => {
    if(map.sourceRoot && !/^(\.|\/|[a-z]+:)/i.test(s)) return map.sourceRoot.replace(/\/?$/, '/') + s;
    return s;
  });
  const names = map.names || [];

  const lines = [];
  let srcIdx = 0;
  let origLine = 0;
  let origCol = 0;
  let nameIdx = 0;

  (map.mappings || '').split(';').forEach((lineStr) => {
    const segments = [];
    let genCol = 0;
    if(lineStr) {
      for(const segStr of lineStr.split(',')) {
        if(!segStr) continue;
        const f = decodeVLQs(segStr);
        genCol += f[0];
        const seg = {genCol};
        if(f.length >= 4) {
          srcIdx += f[1];
          origLine += f[2];
          origCol += f[3];
          seg.srcIdx = srcIdx;
          seg.origLine = origLine;
          seg.origCol = origCol;
          if(f.length >= 5) {
            nameIdx += f[4];
            seg.nameIdx = nameIdx;
          }
        }
        segments.push(seg);
      }
    }
    lines.push(segments);
  });

  return {sources, names, lines};
}

// Greatest generated column <= target on the given generated line.
function originalPositionFor(parsed, genLine /* 1-based */, genCol /* 1-based */) {
  const segments = parsed.lines[genLine - 1];
  if(!segments || !segments.length) return null;
  const col0 = genCol - 1;
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while(lo <= hi) {
    const mid = (lo + hi) >> 1;
    if(segments[mid].genCol <= col0) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if(found < 0) return null;
  const seg = segments[found];
  if(seg.srcIdx === undefined) return null;
  return {
    source: parsed.sources[seg.srcIdx],
    line: seg.origLine + 1,
    column: seg.origCol + 1,
    name: seg.nameIdx !== undefined ? parsed.names[seg.nameIdx] : undefined
  };
}

// ---- map discovery (basename -> parsed map, cached) -------------------------

const mapPathByBasename = new Map();
(function indexMaps(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch(err) {
    return;
  }
  for(const e of entries) {
    const full = path.join(dir, e.name);
    if(e.isDirectory()) indexMaps(full);
    else if(e.name.endsWith('.js.map')) mapPathByBasename.set(e.name.slice(0, -4), full); // key: foo.js
  }
})(distDir);

const parsedCache = new Map();
function getMap(jsBasename) {
  if(parsedCache.has(jsBasename)) return parsedCache.get(jsBasename);
  const mapPath = mapPathByBasename.get(jsBasename);
  let parsed = null;
  if(mapPath) {
    try {
      parsed = parseSourceMap(fs.readFileSync(mapPath, 'utf8'));
    } catch(err) {
      console.error(`[warn] failed to parse ${mapPath}: ${err.message}`);
    }
  }
  parsedCache.set(jsBasename, parsed);
  return parsed;
}

// Rewrite the last file:line:col occurrence in a stack line.
const FRAME_RE = /([^\s()@/\\]+\.m?js):(\d+):(\d+)/g;
function symbolicateLine(line) {
  let last = null;
  let m;
  FRAME_RE.lastIndex = 0;
  while((m = FRAME_RE.exec(line))) last = m;
  if(!last) return line;

  const [, jsBasename, lineNo, colNo] = last;
  const parsed = getMap(jsBasename);
  if(!parsed) return line;

  const pos = originalPositionFor(parsed, +lineNo, +colNo);
  if(!pos) return line;

  const orig = `${pos.source}:${pos.line}:${pos.column}${pos.name ? ` (${pos.name})` : ''}`;
  return `${line.trimEnd()}   ->   ${orig}`;
}

function symbolicateStack(stack) {
  return stack.split('\n').map(symbolicateLine).join('\n');
}

// ---- run --------------------------------------------------------------------

const raw = fs.readFileSync(logsPath, 'utf8');
const out = [];
let resolvedFrames = 0;
let totalStacks = 0;

for(const rawLine of raw.split('\n')) {
  const line = rawLine.trim();
  if(!line) continue;

  let entry;
  try {
    entry = JSON.parse(line);
  } catch(err) {
    continue;
  }

  if(entry.__meta) {
    out.push(`# tweb logs — version ${entry.version} (${entry.versionFull}) mode=${entry.mode}`);
    out.push(`# exported ${entry.exportedAt} — ${entry.count} entries — ${entry.ua}`);
    out.push(`# dist: ${distDir} (${mapPathByBasename.size} source maps found)`);
    out.push('');
    continue;
  }

  const ts = new Date(entry.t).toISOString();
  const args = (entry.args || []).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  out.push(`[${ts}] ${(entry.src || '?').padEnd(7)} ${levelName(entry.level).padEnd(5)} ${entry.prefix || ''} ${args}`.trimEnd());

  if(entry.stack) {
    totalStacks++;
    const symbolicated = symbolicateStack(entry.stack);
    if(symbolicated.includes('   ->   ')) resolvedFrames++;
    out.push(symbolicated.replace(/^/gm, '    '));
  }
}

process.stdout.write(out.join('\n') + '\n');
console.error(`\nsymbolicated ${resolvedFrames}/${totalStacks} stacks (maps in ${distDir}: ${mapPathByBasename.size})`);
