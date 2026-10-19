/**
 * Dev only: rewrites an app module as the dev server serves it so that a hot update — which runs the module again —
 * keeps what live code holds of its previous evaluation, without the module asking for it (src/helpers/hotRegistry.ts
 * does the keeping). Called by scripts/hot-reload-plugin.mjs on the code the other plugins made of the module; what
 * the module declares is read off its source, so that what a compiler adds (Solid's templates, solid-refresh's
 * component wrappers, an enum's object) is told from what the author wrote.
 *
 * - a top-level `const` whose value is state — anything but literal data and functions, or data the module mutates —
 *   is made once per page: `const x = keepValue(url, 'x', () => (init), '<hash of its code>', () => [what it reads])`;
 * - a top-level `let` that a function reads or writes becomes such a value too, a cell (`{v}`) every use goes through;
 * - every top-level class is registered after the module has run (keepClasses), with the module's functions the
 *   classes hold as values or build their instances with;
 * - its exported functions are registered by the code they reach (keepFunctions), for another module that holds one;
 * - a module that accepts its own updates registers its exports (keepExports).
 *
 * Every edit stays on the line it is on and the calls go at the end, so the source map of the code it gets still holds.
 */
import {parseSync} from 'vite';
import MagicString from 'magic-string';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const REGISTRY = '/src/helpers/hotRegistry.ts';
const FN = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);
const TS_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion',
  'TSInstantiationExpression', 'ParenthesizedExpression']);
// what changes the object it is called on
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set',
  'add', 'delete', 'clear']);
// nodes of a type annotation: erased, no reference of theirs is real
const TYPE_KEYS = new Set(['typeAnnotation', 'returnType', 'typeParameters', 'typeArguments', 'superTypeParameters',
  'superTypeArguments', 'implements', 'decorators']);

const unwrap = (node) => {
  while(node && TS_WRAPPERS.has(node.type)) node = node.expression;
  return node;
};

function walk(node, enter, parent, key) {
  if(!node || typeof(node.type) !== 'string') return;
  if(enter(node, parent, key) === false) return;
  for(const k in node) {
    if(k === 'parent' || TYPE_KEYS.has(k)) continue;
    const value = node[k];
    if(Array.isArray(value)) {
      for(const child of value) if(child && typeof(child.type) === 'string') walk(child, enter, node, k);
    } else if(value && typeof(value.type) === 'string') {
      walk(value, enter, node, k);
    }
  }
}

// oxc's parser, the fast way: an ESTree program with UTF-16 offsets
function parse(code, lang) {
  const {program, errors} = parseSync('module.' + lang, code);
  if(errors.length) throw new Error(errors[0].message);
  return program;
}

const hash = (text) => createHash('sha1').update(text).digest('base64url').slice(0, 16);

// the names a pattern declares
function patternNames(node, out = []) {
  node = unwrap(node);
  if(!node) return out;
  switch(node.type) {
    case 'Identifier': out.push(node.name); break;
    case 'ObjectPattern': node.properties.forEach((p) => patternNames(p.type === 'RestElement' ? p.argument : p.value, out)); break;
    case 'ArrayPattern': node.elements.forEach((e) => e && patternNames(e, out)); break;
    case 'RestElement': patternNames(node.argument, out); break;
    case 'AssignmentPattern': patternNames(node.left, out); break;
  }
  return out;
}

// whether a node is a name read, not a key, a property name, a label or a declaration's own name
function isReference(node, parent, key) {
  if(!parent) return true;
  switch(parent.type) {
    case 'MemberExpression': return key !== 'property' || parent.computed;
    case 'Property': return key === 'value' || parent.computed;
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'AccessorProperty': return key !== 'key' || parent.computed;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement': return false;
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier': return false;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression': return key !== 'id';
  }
  return true;
}

/** The top-level names a node reads (shadowing ignored: a name too many only adds to what is compared) */
function referencedNames(node, names, out = new Set()) {
  walk(node, (n, parent, key) => {
    if((n.type === 'Identifier' || n.type === 'JSXIdentifier') && names.has(n.name) && isReference(n, parent, key)) out.add(n.name);
  });
  return out;
}

// literal data and functions: what each evaluation makes again with no loss
function isCode(node) {
  node = unwrap(node);
  if(!node) return true;
  switch(node.type) {
    case 'Literal': return true;
    case 'TemplateLiteral': return node.expressions.every(isCode);
    case 'ArrayExpression': return node.elements.every((e) => !e || (e.type !== 'SpreadElement' && isCode(e)));
    case 'ObjectExpression': return node.properties.every((p) => p.type === 'Property' && !p.computed && isCode(p.value));
    case 'UnaryExpression': return node.operator !== 'delete' && isCode(node.argument);
    case 'BinaryExpression':
    case 'LogicalExpression': return isCode(node.left) && isCode(node.right);
    case 'ConditionalExpression': return isCode(node.test) && isCode(node.consequent) && isCode(node.alternate);
    case 'ArrowFunctionExpression':
    case 'FunctionExpression': return true;
    case 'Identifier': return node.name === 'undefined';
    default: return false;
  }
}

// a name, or a property read off one, with no call on the way
function isAlias(node) {
  node = unwrap(node);
  while(node?.type === 'MemberExpression') {
    if(node.computed && unwrap(node.property).type !== 'Literal') return false;
    node = unwrap(node.object);
  }
  return node?.type === 'Identifier' && node.name !== 'undefined';
}

const isEmptyContainer = (node) => {
  node = unwrap(node);
  return (node.type === 'ArrayExpression' && !node.elements.length) || (node.type === 'ObjectExpression' && !node.properties.length);
};

function containsAwait(node) {
  let found = false;
  walk(node, (n) => {
    if(found || FN.has(n.type)) return false;
    if(n.type === 'AwaitExpression' || n.type === 'YieldExpression') found = true;
  });
  return found;
}

