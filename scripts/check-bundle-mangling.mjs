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
 *    check how that same variable is spelled in the rest of the function holding
 *    the default. A spelling of its own in the default is the signature. When
 *    nothing else there mentions it, a name bound right next to the default (an
 *    earlier parameter, a sibling in the same destructuring) has to stand for that
 *    variable in the source; otherwise the functions further out decide, and last
 *    the whole chunk. The search stays that close because one name in two
 *    functions is two variables, which the minifier spells independently.
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

// * the segments of a source map that point into a source, in emitted order; nameIdx is undefined
// * for a segment without a name
function* decodeMappings(mappings) {
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
        if(fields.length > 4) nameIdx += fields[4];
        yield {genLine, genCol, srcIdx, srcLine, srcCol, nameIdx: fields.length > 4 ? nameIdx : undefined};
      }
    }

    ++genLine;
  }
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

// * the identifier a reference spells from `offset` of `text` on, if one starts there
function readIdentifierAt(text, offset) {
  if(!IDENTIFIER_CHAR.test(text[offset] || '')) return;
  if(offset > 0 && text[offset - 1] === '.') return; // * a property, not a reference
  let end = offset;
  while(end < text.length && IDENTIFIER_CHAR.test(text[end])) ++end;
  const token = text.slice(offset, end);
  return /^[0-9]/.test(token) ? undefined : token;
}

function getLineStarts(text) {
  const lineStarts = [0];
  for(let i = 0; i < text.length; ++i) {
    if(text[i] === '\n') lineStarts.push(i + 1);
  }

  return lineStarts;
}

const SKIPPED_KEYS = new Set(['start', 'end', 'loc', 'range', 'parent']);
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function forEachChild(node, callback) {
  for(const key in node) {
    if(SKIPPED_KEYS.has(key)) continue;
    const value = node[key];
    if(Array.isArray(value)) value.forEach(callback);
    else callback(value);
  }
}

// * every identifier a pattern binds, with the property it was destructured from (`{caption: t}`)
function forEachBinding(node, callback, key) {
  if(!node) return;

  switch(node.type) {
    case 'Identifier':
      callback(node, key);
      return;
    case 'AssignmentPattern':
      forEachBinding(node.left, callback, key);
      return;
    case 'RestElement':
      forEachBinding(node.argument, callback);
      return;
    case 'ArrayPattern':
      node.elements.forEach((element) => forEachBinding(element, callback));
      return;
    case 'ObjectPattern':
      for(const property of node.properties) {
        if(property.type === 'RestElement') forEachBinding(property, callback);
        else forEachBinding(property.value, callback, !property.computed && property.key.type === 'Identifier' ? property.key.name : undefined);
      }
      return;
  }
}

// * what a function declares for itself: its name, parameters and variables
function collectOwnNames(fn) {
  const out = new Set();
  const add = (identifier) => out.add(identifier.name);
  if(fn.id) add(fn.id);
  fn.params.forEach((param) => forEachBinding(param, add));
  const visit = (node) => {
    if(!node || typeof node.type !== 'string') return;
    if(node.type === 'VariableDeclarator') forEachBinding(node.id, add);
    else if(node.type === 'FunctionDeclaration' && node.id) add(node.id);
    else if(node.type === 'CatchClause') forEachBinding(node.param, add);
    forEachChild(node, visit);
  };

  visit(fn.body);
  return out;
}

// * the names a parameter list or a destructuring binds, by name
function collectSiblings(patterns) {
  const out = new Map();
  patterns.forEach((pattern) => forEachBinding(pattern, (identifier, key) => out.set(identifier.name, {identifier, key})));
  return out;
}

