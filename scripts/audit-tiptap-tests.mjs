import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as babel from '@babel/core';
import {checkManifest} from './tiptap-audit/manifest.mjs';

// Inspect pinned upstream source without importing or executing its test code.
const root = process.argv[2];
if(!root) throw new Error('Usage: node scripts/audit-tiptap-tests.mjs UPSTREAM_CHECKOUT [--check MANIFEST]');
const git = (...args) => execFileSync('git', args, {cwd: root}).toString();
const paths = git('ls-files', '-z').split('\0').filter(Boolean);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = [];
const extra = [];
const unhandled = [];
const aliases = [];

function chain(node) {
  if(!node) return '';
  if(node.type === 'Identifier') return node.name;
  if(node.type === 'MemberExpression') return `${chain(node.object)}.${node.property.name || node.property.value}`;
  if(node.type === 'CallExpression') return `${chain(node.callee)}()`;
  return '';
}

function walk(node, parents, visit) {
  if(!node?.type) return;
  visit(node, parents);
  for(const [key, value] of Object.entries(node)) {
    if(['loc', 'tokens', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if(Array.isArray(value)) value.forEach((child) => walk(child, [...parents, node], visit));
    else if(value && typeof value === 'object') walk(value, [...parents, node], visit);
  }
}

for(const file of paths.filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file))) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const isTest = /\.(?:test|spec)\./.test(file);
  if(!isTest && !/\b(?:it|test|specify)\s*(?:\.|\()/.test(source)) continue;
  let ast;
  try {
    // v3.28.0 edgeDetection.spec.ts contains invalid TS `as const[]`.
    // A same-length parse-only repair preserves original hashes/line offsets.
    ast = babel.parseSync(source.replace(/as const\[\]/g, 'as any[]  '), {
      configFile: false,
      babelrc: false,
      parserOpts: {plugins: ['typescript', 'jsx'], sourceType: 'unambiguous'}
    });
  } catch(error) {
    if(isTest) throw error;
    continue;
  }
  const tests = [];
  const text = (node) => source.slice(node.start, node.end);
  for(const node of ast.program.body) {
    if(node.type !== 'ImportDeclaration' || !/(vitest|playwright|node:test)/.test(node.source.value)) continue;
    for(const specifier of node.specifiers) {
      if(['it', 'test', 'specify'].includes(specifier.imported?.name) && specifier.local.name !== specifier.imported.name) {
        aliases.push({file, local: specifier.local.name, imported: specifier.imported.name});
      }
    }
  }
  walk(ast, [], (node, parents) => {
    if(node.type !== 'CallExpression') return;
    const call = chain(node.callee);
    if(!/^(?:it|test|specify)(?:\.|$)/.test(call)) return;
    if(/^test\.(?:describe|step|beforeEach|afterEach|beforeAll|afterAll|extend|use)(?:\.|$)/.test(call)) return;
    if(/\.each$/.test(call)) return; // The outer each(table)(title, callback) is recorded below.
    const title = node.arguments[0];
    if(!title || !node.arguments.some((arg) => ['ArrowFunctionExpression', 'FunctionExpression'].includes(arg.type)) && !/\.todo$/.test(call)) {
      unhandled.push({file, line: node.loc.start.line, call, source: text(node)});
      return;
    }
    const suite = parents.filter((parent) => parent.type === 'CallExpression' &&
      /^(?:describe|test.describe|context)(?:\.|$)/.test(chain(parent.callee)))
    .map((parent) => parent.arguments[0] && text(parent.arguments[0]));
    const parameters = parents.filter((parent) => ['ForOfStatement', 'ForStatement'].includes(parent.type) ||
      parent.type === 'CallExpression' && /\.(?:forEach|each)$/.test(chain(parent.callee)))
    .map((parent) => parent.type === 'CallExpression' ? text(parent.callee) : text(parent).slice(0, text(parent).indexOf('{')));
    tests.push({
      line: node.loc.start.line,
      title: title.value ?? text(title),
      suite,
      call,
      parameters,
      ...(node.callee.type === 'CallExpression' ? {parameterCall: text(node.callee)} : {}),
      sha256: hash(text(node))
    });
  });
  if(isTest) files.push({file, sha256: hash(source), tests});
  else if(tests.length) extra.push({file, tests});
}

// Include imported fixture data/helpers/configuration, not just test declarations.
const support = paths.filter((file) => !/\.(?:test|spec)\./.test(file) &&
  (/(?:__tests__|demos\/test)\//.test(file) || /^(?:vitest|playwright)\.config\.ts$/.test(file)))
.map((file) => ({file, sha256: hash(fs.readFileSync(path.join(root, file)))}));
const inventory = {commit: git('rev-parse', 'HEAD').trim(), files, support, extra, unhandled, aliases};
if(process.argv[3] !== '--check') {
  console.log(JSON.stringify(inventory, null, 2));
} else {
  const manifest = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  console.log(JSON.stringify(checkManifest(inventory, manifest), null, 2));
}