// the name at the root of `a.b.c` / `a[b].c`
function rootName(node) {
  node = unwrap(node);
  while(node && (node.type === 'MemberExpression' || TS_WRAPPERS.has(node.type))) node = unwrap(node.object ?? node.expression);
  return node?.type === 'Identifier' ? node.name : undefined;
}

/** The top-level names whose object or array the module changes: it is state, not a table */
function mutatedNames(ast) {
  const out = new Set();
  walk(ast, (n) => {
    if(n.type === 'AssignmentExpression' && unwrap(n.left).type === 'MemberExpression') out.add(rootName(n.left));
    else if(n.type === 'UpdateExpression' && unwrap(n.argument).type === 'MemberExpression') out.add(rootName(n.argument));
    else if(n.type === 'UnaryExpression' && n.operator === 'delete') out.add(rootName(n.argument));
    else if(n.type === 'CallExpression') {
      const callee = unwrap(n.callee);
      if(callee.type === 'MemberExpression' && !callee.computed && MUTATORS.has(callee.property.name)) out.add(rootName(callee.object));
      else out.add(rootName(changedArgument(n)));
    }
  });
  out.delete(undefined);
  return out;
}

// what a call changes that is not its receiver: `Object.assign(target, ...)` and the like
function changedArgument(call) {
  const callee = unwrap(call.callee);
  if(callee.type !== 'MemberExpression' || callee.computed || unwrap(callee.object).type !== 'Identifier') return;
  const changes = {
    Object: /^(assign|defineProperty|defineProperties|setPrototypeOf)$/,
    Reflect: /^(set|defineProperty|deleteProperty|setPrototypeOf)$/
  }[unwrap(callee.object).name];
  return changes?.test(callee.property.name) ? call.arguments[0] : undefined;
}

const slice = (source, node) => source.slice(node.start, node.end);

// the name the served code gives a default export that is a function with none (`export default function() {}`)
const ANONYMOUS_DEFAULT = '__hotDefault';

// defineSolidElement swaps the component into the element class it registered first (swapComponentFromHMR)
const SELF_UPDATING = /(^|\/)solidjs\/defineSolidElement(\.tsx?)?$/;

// what every evaluation shares or that patches itself: no dependency to compare
const STABLE_KINDS = new Set(['state', 'let', 'class', 'component', 'namespace']);

/**
 * What the module declares at its top level, from its source: each name's kind —
 * import, fn (a function, code), class, state (kept), table (data made again), let (kept as a cell when a function uses
 * it) — and the nodes to read references off.
 */