function collectReferences(node, out, own = new Set()) {
  if(!node || typeof node.type !== 'string') return;

  switch(node.type) {
    case 'Identifier':
      if(!own.has(node.name)) out.push(node);
      return;
    case 'MemberExpression':
      collectReferences(node.object, out, own);
      if(node.computed) collectReferences(node.property, out, own);
      return;
    case 'Property':
      if(node.computed) collectReferences(node.key, out, own);
      collectReferences(node.value, out, own);
      return;
  }

  // * a function written inside the default (`items.map((item) => …)`) reads its own names
  // * from itself, not from around the default
  if(FUNCTION_TYPES.has(node.type)) {
    own = new Set([...own, ...collectOwnNames(node)]);
  }

  forEachChild(node, (child) => collectReferences(child, out, own));
}

// * every read inside a scope the minifier resolves separately from the surrounding function body —
// * with the node holding it, the functions around it (innermost first) and the names bound next to
// * it — and every function in source order, with the function it sits in
function analyze(ast) {
  const reads = [];
  const functions = [];
  const parents = new Map();
  const stack = [];
  const visit = (node, siblings) => {
    if(!node || typeof node.type !== 'string') return;

    const value = node.type === 'AssignmentPattern' ? node.right :
      node.type === 'PropertyDefinition' ? node.value :
      node.type === 'StaticBlock' ? node :
      undefined;
    if(value) {
      const references = [];
      collectReferences(value, references);
      const scopes = stack.toReversed();
      for(const reference of references) reads.push({reference, holder: node, value, scopes, siblings});
    }

    if(FUNCTION_TYPES.has(node.type)) {
      parents.set(node, stack.at(-1));
      functions.push(node);
      stack.push(node);
      const params = collectSiblings(node.params);
      node.params.forEach((param) => visit(param, params));
      visit(node.body);
      stack.pop();
    } else if(node.type === 'VariableDeclarator') {
      visit(node.id, collectSiblings([node.id]));
      visit(node.init);
    } else {
      forEachChild(node, (child) => visit(child, node.type === 'ClassBody' ? undefined : siblings));
    }
  };

  visit(ast);
  return {reads, functions, parents};
}

const dominant = (counts) => [...counts].sort((a, b) => b[1] - a[1])[0];

