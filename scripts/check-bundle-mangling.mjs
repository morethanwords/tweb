#!/usr/bin/env node
/**
 * Post-build guard for miscompilations only the production bundle can have. Both
 * of the classes it covers have already shipped and were found by hand.
 *
 * 1. The minifier binds an identifier read from a DEFAULT VALUE — a parameter
 *    default, a destructuring default, a class field initializer — to the wrong
 *    symbol, while the surrounding function body keeps the correct name. The
 *    emitted code then reads a property off an unrelated module-level binding,
 *    usually `undefined`. `getNearestStory(next, loop, offsetIndex = state.index)`
 *    in src/components/stories/store.tsx came out as `(e, t, n = ep.index, ...)`,
 *    where `ep` is clientPip's module-level `state`, and opening a story threw
 *    "Cannot read properties of undefined (reading 'index')".
 *
 *    Detection needs no knowledge of the trigger: for every identifier sitting in
 *    such a default, ask the source map which source variable it came from, then
 *    check how that same variable is spelled everywhere else in the chunk. One
 *    dominant spelling plus a stray one in the default is the signature.
 *
 * 2. A lone surrogate in a folded string constant gets re-encoded as U+FFFD,
 *    which is what silently killed every astral emoji in the worker chunk. Any
 *    replacement character in a chunk means some literal lost its content — we
 *    author none of them, so the count must stay zero.
 *
 * Usage: node scripts/check-bundle-mangling.mjs [dist]
 */

import fs from 'fs';
import path from 'path';
import {parseAst} from 'vite';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((char, index) => [char, index]));

function decodeMappings(mappings) {
  const out = [];
  let genLine = 1, srcIdx = 0, srcLine = 0, srcCol = 0, nameIdx = 0;
  for(const lineSegments of mappings.split(';')) {
    let genCol = 0;
    for(const segment of lineSegments ? lineSegments.split(',') : []) {
      if(!segment) continue;
      const fields = [];
      let value = 0, shift = 0;
      for(const char of segment) {
        const digit = B64_INDEX.get(char);
        if(digit === undefined) break;
        value += (digit & 31) << shift;
        if(digit & 32) {
          shift += 5;
          continue;
        }
        fields.push((value & 1) ? -(value >> 1) : (value >> 1));
        value = shift = 0;
      }

      genCol += fields[0];
      if(fields.length > 3) {
        srcIdx += fields[1];
        srcLine += fields[2];
        srcCol += fields[3];
      }

      if(fields.length > 4) {
        nameIdx += fields[4];
        out.push({genLine, genCol, srcIdx, srcLine, srcCol, nameIdx});
      }
    }

    ++genLine;
  }

  return out;
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

function readIdentifierAt(line, column) {
  if(line === undefined || !IDENTIFIER_CHAR.test(line[column] || '')) return;
  if(column > 0 && line[column - 1] === '.') return; // * a property, not a reference
  let end = column;
  while(end < line.length && IDENTIFIER_CHAR.test(line[end])) ++end;
  const token = line.slice(column, end);
  return /^[0-9]/.test(token) ? undefined : token;
}

const SKIPPED_KEYS = new Set(['start', 'end', 'loc', 'range', 'parent']);

function collectReferences(node, out) {
  if(!node || typeof node.type !== 'string') return;

  switch(node.type) {
    case 'Identifier':
      out.push(node);
      return;
    case 'MemberExpression':
      collectReferences(node.object, out);
      if(node.computed) collectReferences(node.property, out);
      return;
    case 'Property':
      if(node.computed) collectReferences(node.key, out);
      collectReferences(node.value, out);
      return;
  }

  for(const key in node) {
    if(SKIPPED_KEYS.has(key)) continue;
    const value = node[key];
    if(Array.isArray(value)) value.forEach((child) => collectReferences(child, out));
    else collectReferences(value, out);
  }
}

function collectDefaultScopes(ast) {
  const out = [];
  const visit = (node) => {
    if(!node || typeof node.type !== 'string') return;

    // * every scope the minifier resolves separately from the surrounding function body
    if(node.type === 'AssignmentPattern') collectReferences(node.right, out);
    else if(node.type === 'PropertyDefinition' && node.value) collectReferences(node.value, out);
    else if(node.type === 'StaticBlock') collectReferences(node, out);

    for(const key in node) {
      if(SKIPPED_KEYS.has(key)) continue;
      const value = node[key];
      if(Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };

  visit(ast);
  return out;
}

function makeOffsetToPosition(code) {
  const lineStarts = [0];
  for(let i = 0; i < code.length; ++i) {
    if(code[i] === '\n') lineStarts.push(i + 1);
  }

  return (offset) => {
    let low = 0, high = lineStarts.length - 1;
    while(low < high) {
      const mid = (low + high + 1) >> 1;
      if(lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }

    return {line: low + 1, column: offset - lineStarts[low]};
  };
}

function checkChunk(dir, file) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = code.split('\n');
  const map = JSON.parse(fs.readFileSync(path.join(dir, file + '.map'), 'utf8'));

  // * how every source variable is spelled in this chunk: source|name -> spelling -> count
  const spellings = new Map();
  // * genLine:genCol -> the source variable one emitted token came from
  const byPosition = new Map();
  for(const mapping of decodeMappings(map.mappings)) {
    const name = map.names[mapping.nameIdx];
    const source = map.sources[mapping.srcIdx];
    if(!name || source === undefined) continue;
    const token = readIdentifierAt(lines[mapping.genLine - 1], mapping.genCol);
    if(!token || token === name) continue; // * not mangled: a property or a preserved name
    byPosition.set(mapping.genLine + ':' + mapping.genCol, {source, name, line: mapping.srcLine + 1});
    const key = source + '|' + name;
    let counts = spellings.get(key);
    if(!counts) spellings.set(key, counts = new Map());
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const toPosition = makeOffsetToPosition(code);
  const offenders = [];
  for(const reference of collectDefaultScopes(parseAst(code))) {
    const {line, column} = toPosition(reference.start);
    const mapped = byPosition.get(line + ':' + column);
    if(!mapped || mapped.name === reference.name) continue;

    const counts = [...spellings.get(mapped.source + '|' + mapped.name)].sort((a, b) => b[1] - a[1]);
    const [dominant, dominantCount] = counts[0];
    if(dominant === reference.name || dominantCount < 5) continue;

    offenders.push(
      `${file}: '${mapped.name}' (${mapped.source}:${mapped.line}) is '${reference.name}' in a default ` +
      `value but '${dominant}' in ${dominantCount} other places — resolve the default in the body instead`
    );
  }

  const replacementCharacters = (code.match(/�/g) || []).length;
  if(replacementCharacters) {
    offenders.push(
      `${file}: ${replacementCharacters} U+FFFD — a string literal lost content, most likely a lone ` +
      'surrogate re-encoded as UTF-8; keep the literal pure ASCII'
    );
  }

  return offenders;
}

const dir = process.argv[2] || 'dist';
const files = fs.readdirSync(dir)
.filter((file) => file.endsWith('.js') && fs.existsSync(path.join(dir, file + '.map')));

const offenders = files.flatMap((file) => checkChunk(dir, file));
if(offenders.length) {
  console.error(
    `\nThe production bundle is miscompiled in ${offenders.length} place(s):\n` +
    offenders.map((offender) => '  ' + offender).join('\n') + '\n'
  );
  process.exit(1);
}

console.log(`checked ${files.length} chunks, no miscompiled defaults and no lost string literals`);
