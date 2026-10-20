// * tweb's own lint rules, loaded by .oxlintrc.json (jsPlugins, ESLint's plugin format)

// * a callback handed to these runs later, once whatever it waits for is done - as code after an await does
const LATER_CALLBACKS = new Set(['then', 'catch', 'finally', 'setTimeout']);
// * and these run it at once, as a part of the function that hands it over
const SAME_TIME_CALLBACKS = new Set(['forEach', 'map', 'filter', 'find', 'findIndex', 'findLast', 'some', 'every', 'reduce', 'flatMap', 'sort']);

const isLoop = (node) => /^(For|ForIn|ForOf|While|DoWhile)Statement$/.test(node.type);

function getCalleeName(call) {
  const {callee} = call;
  if(callee.type === 'Identifier') return callee.name;
  if(callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') return callee.property.name;
}

// * how a function runs relative to the one around it: `later` (a continuation), `now` (a part of it), or
// * on its own (an event handler, a method)
function getCallbackKind(node) {
  const parent = node.parent;
  // * a promise's executor runs as it is made
  if(parent?.type === 'NewExpression' && parent.arguments[0] === node &&
    parent.callee.type === 'Identifier' && parent.callee.name === 'Promise') {
    return 'now';
  }

  if(parent?.type === 'CallExpression') {
    if(parent.callee === node) return 'now'; // * an IIFE
    if(parent.arguments.includes(node)) {
      const name = getCalleeName(parent);
      if(LATER_CALLBACKS.has(name)) return 'later';
      if(SAME_TIME_CALLBACKS.has(name)) return 'now';
    }
  }
}

// * not the assignment that sets them, nor `.all` - every account at once, whichever the tab shows
function isAccountRead(node) {
  const {parent} = node;
  return !(parent.type === 'AssignmentExpression' && parent.left === node) &&
    !(parent.type === 'MemberExpression' && parent.object === node && !parent.computed && parent.property.name === 'all');
}

// * kept in a variable as they are, rather than bound (bindManagersToSession) - they, one manager of them
// * or one of its methods: `const cb = rootScope.managers.apiFileManager.download`
function isKeptUnbound(node) {
  let kept = node;
  while(kept.parent.type === 'MemberExpression' && kept.parent.object === kept) {
    kept = kept.parent;
  }

  // * one of the values it may be kept as: `props.managers || rootScope.managers`, `a ? b : rootScope.managers`
  while(/^(LogicalExpression|TSAsExpression|TSNonNullExpression|ParenthesizedExpression)$/.test(kept.parent.type) ||
    (kept.parent.type === 'ConditionalExpression' && kept.parent.test !== kept)) {
    kept = kept.parent;
  }

  const {parent} = kept;
  return (parent.type === 'VariableDeclarator' && parent.init === kept) ||
    (parent.type === 'AssignmentExpression' && parent.right === kept && parent.left.type === 'Identifier');
}

const READ_AFTER_WAIT = 'Managers read after an await, or in a callback that runs later, are those of whichever account ' +
  'the tab shows by then. Read them once at the start of the function - ' +
  '`const managers = bindManagersToSession(rootScope.managers)` - and use that.';
const KEPT_UNBOUND = 'Managers kept for after a wait follow whichever account the tab shows by then: keep them bound - ' +
  '`const managers = bindManagersToSession(rootScope.managers)`.';
const POPUP_AFTER_WAIT = 'A popup opened after a wait would open over whichever account the tab shows by then: hand it ' +
  'the managers read before the wait - `<PopupElement managers={managers}>` - and it does not open once their ' +
  'account session is over.';

// * the `<PopupElement>` a popup is opened with, when it is not handed managers of its own
function findPopupWithoutManagers(node) {
  if(!node || typeof node.type !== 'string') return;
  if(node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && node.name.name === 'PopupElement') {
    const handed = node.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute' ||
      (attribute.name?.type === 'JSXIdentifier' && attribute.name.name === 'managers'));
    return handed ? undefined : node;
  }

  for(const key in node) {
    if(key === 'parent') continue;
    const value = node[key];
    const found = Array.isArray(value) ?
      value.reduce((found, child) => found || findPopupWithoutManagers(child), undefined) :
      (value && typeof value === 'object' ? findPopupWithoutManagers(value) : undefined);
    if(found) return found;
  }
}

/**
 * The tab's own managers follow whichever account it shows (see bindManagersToSession), so a function that waits
 * - an await, a callback that runs later - reads its managers once, before the wait, bound to the session it was
 * asked in: what it does after the wait then belongs to that account, and stops if the tab has switched.
 */