function checkChunk(dir, file) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const map = JSON.parse(fs.readFileSync(path.join(dir, file + '.map'), 'utf8'));
  const lineStarts = getLineStarts(code);
  const {reads, functions, parents} = analyze(parseAst(code));

  // * the bindings next to a default, whose source name a mapping without a name may have to tell
  const siblingOffsets = new Set();
  for(const {siblings} of reads) siblings?.forEach(({identifier}) => siblingOffsets.add(identifier.start));

  // * emitted offset -> the source variable a mangled token came from
  const named = new Map();
  // * emitted offset -> where in the source a binding next to a default came from
  const siblingSegments = new Map();
  // * source|name -> where it is spelled how: [{offset, token}], in emitted order
  const occurrences = new Map();
  for(const segment of decodeMappings(map.mappings)) {
    const offset = lineStarts[segment.genLine - 1] + segment.genCol;
    if(siblingOffsets.has(offset)) siblingSegments.set(offset, segment);
    const name = map.names[segment.nameIdx];
    const source = map.sources[segment.srcIdx];
    if(!name || source === undefined) continue;
    const token = readIdentifierAt(code, offset);
    if(!token || token === name) continue; // * not mangled: a property or a preserved name
    named.set(offset, {source, name, line: segment.srcLine + 1});
    const key = source + '|' + name;
    let list = occurrences.get(key);
    if(!list) occurrences.set(key, list = []);
    list.push({offset, token});
  }

  // * the source variable an emitted binding stands for: its name in the map, or else the
  // * identifier at the source position it maps to
  const sourceLineStarts = new Map();
  const sourceNameAt = (offset) => {
    if(named.has(offset)) return named.get(offset).name;
    const segment = siblingSegments.get(offset);
    const content = segment && map.sourcesContent?.[segment.srcIdx];
    if(!content) return;
    let starts = sourceLineStarts.get(segment.srcIdx);
    if(!starts) sourceLineStarts.set(segment.srcIdx, starts = getLineStarts(content));
    return readIdentifierAt(content, starts[segment.srcLine] + segment.srcCol);
  };

  // * the innermost function an offset sits in
  const functionAt = (offset) => {
    let low = 0, high = functions.length - 1, found;
    while(low <= high) {
      const mid = (low + high) >> 1;
      if(functions[mid].start <= offset) {
        found = functions[mid];
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    while(found && offset >= found.end) found = parents.get(found);
    return found;
  };

  // * a token that a function between it and `scope` binds for itself is that function's own
  // * variable (`(item) => item.id` under a parameter also called item), not the one in `scope`
  const ownNames = new Map();
  const isShadowed = (offset, token, scope) => {
    for(let fn = functionAt(offset); fn && fn !== scope; fn = parents.get(fn)) {
      let names = ownNames.get(fn);
      if(!names) ownNames.set(fn, names = collectOwnNames(fn));
      if(names.has(token)) return true;
    }

    return false;
  };

  // * how a variable is spelled within `range` outside the default: spelling -> count
  const spellingsWithin = (key, range, value, exact) => {
    const counts = new Map();
    for(const {offset, token} of occurrences.get(key)) {
      if(offset < range.start || offset >= range.end || (offset >= value.start && offset < value.end)) continue;
      if(exact && isShadowed(offset, token, range)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    return counts;
  };

  // * the commonest spelling of a variable in the innermost of the scopes that mentions it
  const spellingAround = (key, reference, value, scopes) => {
    for(const scope of scopes) {
      const counts = spellingsWithin(key, scope, value);
      if(!counts.size) continue;
      if(dominant(counts)[0] === reference.name) return dominant(counts);
      // * before calling it a mismatch, leave out what nested functions bind for themselves
      const exact = spellingsWithin(key, scope, value, true);
      if(exact.size) return dominant(exact);
    }
  };

  // * how a default spells a variable against how the code around it does — undefined when they agree
  const disagreement = ({reference, holder, value, scopes, siblings}, mapped) => {
    const key = mapped.source + '|' + mapped.name;
    const [innermost, ...outer] = scopes;

    // * the rest of the function holding the default
    const inFunction = innermost && spellingAround(key, reference, value, [innermost]);
    if(inFunction) {
      return inFunction[0] !== reference.name ? `'${inFunction[0]}' ${inFunction[1]} time(s) in the same function` : undefined;
    }

    // * a name bound right next to the default must stand for that variable in the source — by the
    // * map, or else by the property it was destructured from; with neither, it has to be bound
    // * before the default, as only those are set by the time it runs
    const sibling = siblings?.get(reference.name);
    if(sibling) {
      const bound = sourceNameAt(sibling.identifier.start) ?? sibling.key;
      if(bound !== undefined ? bound === mapped.name : sibling.identifier.start < holder.start) return;
      return bound !== undefined ? `'${reference.name}' is bound next to it as '${bound}'` : `'${reference.name}' is bound only after it`;
    }

    // * the functions further out, then the chunk
    const around = spellingAround(key, reference, value, outer);
    if(around) {
      return around[0] !== reference.name ? `'${around[0]}' ${around[1]} time(s) in an enclosing function` : undefined;
    }

    const [chunkWide, count] = dominant(spellingsWithin(key, {start: 0, end: code.length}, value)) ?? [];
    return chunkWide !== undefined && chunkWide !== reference.name && count >= 5 ? `'${chunkWide}' in ${count} other places` : undefined;
  };

  const offenders = [];
  for(const read of reads) {
    const mapped = named.get(read.reference.start);
    if(!mapped || mapped.name === read.reference.name) continue;

    const where = disagreement(read, mapped);
    if(!where) continue;

    offenders.push(
      `${file}: '${mapped.name}' (${mapped.source}:${mapped.line}) is '${read.reference.name}' in a default ` +
      `value but ${where} — resolve the default in the body instead`
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