function analyzeSource(source, lang) {
  const ast = parse(source, lang);
  const bindings = new Map();
  const exportedLocals = new Set();
  const set = (name, info) => bindings.set(name, info);
  for(const statement of ast.body) {
    if(statement.type === 'ImportDeclaration') {
      if(statement.importKind === 'type') continue;
      for(const specifier of statement.specifiers) {
        if(specifier.importKind !== 'type') set(specifier.local.name, {kind: 'import', source: statement.source.value});
      }
      continue;
    }

    let declaration = statement;
    if(statement.type === 'ExportNamedDeclaration') {
      if(statement.exportKind === 'type') continue;
      if(!statement.declaration) {
        if(!statement.source) statement.specifiers.forEach((s) => s.exportKind !== 'type' && exportedLocals.add(s.local.name));
        continue;
      }
      declaration = statement.declaration;
      patternNamesOfDeclaration(declaration).forEach((name) => exportedLocals.add(name));
    } else if(statement.type === 'ExportDefaultDeclaration') {
      declaration = statement.declaration;
      if(declaration.type === 'Identifier') {
        exportedLocals.add(declaration.name);
        continue;
      }
      if(declaration.id) exportedLocals.add(declaration.id.name);
      else if(FN.has(declaration.type)) {
        // a function with no name of its own: the served code names it (anonymousDefault)
        set(ANONYMOUS_DEFAULT, {kind: 'fn', node: declaration});
        exportedLocals.add(ANONYMOUS_DEFAULT);
        continue;
      } else if(!FN.has(declaration.type) && !/Class/.test(declaration.type) && !isCode(declaration) && !containsAwait(declaration)) {
        set('default', {kind: 'state', node: declaration, init: declaration, isDefault: true});
        continue;
      }
    }

    if(declaration.declare) continue;
    switch(declaration.type) {
      case 'FunctionDeclaration':
        if(declaration.id) set(declaration.id.name, {kind: 'fn', node: declaration});
        break;
      case 'ClassDeclaration':
        if(declaration.id) set(declaration.id.name, {kind: 'class', node: declaration});
        break;
      case 'TSEnumDeclaration':
        set(declaration.id.name, {kind: 'table', node: declaration});
        break;
      case 'TSModuleDeclaration':
        // a namespace with state of its own: made anew and filled again every evaluation (keepNamespaces)
        if(declaration.id?.type === 'Identifier' && declaration.body?.type === 'TSModuleBlock' && namespaceHoldsState(declaration.body)) {
          set(declaration.id.name, {kind: 'namespace', node: declaration});
        }
        break;
      case 'VariableDeclaration':
        for(const declarator of declaration.declarations) {
          const names = patternNames(declarator.id);
          const init = unwrap(declarator.init);
          let kind;
          if(declaration.kind !== 'const') kind = 'let';
          else if(!init) kind = 'table';
          else if(FN.has(init.type)) kind = 'fn';
          else if(init.type === 'ClassExpression') kind = 'class';
          else if(containsAwait(init)) kind = 'table';
          else if(isCode(init) && !isEmptyContainer(init)) kind = 'table';
          // another name for what is declared elsewhere (`const STORY = MESSAGE`, `const Emoji = Versions['']`): no
          // state of its own, read anew from what it names every evaluation
          else if(isAlias(init)) kind = 'alias';
          // what the module hands itself over through `import.meta.hot.data`: each evaluation reads it anew
          else if(/import\.meta\.hot\??\.data/.test(slice(source, init))) kind = 'table';
          // a factory that takes the update itself: run again, it hands back what its first run made, updated
          else if(init.type === 'CallExpression' && unwrap(init.callee).type === 'Identifier' &&
            SELF_UPDATING.test(bindings.get(unwrap(init.callee).name)?.source ?? '')) kind = 'table';
          else kind = 'state';
          for(const name of names) set(name, {kind, node: kind === 'class' ? init : declarator, init: declarator.init, names, declarator});
        }
        break;
    }
  }

  // a table the module changes is state, through another name for it too
  for(let name of mutatedNames(ast)) {
    for(let hops = 0; bindings.get(name)?.kind === 'alias' && hops < 10; ++hops) name = rootName(bindings.get(name).init);
    const info = bindings.get(name);
    if(info?.kind === 'table' && info.declarator) for(const each of info.names) bindings.get(each).kind = 'state';
  }

  const selfAccepting = /import\.meta\.hot\.accept\(\s*(\)|\(|function\b|async\b|[\w$]+\s*=>)/.test(source);
  return {ast, bindings, exportedLocals, selfAccepting};
}

// a `let`, or a const that is not literal data or a function, among the namespace's own declarations
function namespaceHoldsState(block) {
  return block.body.some((statement) => {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if(declaration?.type !== 'VariableDeclaration' || declaration.declare) return false;
    return declaration.kind !== 'const' || declaration.declarations.some((d) => d.init && !FN.has(unwrap(d.init).type) && (!isCode(d.init) || isEmptyContainer(d.init)));
  });
}

// the top-level statements a function body can take as they are: no declaration of the module's own in them
const WRAPPABLE = new Set(['ExpressionStatement', 'IfStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement',
  'WhileStatement', 'DoWhileStatement', 'BlockStatement', 'TryStatement', 'SwitchStatement']);

// no `var` or function declaration that would leave the module's scope for the function's, no top-level await
function wrappable(statement) {
  let ok = true;
  walk(statement, (n) => {
    if(!ok || (n !== statement && FN.has(n.type) && n.type !== 'FunctionDeclaration')) return false;
    if(n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration' || (n.type === 'VariableDeclaration' && n.kind === 'var') ||
      n.type === 'AwaitExpression' || (n.type === 'ForOfStatement' && n.await)) ok = false;
  });
  return ok;
}

// whether an expression acts on one of `names`: calls a method of it, assigns to it or to a property of it, updates or
// deletes one, hands it to `Object.assign` and the like (not inside a function it makes: that runs later, if at all)
function actsOn(expression, names) {
  let found = false;
  walk(expression, (n) => {
    if(found || (n !== expression && FN.has(n.type))) return false;
    if(n.type === 'CallExpression' || n.type === 'NewExpression') {
      const callee = unwrap(n.callee);
      if(callee.type === 'MemberExpression' && names.has(rootName(callee.object))) found = true;
      else if(n.type === 'CallExpression' && names.has(rootName(changedArgument(n)))) found = true;
    } else if(n.type === 'AssignmentExpression') {
      if(names.has(rootName(n.left))) found = true;
    } else if(n.type === 'UpdateExpression' || (n.type === 'UnaryExpression' && n.operator === 'delete')) {
      if(names.has(rootName(n.argument))) found = true;
    }
  });
  return found;
}

function patternNamesOfDeclaration(declaration) {
  if(declaration.type === 'VariableDeclaration') return declaration.declarations.flatMap((d) => patternNames(d.id));
  return declaration.id ? [declaration.id.name] : [];
}

/**
 * What a piece of the module is made with, followed through the module's own functions: their code (`text`) and what
 * they read that another evaluation could give differently (`deps`: imports, the module's tables).
 */
function madeWith(roots, analysis, source) {
  const {bindings} = analysis;
  const names = new Set(bindings.keys());
  const texts = new Map();
  const deps = new Set();
  const seen = new Set();
  const queue = [...roots];
  while(queue.length) {
    const name = queue.shift();
    if(seen.has(name)) continue;
    seen.add(name);
    const info = bindings.get(name);
    if(!info) continue;
    // another name for a part of kept state reads what that state holds now: no code of it to compare
    if(info.kind === 'alias' && STABLE_KINDS.has(bindings.get(rootName(info.init))?.kind)) continue;
    if(info.kind === 'import' || info.kind === 'table' || info.kind === 'alias') {
      deps.add(name);
      // a table of the module's own is code too (`{run: () => helper()}`): its text, and what its functions call
      if(info.kind === 'table' && info.node) {
        texts.set(name, slice(source, info.node));
        referencedNames(info.node, names).forEach((ref) => queue.push(ref));
      }
    } else if(info.kind === 'fn') {
      texts.set(name, slice(source, info.node));
      referencedNames(info.node, names).forEach((ref) => queue.push(ref));
    } else if(info.kind === 'class') {
      // patched in place and one family across evaluations: what was made with its static methods compares by their
      // version (keepClasses' `statics`)
      deps.add(name);
    }
    // a component renders its latest version, state and lets are the same object every evaluation
  }
  return {texts, deps: [...deps].sort()};
}

/**
 * The names a class holds as values or builds its instances with: everything its constructor, field initializers,
 * static blocks and `extends` read, what a method hands out (an argument, an assignment, a returned or stored value)
 * and the factory whose result a method stores on the instance — not what a method only calls (the method is patched,
 * and calls the new one) nor what a closure made inside a method reads (such a closure keeps the old code: the stated
 * limit).
 */
function classHeldNames(classNode, names, ownClasses) {
  const out = new Set();
  // a superclass of the module's own is patched with it, and `extends` calls none of its static methods
  if(classNode.superClass) referencedNames(classNode.superClass, names).forEach((name) => !ownClasses.has(name) && out.add(name));
  for(const member of classNode.body.body) {
    if(member.type === 'MethodDefinition' && member.kind !== 'constructor') {
      const body = member.value;
      walk(body, (n, parent, key) => {
        if(n !== body && FN.has(n.type)) return false;
        if(n.type !== 'Identifier' || !names.has(n.name) || !isReference(n, parent, key)) return;
        const escapes = parent && (
          ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && key === 'arguments') ||
          (parent.type === 'AssignmentExpression' && key === 'right') ||
          (parent.type === 'Property' && key === 'value') ||
          parent.type === 'ReturnStatement' || parent.type === 'ArrayExpression' ||
          (parent.type === 'VariableDeclarator' && key === 'init') ||
          parent.type === 'ConditionalExpression' || parent.type === 'LogicalExpression'
        );
        if(escapes) out.add(n.name);
      });
      // what a method stores on the instance from a factory (`this.audio = createChatAudio(...)`): the instance holds
      // what the old factory made
      walk(body, (n) => {
        if(n !== body && FN.has(n.type)) return false;
        if(n.type !== 'AssignmentExpression' || unwrap(n.left).type !== 'MemberExpression' || unwrap(unwrap(n.left).object).type !== 'ThisExpression') return;
        const value = unwrap(n.right);
        if(value?.type !== 'CallExpression') return;
        // a factory of the module or an import, or one a class or an object holds (`CustomEmojiElement.create()`)
        const factory = rootName(value.callee);
        if(names.has(factory)) out.add(factory);
      });
    } else if(member.type !== 'MethodDefinition' || member.kind === 'constructor') {
      referencedNames(member.type === 'MethodDefinition' ? member.value : (member.value ?? member), names, out);
    }
  }
  return out;
}