const managersBeforeAwait = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Managers are read once, before the first await: after it they would be those of the account the tab shows by then'
    },
    schema: [{
      type: 'object',
      properties: {
        // * where `this.managers` are tied to an account by construction (a chat's, a call's)
        allowThis: {type: 'boolean'}
      },
      additionalProperties: false
    }]
  },
  create(context) {
    const allowThis = !!context.options[0]?.allowThis;
    // * a frame per function: its awaits, loops and later callbacks, and the managers it reads, decided once it is left
    const frames = [];

    const isManagersOwner = (node) => (node.type === 'Identifier' && node.name === 'rootScope') ||
      (node.type === 'ThisExpression' && !allowThis);
    const isManagers = (node) => !node.computed && node.property.type === 'Identifier' &&
      node.property.name === 'managers' && isManagersOwner(node.object);

    const enter = (node) => {
      const kind = getCallbackKind(node);
      const outer = frames[frames.length - 1];
      if(kind === 'later' && outer) outer.hasLater = true;
      // * a function it makes that may run at any time later - a handler, an async step - holds what it keeps
      if(kind !== 'now' && outer) outer.hasClosure = true;
      frames.push({
        node,
        // * a continuation runs after a wait by itself; a callback run at once is as far on as its caller
        waitedBefore: kind === 'later' || (kind === 'now' && !!outer && (outer.awaits.length > 0 || outer.waitedBefore)),
        hasLater: false,
        hasClosure: false,
        awaits: [],
        loops: [],
        reads: [],
        kept: [],
        popups: []
      });
    };

    const leave = () => {
      const frame = frames.pop();
      const waits = frame.awaits.length > 0 || frame.hasLater;
      // * kept for a function made here, they are read whenever it runs: after a wait as well
      const keepsForLater = waits || frame.hasClosure;
      const isAfterWait = (node) => frame.waitedBefore ||
        frame.awaits.some((position) => position < node.range[0]) ||
        frame.loops.some((loop) => loop.hasAwait && loop.range[0] <= node.range[0] && node.range[1] <= loop.range[1]);
      for(const read of frame.reads) {
        if(isAfterWait(read)) {
          context.report({node: read, message: READ_AFTER_WAIT});
        } else if(keepsForLater && isKeptUnbound(read)) {
          context.report({node: read, message: KEPT_UNBOUND});
        }
      }

      for(const {call, popup} of frame.popups) {
        if(isAfterWait(call)) {
          context.report({node: popup, message: POPUP_AFTER_WAIT});
        }
      }

      if(keepsForLater) {
        for(const node of frame.kept) {
          context.report({node, message: KEPT_UNBOUND});
        }
      }
    };

    const onWait = (node) => {
      const frame = frames[frames.length - 1];
      if(!frame) return;
      frame.awaits.push(node.range[1]);
      for(let parent = node.parent; parent && parent !== frame.node; parent = parent.parent) {
        if(isLoop(parent)) {
          const loop = frame.loops.find((loop) => loop.node === parent);
          if(loop) loop.hasAwait = true;
        }
      }
    };

    return {
      'FunctionDeclaration': enter,
      'FunctionExpression': enter,
      'ArrowFunctionExpression': enter,
      'FunctionDeclaration:exit': leave,
      'FunctionExpression:exit': leave,
      'ArrowFunctionExpression:exit': leave,
      ':matches(ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement)'(node) {
        frames[frames.length - 1]?.loops.push({node, range: node.range, hasAwait: false});
        if(node.type === 'ForOfStatement' && node.await) onWait(node);
      },
      'AwaitExpression:exit': onWait,
      MemberExpression(node) {
        if(!isManagers(node) || !isAccountRead(node)) return;
        frames[frames.length - 1]?.reads.push(node);
      },
      CallExpression(node) {
        if(node.callee.type !== 'Identifier' || node.callee.name !== 'createPopup') return;
        const popup = findPopupWithoutManagers(node.arguments[0]);
        if(popup) frames[frames.length - 1]?.popups.push({call: node, popup});
      },
      // * `const {managers} = rootScope` keeps them as they are, too
      VariableDeclarator(node) {
        if(node.id.type !== 'ObjectPattern' || !node.init || !isManagersOwner(node.init)) return;
        const keepsManagers = node.id.properties.some((property) => property.type === 'Property' &&
          !property.computed && property.key.type === 'Identifier' && property.key.name === 'managers');
        if(keepsManagers) frames[frames.length - 1]?.kept.push(node);
      }
    };
  }
};

export default {
  meta: {name: 'tweb'},
  rules: {
    'managers-before-await': managersBeforeAwait
  }
};