/**
 * The markup each part of a served class makes through Solid's templates, which an edit of the markup alone changes
 * while the code that makes it stays as it was: '' for its constructor and field initializers (what the live instances
 * were built with), and each instance method by name
 */
function classMarkup(classNode, templates) {
  const out = {};
  const add = (key, node) => {
    const used = new Set();
    walk(node, (n) => {
      if(n.type === 'Identifier' && templates.has(n.name)) used.add(n.name);
    });
    if(used.size) out[key] = [out[key], ...[...used].sort().map((name) => templates.get(name))].filter(Boolean).join('\n');
  };
  for(const member of classNode.body.body) {
    if(member.static || member.computed) continue;
    if(member.type === 'MethodDefinition' && member.kind !== 'constructor') add(member.key.name ?? String(member.key.value), member.value);
    else if(member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') add('', member);
  }
  return Object.fromEntries(Object.entries(out).map(([key, text]) => [key, hash(text)]));
}

/**
 * The methods a class calls as it makes an instance — `this.x(...)` in its constructor or a field initializer, not in a
 * closure made there: part of the construction, which the live instances have been through (an edit of one reloads)
 */
function constructionCalls(classNode) {
  const out = new Set();
  const visit = (root) => walk(root, (n) => {
    if(n !== root && FN.has(n.type)) return false;
    if(n.type !== 'CallExpression') return;
    const callee = unwrap(n.callee);
    if(callee.type === 'MemberExpression' && !callee.computed && unwrap(callee.object).type === 'ThisExpression') out.add(callee.property.name);
  });
  for(const member of classNode.body.body) {
    if(member.type === 'MethodDefinition' && member.kind === 'constructor') visit(member.value.body);
    else if(member.type === 'PropertyDefinition' && !member.static && member.value && !FN.has(unwrap(member.value).type)) visit(member.value);
  }
  return [...out];
}

/** A class's static fields whose initializer may do something (a call, `new`): made once per page, as top-level state */
function staticStateFields(classNode) {
  return classNode.body.body.filter((member) => member.type === 'PropertyDefinition' && member.static && !member.computed &&
    member.value && !isCode(member.value) && !containsAwait(member.value)).map((member) => ({name: member.key.name, init: member.value}));
}

// where a static field's initializer is in the served code: a field still, an assignment in a static block (what a
// compiler makes of a field without define semantics), or one after the class
function servedStaticInits(served, className) {
  const out = new Map();
  const isTarget = (node) => {
    node = unwrap(node);
    return node.type === 'ThisExpression' || (node.type === 'Identifier' && node.name === className);
  };
  const fromAssignment = (expression) => {
    if(expression?.type !== 'AssignmentExpression' || expression.operator !== '=') return;
    const left = unwrap(expression.left);
    if(left.type === 'MemberExpression' && !left.computed && isTarget(left.object)) out.set(left.property.name, expression.right);
  };
  for(const statement of served.ast.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement;
    let classNode;
    if(declaration?.type === 'ClassDeclaration' && declaration.id?.name === className) classNode = declaration;
    else if(declaration?.type === 'VariableDeclaration') {
      const declarator = declaration.declarations.find((d) => d.id.type === 'Identifier' && d.id.name === className && unwrap(d.init)?.type === 'ClassExpression');
      if(declarator) classNode = unwrap(declarator.init);
    } else if(statement.type === 'ExpressionStatement' && unwrap(statement.expression.left?.object)?.name === className) {
      fromAssignment(statement.expression);
    }
    if(!classNode) continue;
    for(const member of classNode.body.body) {
      if(member.type === 'PropertyDefinition' && member.static && !member.computed && member.value) out.set(member.key.name, member.value);
      else if(member.type === 'StaticBlock') member.body.forEach((inner) => inner.type === 'ExpressionStatement' && fromAssignment(inner.expression));
    }
  }
  return out;
}

// the top-level runtime names of the code being served (what a thunk may name), and their declarators
function analyzeServed(code) {
  const ast = parse(code, 'js');
  const names = new Set();
  const declarators = new Map();
  const defaults = [];
  // `export {a as b} from 'x'`, `export * from 'x'`, `export * as ns from 'x'`: what the module hands on of another
  const reexports = [];
  // what it exports of its own top level (a compiler may have made an import of a re-export): exported name, local name
  const exportEntries = [];
  // its classes, by name, and Solid's templates: the markup a JSX expression makes, hoisted out of the code that makes
  // it (`var _tmpl$2 = template('<form class=...>')`)
  const classes = new Map();
  const templates = new Map();
  const nameOf = (node) => node.type === 'Literal' ? node.value : node.name;
  for(const statement of ast.body) {
    if((statement.type === 'ExportNamedDeclaration' && statement.source && statement.exportKind !== 'type') || statement.type === 'ExportAllDeclaration') {
      reexports.push(statement);
      continue;
    }

    if(statement.type === 'ExportNamedDeclaration' && !statement.declaration && statement.exportKind !== 'type') {
      for(const specifier of statement.specifiers) {
        if(specifier.exportKind !== 'type') exportEntries.push({exported: nameOf(specifier.exported), local: specifier.local.name});
      }
    } else if(statement.type === 'ExportNamedDeclaration' && statement.declaration) {
      patternNamesOfDeclaration(statement.declaration).forEach((name) => exportEntries.push({exported: name, local: name}));
    } else if(statement.type === 'ExportDefaultDeclaration') {
      const local = statement.declaration.type === 'Identifier' ? statement.declaration.name : statement.declaration.id?.name;
      if(local) exportEntries.push({exported: 'default', local});
    }

    let declaration = statement;
    if(statement.type === 'ImportDeclaration') {
      statement.specifiers.forEach((s) => names.add(s.local.name));
      continue;
    }
    if(statement.type === 'ExportNamedDeclaration' && statement.declaration) declaration = statement.declaration;
    if(statement.type === 'ExportDefaultDeclaration') {
      declaration = statement.declaration;
      if(!declaration.id && !FN.has(declaration.type) && !/Class/.test(declaration.type)) defaults.push(declaration);
    }
    if(declaration.type === 'VariableDeclaration') {
      for(const declarator of declaration.declarations) {
        for(const name of patternNames(declarator.id)) {
          names.add(name);
          declarators.set(name, {declarator, kind: declaration.kind});
        }
        const init = declarator.init && unwrap(declarator.init);
        if(declarator.id.type !== 'Identifier' || !init) continue;
        if(init.type === 'ClassExpression') classes.set(declarator.id.name, init);
        else if(/^_tmpl\$\d*$/.test(declarator.id.name)) templates.set(declarator.id.name, code.slice(init.start, init.end));
      }
    } else if((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) {
      names.add(declaration.id.name);
      if(declaration.type === 'ClassDeclaration') classes.set(declaration.id.name, declaration);
    }
  }
  return {ast, names, declarators, defaults, reexports, exportEntries, classes, templates, edits: []};
}

const cellName = (name) => '__hotLet$' + name;

/**
 * The uses of top-level `let`s a function reads or writes, to go through a cell: Babel's scope analysis finds them
 * exactly (a name shadowed in a function is another variable). Returns the names it cells and the edits.
 */
function cellLets(code, letNames) {
  const require = createRequire(import.meta.url);
  const babel = require('@babel/core');
  const ast = babel.parseSync(code, {sourceType: 'module', babelrc: false, configFile: false, parserOpts: {errorRecovery: false}});
  const edits = [];
  const celled = new Set();
  babel.traverse(ast, {
    Program(path) {
      for(const name of letNames) {
        const binding = path.scope.getBinding(name);
        if(!binding || (binding.kind !== 'let' && binding.kind !== 'var') || binding.path.parentPath?.parentPath !== path) continue;
        // a destructuring `let` cannot become one cell: left as it is, its uses too
        if(binding.path.node.id?.type !== 'Identifier') continue;
        const uses = [...binding.referencePaths, ...binding.constantViolations];
        const inClosure = (p) => !!p.findParent((parent) => parent.isFunction() || parent.isClassProperty() ||
          parent.isClassPrivateProperty() || parent.isStaticBlock());
        if(!uses.some(inClosure)) continue;
        // an export of it would export the cell: leave it as it is
        if(binding.referencePaths.some((p) => p.parentPath.isExportSpecifier())) continue;
        celled.add(name);
        const replacement = cellName(name) + '.v';
        const replace = (node, parent) => {
          const shorthand = parent?.type === 'ObjectProperty' && parent.shorthand && (parent.value === node || parent.key === node ||
            (parent.value?.type === 'AssignmentPattern' && parent.value.left === node));
          // a bare call keeps no receiver: `callback()` must not become a call on the cell
          const callee = (parent?.type === 'CallExpression' || parent?.type === 'OptionalCallExpression') && parent.callee === node ||
            (parent?.type === 'TaggedTemplateExpression' && parent.tag === node);
          if(shorthand) {
            edits.push({start: node.start, end: node.end, text: `${name}: ${replacement}`});
          } else {
            edits.push({start: node.start, end: node.end, text: callee ? `(0, ${replacement})` : replacement});
          }
        };
        for(const reference of binding.referencePaths) replace(reference.node, reference.parent);
        const targets = (node, parent) => {
          if(!node) return;
          switch(node.type) {
            case 'Identifier': if(node.name === name) replace(node, parent); break;
            case 'ObjectPattern': node.properties.forEach((p) => p.type === 'RestElement' ? targets(p.argument, p) : targets(p.value, p)); break;
            case 'ArrayPattern': node.elements.forEach((e) => targets(e, node)); break;
            case 'AssignmentPattern': targets(node.left, parent); break;
            case 'RestElement': targets(node.argument, node); break;
          }
        };
        for(const violation of binding.constantViolations) {
          const node = violation.node;
          if(node.type === 'AssignmentExpression') targets(node.left, node);
          else if(node.type === 'ForOfStatement' || node.type === 'ForInStatement') targets(node.left, node);
          // UpdateExpression: its argument is a reference too
        }
      }
      path.stop();
    }
  });

  // one edit per place: a name both read and written (`x++`) is listed twice
  const unique = new Map();
  for(const edit of edits) unique.set(edit.start, edit);
  return {celled, edits: [...unique.values()]};
}

// from the end, so the offsets before each edit hold; at one offset an insertion goes before the replacement and before
// what an earlier insertion put there. What the code had keeps its place in the source map
function applyEdits(code, edits) {
  const out = new MagicString(code);
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  for(const {start, end, text} of edits) {
    if(start === end) out.prependRight(start, text);
    else out.overwrite(start, end, text);
  }
  return out;
}

// what the registry compares by name once the module has run
const thunk = (names) => names.length ? `() => ({${names.join(', ')}})` : undefined;

/**
 * @param {string} source the module's source as the author wrote it
 * @param {string} code what the other plugins made of it, as it will be served
 * @param {{lang: 'ts' | 'tsx' | 'js' | 'jsx'}} options
 * @returns {string | undefined} the code with the calls added
 */
export function transformForHot(source, code, options) {
  return hotTransform(source, code, options)?.out.toString();
}

/**
 * The same, with the source map of the edits for the dev server to lay over the code's own where they move code along
 * its lines (`id`: the module, for the map). No line ever moves; where no column of the module's own code does either
 * — the calls only added at the ends of lines, as in most modules — the code's own map is right as it is (`map: null`),
 * and the dev server is spared laying a map over it, which it pays for every module it serves.
 * @param {string} source
 * @param {string} code
 * @param {{lang: 'ts' | 'tsx' | 'js' | 'jsx', id: string}} options
 */
export function transformForHotWithMap(source, code, options) {
  const result = hotTransform(source, code, options);
  if(!result) return;
  const {out, movesCode} = result;
  return {code: out.toString(), map: movesCode ? out.generateMap({hires: 'boundary', source: options.id}) : null};
}

// nothing but blanks from a position to the end of its line: text added there moves nothing along the line
const LINE_END = /[ \t]*(?:\r?\n|$)/y;
const atLineEnd = (code, position) => {
  LINE_END.lastIndex = position;
  return LINE_END.test(code);
};

function hotTransform(source, code, {lang}) {
  const analysis = analyzeSource(source, lang);
  const {bindings, exportedLocals} = analysis;
  const served = analyzeServed(code);
  // an anonymous default function gets a name, for keepFunctions to register it by
  if(bindings.get(ANONYMOUS_DEFAULT)) {
    const statement = served.ast.body.find((each) => each.type === 'ExportDefaultDeclaration' && FN.has(each.declaration.type) && !each.declaration.id);
    if(statement) {
      const fn = statement.declaration;
      if(fn.type === 'FunctionDeclaration' || fn.type === 'FunctionExpression') {
        const paren = code.indexOf('(', fn.start);
        served.edits.push({start: paren, end: paren, text: ' ' + ANONYMOUS_DEFAULT});
      } else {
        served.edits.push({start: statement.start, end: fn.start, text: `const ${ANONYMOUS_DEFAULT} = `});
        served.edits.push({start: statement.end, end: statement.end, text: `export default ${ANONYMOUS_DEFAULT};`});
      }
      served.names.add(ANONYMOUS_DEFAULT);
      served.exportEntries.push({exported: 'default', local: ANONYMOUS_DEFAULT});
    } else {
      bindings.delete(ANONYMOUS_DEFAULT);
    }
  }

  // solid-refresh: it makes a module with components accept its own updates, and each component a proxy that renders
  // the latest version — the same across evaluations, as a patched class is, never code that went stale
  const components = new Set([...code.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*_?\$\$component\(/g)].map((match) => match[1]));
  for(const name of components) {
    const info = bindings.get(name);
    if(info) info.kind = 'component';
  }
  const selfAccepting = analysis.selfAccepting || /\$\$refresh\(/.test(code);
  const edits = served.edits;
  const stable = new Set(); // names every evaluation shares: no dep to compare
  const runtimeDeps = (deps) => deps.filter((name) => served.names.has(name) && !stable.has(name));

  // lets a function uses: cells
  const letNames = [...bindings].filter(([name, info]) => info.kind === 'let' && !exportedLocals.has(name) && served.declarators.get(name)).map(([name]) => name);
  let celled = new Set();
  if(letNames.length) {
    const result = cellLets(code, letNames);
    celled = result.celled;
    edits.push(...result.edits);
  }

  // top-level statements that act on what the module keeps: made once, with the state. A table such a statement reads
  // is kept with it — the statement acted on the first evaluation's (`aliases.unshift(...)` on a table's arrays,
  // through another name), and a table made anew would miss what it did
  const allNames = new Set(bindings.keys());
  const keptNames = () => {
    const out = new Set([...[...bindings].filter(([name, info]) => info.kind === 'state' && served.names.has(name)).map(([name]) => name), ...celled]);
    // another name for kept state or a part of it: what a statement does through it, it does to the state
    for(let grew = true; grew;) {
      grew = false;
      for(const [name, info] of bindings) {
        if(info.kind !== 'alias' || out.has(name) || !out.has(rootName(info.init))) continue;
        out.add(name);
        grew = true;
      }
    }
    return out;
  };
  let kept = keptNames();
  let wrapped = [];
  for(let changed = true; changed;) {
    changed = false;
    wrapped = served.ast.body.filter((statement) => WRAPPABLE.has(statement.type) && actsOn(statement, kept) && wrappable(statement));
    for(const statement of wrapped) {
      for(const name of referencedNames(statement, allNames)) {
        const info = bindings.get(name);
        if(info?.kind !== 'table' || !info.declarator || served.declarators.get(name)?.kind !== 'const') continue;
        for(const each of info.names) bindings.get(each).kind = 'state';
        changed = true;
      }
    }
    if(changed) kept = keptNames();
  }

  for(const [name, info] of bindings) if(info.kind === 'state' || celled.has(name)) stable.add(name);

  // a dynamic import imports by the URL its evaluation named, which Vite stamped before any later edit: code an earlier
  // evaluation made (kept state, a field's arrow function, a held method, a listener) would load the module as it was
  // then — a kept tab's `getComponentModule` its old code for good. Every run registers the module's imports anew,
  // stamped by Vite, and each one calls the latest by its specifier (an edit adding one shifts no other)
  const lateImports = {};
  walk(served.ast, (n) => {
    if(n.type !== 'ImportExpression') return;
    const source = unwrap(n.source);
    const specifier = source.type === 'Literal' ? source.value : source.type === 'TemplateLiteral' && !source.expressions.length ? source.quasis[0].value.cooked : undefined;
    if(typeof(specifier) !== 'string') return;
    edits.push({start: n.start, end: n.end, text: `__hotImport(__hotUrl, ${JSON.stringify(specifier)})`});
    lateImports[specifier] ??= code.slice(n.start, n.end);
  });

  const keep = (key, init, original, wrapAsCell) => {
    const {texts, deps} = madeWith([...referencedNames(original ?? {type: 'EmptyStatement'}, new Set(bindings.keys()))], analysis, source);
    const text = [...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([name, code]) => name + ':' + code).join('\n');
    const fingerprint = hash((original ? slice(source, original) : 'undefined') + '\n' + text);
    const depsThunk = thunk(runtimeDeps(deps));
    const tail = `, ${JSON.stringify(fingerprint)}${depsThunk ? ', ' + depsThunk : ''})`;
    const head = `__hotKeep(__hotUrl, ${JSON.stringify(key)}, () => (`;
    if(wrapAsCell) {
      return init ?
        [{start: init.start, end: init.start, text: head + '{v: ('}, {start: init.end, end: init.end, text: ')})' + tail}] :
        null;
    }
    return [{start: init.start, end: init.start, text: head}, {start: init.end, end: init.end, text: ')' + tail}];
  };

  // state consts: kept
  const keptDeclarators = new Set();
  for(const [name, info] of bindings) {
    if(info.kind !== 'state' || info.isDefault) continue;
    const served_ = served.declarators.get(name);
    if(!served_ || served_.kind !== 'const' || !served_.declarator.init || keptDeclarators.has(served_.declarator)) continue;
    keptDeclarators.add(served_.declarator);
    const key = info.names.length > 1 ? info.names.join(',') : name;
    const init = served_.declarator.init;
    const callee = init.type === 'CallExpression' && unwrap(init.callee);
    if(callee?.type === 'Identifier' && /^_?\$\$context$/.test(callee.name) && init.arguments.length === 3) {
      // solid-refresh registers a context on every evaluation and invalidates the update when one is missing: keep the
      // context itself, let the registration run
      edits.push(...keep(key, init.arguments[2], info.init));
    } else {
      edits.push(...keep(key, init, info.init));
    }
  }

  // `export default <state>`
  const defaultInfo = bindings.get('default');
  if(defaultInfo?.isDefault && served.defaults.length === 1) {
    edits.push(...keep('default', served.defaults[0], defaultInfo.init));
  }

  // celled lets: the declaration makes the cell
  for(const name of celled) {
    const info = bindings.get(name);
    const {declarator} = served.declarators.get(name);
    if(declarator.id.type !== 'Identifier') {
      // a destructuring `let` cannot become one cell: leave it (rare)
      continue;
    }
    edits.push({start: declarator.id.start, end: declarator.id.end, text: cellName(name)});
    if(declarator.init) {
      edits.push(...keep('let ' + name, declarator.init, info.init, true));
    } else {
      const fingerprint = hash('undefined');
      edits.push({start: declarator.id.end, end: declarator.id.end, text: ` = __hotKeep(__hotUrl, ${JSON.stringify('let ' + name)}, () => ({v: undefined}), ${JSON.stringify(fingerprint)})`});
    }
  }

  // the statements found above: run once, with the state
  let statementIndex = 0;
  for(const statement of wrapped) {
    const text = code.slice(statement.start, statement.end);
    const {texts, deps} = madeWith([...referencedNames(statement, new Set(bindings.keys()))], analysis, source);
    const fingerprint = hash(text + '\n' + [...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([fn, body]) => fn + ':' + body).join('\n'));
    const depsThunk = thunk(runtimeDeps(deps));
    edits.push({start: statement.start, end: statement.start, text: `__hotStatement(__hotUrl, "statement ${statementIndex++}", () => {`});
    edits.push({start: statement.end, end: statement.end, text: `}, ${JSON.stringify(fingerprint)}${depsThunk ? ', ' + depsThunk : ''});`});
  }

  // classes, with what they hold
  const trailer = [];
  // how many there were: one the edit removed leaves its effect on the kept state. Every module says it, none or not: an
  // edit may remove the last of them with the state they acted on
  trailer.push(`__hotStatements(__hotUrl, ${statementIndex});`);
  const classNames = [...bindings].filter(([name, info]) => info.kind === 'class' && served.names.has(name)).map(([name]) => name);
  if(classNames.length) {
    const names = new Set(bindings.keys());
    const held = new Set();
    for(const name of classNames) classHeldNames(bindings.get(name).node, names, new Set(classNames)).forEach((ref) => held.add(ref));
    const {texts, deps} = madeWith([...held], analysis, source);
    // each function by name, for the reload to say which
    const sources = Object.fromEntries([...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([name, code]) => [name, hash(code)]));
    const depsThunk = thunk(runtimeDeps(deps));
    const construction = {};
    for(const name of classNames) {
      const calls = constructionCalls(bindings.get(name).node);
      if(calls.length) construction[name] = calls;
    }
    // per method, what it reads of the module: a copy a live instance holds of it (bound, a listener) keeps that
    const methods = {};
    const methodDeps = new Set();
    for(const name of classNames) {
      const info = {};
      for(const member of bindings.get(name).node.body.body) {
        if(member.type !== 'MethodDefinition' || member.kind === 'constructor' || member.static || member.computed) continue;
        const {texts, deps} = madeWith([...referencedNames(member.value, names)], analysis, source);
        const read = runtimeDeps(deps);
        if(!texts.size && !read.length) continue;
        info[member.key.name] = [hash([...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([fn, code]) => fn + ':' + code).join('\n')), read];
        read.forEach((dep) => methodDeps.add(dep));
      }
      if(Object.keys(info).length) methods[name] = info;
    }
    // each class's static methods as code: their text, and the module functions and tables they reach — what was made
    // with one is made with all that
    const statics = {};
    for(const name of classNames) {
      const members = bindings.get(name).node.body.body.filter((member) => member.static &&
        (member.type === 'MethodDefinition' || (member.type === 'PropertyDefinition' && member.value && FN.has(unwrap(member.value).type))));
      if(!members.length) continue;
      const {texts, deps} = madeWith(members.flatMap((member) => [...referencedNames(member.value, names)]), analysis, source);
      const read = runtimeDeps(deps);
      statics[name] = [hash(members.map((member) => slice(source, member)).join('\n') + '\n' + [...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([fn, code]) => fn + ':' + code).join('\n')), read];
      read.forEach((dep) => methodDeps.add(dep));
    }
    const markup = {};
    if(served.templates.size) {
      for(const name of classNames) {
        const servedClass = served.classes.get(name);
        const parts = servedClass && classMarkup(servedClass, served.templates);
        if(parts && Object.keys(parts).length) markup[name] = parts;
      }
    }
    const args = [
      JSON.stringify(sources),
      depsThunk ?? 'undefined',
      Object.keys(construction).length ? JSON.stringify(construction) : 'undefined',
      Object.keys(methods).length ? JSON.stringify(methods) : 'undefined',
      thunk([...methodDeps].sort()) ?? 'undefined',
      Object.keys(statics).length ? JSON.stringify(statics) : 'undefined',
      Object.keys(markup).length ? JSON.stringify(markup) : 'undefined'
    ];
    while(args[args.length - 1] === 'undefined') args.pop();
    trailer.push(`__hotClasses(__hotUrl, {${classNames.join(', ')}}${args.map((arg) => ', ' + arg).join('')});`);

    // static fields that do something as they are made: kept like top-level state
    for(const name of classNames) {
      const fields = staticStateFields(bindings.get(name).node);
      if(!fields.length) continue;
      const inits = servedStaticInits(served, name);
      for(const {name: field, init} of fields) {
        const servedInit = inits.get(field);
        if(servedInit) edits.push(...keep(`${name}.${field}`, servedInit, init));
      }
    }
  }

  // namespaces with state: running the module again reloads
  const namespaces = [...bindings].filter(([name, info]) => info.kind === 'namespace' && served.names.has(name)).map(([name]) => name);
  if(namespaces.length) trailer.push(`__hotNamespaces(__hotUrl, ${JSON.stringify(namespaces)});`);

  // its exported functions, by the code they reach: what another module holds of one compares by it
  const exportedFunctions = [...exportedLocals].filter((name) => bindings.get(name)?.kind === 'fn' && served.names.has(name));
  if(exportedFunctions.length) {
    const infos = {};
    const allDeps = new Set();
    for(const name of exportedFunctions) {
      const {texts, deps} = madeWith([name], analysis, source);
      const code = [...texts].sort(([a], [b]) => a < b ? -1 : 1).map(([fn, text]) => fn + ':' + text).join('\n');
      const depNames = runtimeDeps(deps);
      depNames.forEach((dep) => allDeps.add(dep));
      infos[name] = [hash(code), depNames];
    }
    const depsThunk = thunk([...allDeps].sort());
    trailer.push(`__hotFunctions(__hotUrl, () => ({${exportedFunctions.join(', ')}}), ${JSON.stringify(infos)}${depsThunk ? ', ' + depsThunk : ''});`);
  }

  // a module that accepts its own updates: its exports
  const reexportImports = [];
  if(selfAccepting) {
    const entries = served.exportEntries
    .filter(({local}) => served.names.has(local) && !celled.has(local))
    .map(({exported, local}) => exported === local ? local : `${JSON.stringify(exported)}: ${local}`);
    // what it hands on of other modules: their namespaces, read under names of its own
    const nameOf = (node) => node.type === 'Literal' ? node.value : node.name;
    served.reexports.forEach((statement, index) => {
      const namespace = '__hotReexport$' + index;
      reexportImports.push(`import * as ${namespace} from ${JSON.stringify(statement.source.value)};`);
      if(statement.type === 'ExportAllDeclaration') {
        entries.push(`${JSON.stringify(statement.exported ? nameOf(statement.exported) : '*' + statement.source.value)}: ${namespace}`);
      } else {
        for(const specifier of statement.specifiers) {
          if(specifier.exportKind === 'type') continue;
          entries.push(`${JSON.stringify(nameOf(specifier.exported))}: ${namespace}[${JSON.stringify(nameOf(specifier.local))}]`);
        }
      }
    });
    // none left is a change too: an edit may remove the last of them
    trailer.push(`__hotExports(__hotUrl, () => ({${entries.join(', ')}}));`);
  }

  const prelude = `import {keepValue as __hotKeep, keepClasses as __hotClasses, keepExports as __hotExports, keepFunctions as __hotFunctions, keepNamespaces as __hotNamespaces, keepStatement as __hotStatement, endStatements as __hotStatements, beginEvaluation as __hotBegin, keepImports as __hotImports, latestImport as __hotImport} from ${JSON.stringify(REGISTRY)};${reexportImports.join('')}const __hotUrl = import.meta.url;__hotBegin(__hotUrl);${
    Object.keys(lateImports).length ? `__hotImports(__hotUrl, {${Object.entries(lateImports).map(([specifier, text]) => `${JSON.stringify(specifier)}: () => ${text}`).join(', ')}});` : ''
  }`;
  // at the end of the line the first import ends on, if nothing follows it there: no column of the module's own code
  // moves then, and the imports run before its code wherever they stand
  const first = served.ast.body[0];
  const preludeAt = first?.type === 'ImportDeclaration' && atLineEnd(code, first.end) ? first.end : 0;
  edits.push({start: preludeAt, end: preludeAt, text: prelude});
  const movesCode = edits.some(({start, end}) => start !== end || !atLineEnd(code, start));
  const out = applyEdits(code, edits);
  if(trailer.length) out.append('\n' + trailer.join(''));
  return {out, movesCode};
}
