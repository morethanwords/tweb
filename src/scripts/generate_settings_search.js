/**
 * Generates `src/lib/settingsSearch/generated.ts` — the settings-search index.
 *
 * The index is derived from the settings tabs themselves, so adding a row to a
 * settings tab makes it searchable with no extra bookkeeping:
 *
 *   - the section tree comes from `solidJsTabs/tabs.ts` (id, title key, module)
 *     plus the tab constructors each tab file references;
 *   - entries come from the labels a tab renders — `<Row.Title>{i18n('K')}</Row.Title>`,
 *     `<Section name="K">`, title-ish props of helper components, imperative
 *     `addRow(..., i18n('K'), ...)` calls and option tuples.
 *
 * IMPORTANT: the generated file holds IDENTIFIERS ONLY (lang keys, section ids)
 * — never user-visible text. Every string the user sees is resolved
 * at runtime from the current language pack, and search keywords come from the
 * server-side `<TitleKey>.SearchKeywords` strings. See src/lib/settingsSearch/.
 *
 * Run via `node src/scripts/generate_settings_search.js` or through the Vite
 * watcher wired in vite.config.ts. Do not hand-edit the output.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const TABS_FILE = path.join(SRC, 'components/solidJsTabs/tabs.ts');
const LINKS_FILE = path.join(SRC, 'scripts/in/settings-links.csv');
const OUT_FILE = path.join(SRC, 'lib/settingsSearch/generated.ts');
const ROOT_TAB = 'AppSettingsTab';

// Files a settings tab may pull rows from. Anything outside is a shared widget.
const HELPER_ROOTS = [
  path.join(SRC, 'components/sidebarLeft'),
  path.join(SRC, 'components/sidebarRight')
];
const HELPER_DEPTH = 3;

// A label is not a setting when it announces a result, asks for confirmation or
// explains something underneath a control.
const DENY_CALLEES = /toast|confirmation|Alert|alert|Popup|popup|placeholder|Placeholder/;
// what a control is called, not what it says inside: the label of an input and
// the caption of a button belong to the screen they open, not to the row
const DENY_PROPS = new Set([
  'caption', 'captionArgs', 'subtitle', 'description', 'placeholder', 'nameArgs',
  'inputLabel', 'buttonText', 'placeholderText', 'errorText', 'confirmText', 'descriptionText'
]);
const DENY_KEY_SHAPE = /(Info\d*$|Caption|Desc$|Description|Help$|Notice|Hint$|Subtitle$|Warning|AreYouSure|Alert|Empty$|Loading|Error\.|Confirm|Cleared$|Copied)/;
// Too generic to ever be a useful hit on its own.
const STOP_KEYS = new Set([
  'On', 'Off', 'Delete', 'Clear', 'Save', 'Done', 'Cancel', 'OK', 'Ok', 'Edit', 'Add', 'Close',
  'Loading', 'Terminate', 'Continue', 'Next', 'Back', 'Yes', 'No', 'Search'
]);

// A section's icon comes from the row that opens it. Edit Profile has no such
// row — it opens from the pencil in the Settings header — so it borrows the icon
// of the sidebar's compose button.
const SECTION_ICONS = {
  AppEditProfileTab: 'newchat_filled'
};

/**
 * Paths that name no screen of the settings tree — a popup, a chat, the profile
 * editor's own dialogs. `internalLinkProcessor` owns them; leaving them to the
 * text matcher below would hang them on whatever section reads alike (`edit/bio`
 * on the privacy screen called "Bio"), and a wrong address is worse than none:
 * it is what the search offers to copy.
 */
const PROCESSOR_PATHS = new Set([
  '', 'edit/birthday', 'edit/add-account', 'emoji-status', 'saved-messages', 'ton',
  'my-profile/posts/all-stories', 'my-profile/archived-posts'
]);

// Paths whose Web K column names the row but not the tab behind it (the text is
// cut short in the table), resolved by prefix.
const LINK_OVERRIDES = {
  // every `edit/<field>` is the profile editor, whatever the field reads like —
  // except the paths under `edit/` that are not fields at all
  'edit': 'AppEditProfileTab',
  'edit/log-out': 'AppSettingsTab',
  'profile-photo': 'AppEditProfileTab',
  'privacy/forwards': 'AppPrivacyForwardMessagesTab',
  'privacy/voice': 'AppPrivacyVoicesTab',
  'privacy/messages': 'AppPrivacyMessagesTab',
  'privacy/passcode/change': 'AppPasscodeLockTab'
};

/**
 * The control a path points at, where the table's wording cannot name it — the
 * same per-path control id tdesktop keeps in its router (`openPasscode(ctx,
 * "passcode/auto-lock")`).
 */
const LINK_HIGHLIGHTS = {
  // the input itself, not the section around it
  'edit/first-name': 'EditProfile.FirstNameLabel',
  'edit/last-name': 'Login.Register.LastName.Placeholder',
  'edit/bio': 'EditProfile.BioLabel',
  'edit/username': 'EditProfile.Username.Label',
  'notifications/private-chats/show': 'NotificationsForPrivateChats',
  'notifications/groups': 'NotificationsGroups',
  'notifications/groups/show': 'NotificationsForGroups',
  'notifications/channels/show': 'NotificationsForChannels',
  'notifications/new-contacts': 'ContactJoined',
  'privacy/calls/p2p': 'PrivacyP2PHeader',
  'privacy/2sv/change-email': 'TwoStepAuth.ChangeEmail',
  'privacy/passcode/change': 'PasscodeLock.ChangePasscode',
  'privacy/passcode/auto-lock': 'PasscodeLock.AutoLock',
  'privacy/messages/set-price': 'PaidMessages.SetPrice',
  'appearance/themes': 'ColorTheme',
  'appearance/stickers-and-emoji/emoji/suggest': 'GeneralSettings.EmojiPrediction'
};

/**
 * `.../never` and `.../always` open the privacy screen with its exception row
 * highlighted, the way tdesktop passes `privacy/never` as the control to show.
 * Which key that is depends on the screen (allow / share), so it is looked up
 * among the rows of the section the path lands on.
 */
const LINK_EXCEPTION_SUFFIXES = {
  '/never': /Never(Allow|Share)$/,
  '/always': /Always(Allow|Share)$/
};

const TITLE_PROPS = ['name', 'title', 'text', 'langKey', 'titleLangKey', 'label'];
// `typeText`, `nameTitle`, … name a control just as `title` does
const TITLE_PROP_SUFFIX = /(Text|Title)$/;
const I18N_CALLEES = new Set(['i18n', '_i18n', 'i18n_']);

// ─────────────────────────────────────────────────────────────────────────────
// parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

const parseFile = (file) => babel.parseSync(fs.readFileSync(file, 'utf8'), {
  filename: file,
  parserOpts: {plugins: ['jsx', ['typescript', {isTSX: true}], 'decorators-legacy'], sourceType: 'module'},
  configFile: false,
  babelrc: false
});

const walkNode = (node, visit) => {
  if(!node || typeof node !== 'object') return;
  if(typeof node.type === 'string' && visit(node) === false) return;
  for(const key in node) {
    if(key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const value = node[key];
    if(Array.isArray(value)) value.forEach((v) => walkNode(v, visit));
    else if(value && typeof value.type === 'string') walkNode(value, visit);
  }
};

const jsxName = (node) => {
  if(!node) return '';
  const n = node.type === 'JSXOpeningElement' ? node.name : node;
  if(n.type === 'JSXIdentifier') return n.name;
  if(n.type === 'JSXMemberExpression') return jsxName(n.object) + '.' + n.property.name;
  return '';
};

const stringAttr = (element, name) => {
  for(const a of element.openingElement.attributes) {
    if(a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier' || a.name.name !== name) continue;
    if(a.value?.type === 'StringLiteral') return a.value.value;
    if(a.value?.type === 'JSXExpressionContainer' && a.value.expression.type === 'StringLiteral') {
      return a.value.expression.value;
    }
  }
  return null;
};

const findDescendantElement = (element, name) => {
  let found = null;
  for(const child of element.children || []) {
    walkNode(child, (n) => {
      if(found) return false;
      if(n.type === 'JSXElement' && jsxName(n.openingElement) === name) {
        found = n;
        return false;
      }
    });
    if(found) break;
  }
  return found;
};

const findI18nKey = (node) => {
  if(Array.isArray(node)) {
    for(const item of node) {
      const found = findI18nKey(item);
      if(found) return found;
    }
    return null;
  }

  let found = null;
  walkNode(node, (n) => {
    if(found) return false;
    if(n.type === 'CallExpression' && n.callee.type === 'Identifier' && I18N_CALLEES.has(n.callee.name)) {
      const arg = n.arguments.find((a) => a.type === 'StringLiteral');
      if(arg) {
        found = arg.value;
        return false;
      }
    }
  });
  return found;
};

// ─────────────────────────────────────────────────────────────────────────────
// lang keys — the extractor only trusts literals that exist in the lang source
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level strings only: nested plural forms (`one_value`) are not keys, and a
 * pluralised entry is never a setting's title.
 */
const collectLangKeys = () => {
  const keys = new Map();
  for(const file of ['lang.ts', 'langSign.ts']) {
    babel.traverse(parseFile(path.join(SRC, file)), {
      VariableDeclarator(p) {
        if(p.node.id.type !== 'Identifier' || p.node.init?.type !== 'ObjectExpression') return;
        for(const prop of p.node.init.properties) {
          if(prop.type !== 'ObjectProperty' || prop.value.type !== 'StringLiteral') continue;
          const key = prop.key.type === 'StringLiteral' ? prop.key.value :
            prop.key.type === 'Identifier' ? prop.key.name : null;
          if(key) keys.set(key, prop.value.value);
        }
        p.skip();
      }
    });
  }
  return keys;
};

const LANG_KEYS = collectLangKeys();

/** Icon names, so a stray string literal can't be mistaken for one. */
const ICON_NAMES = (() => {
  const names = new Set();
  babel.traverse(parseFile(path.join(SRC, 'icons.ts')), {
    ObjectProperty(p) {
      const key = p.node.key;
      names.add(key.type === 'StringLiteral' ? key.value : key.name);
    }
  });
  return names;
})();

// A control's label is short. Anything sentence-length is a caption explaining
// the control underneath it, which would only add noise to the results.
const MAX_TITLE_LENGTH = 60;

const isLangKey = (value) => {
  if(typeof value !== 'string' || STOP_KEYS.has(value) || !LANG_KEYS.has(value)) return false;
  return LANG_KEYS.get(value).length <= MAX_TITLE_LENGTH;
};

// A template built from a list of keys names a whole family of strings; more
// than this and the pattern is too loose to be a row's title.
const MAX_TEMPLATE_KEYS = 40;
const MIN_TEMPLATE_LENGTH = 8;

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The keys a title expression can produce. A literal names one; a template names
 * every existing key of its shape (`LiteMode.Key.${key}.Title`), which is how
 * rows built from a list of keys — Power Saving's toggles — are indexed at all.
 */
const langKeysFromExpression = (node, fileLiterals) => {
  if(!node) return [];

  switch(node.type) {
    case 'StringLiteral':
      return isLangKey(node.value) ? [node.value] : [];

    case 'ConditionalExpression':
      return [
        ...langKeysFromExpression(node.consequent, fileLiterals),
        ...langKeysFromExpression(node.alternate, fileLiterals)
      ];

    case 'LogicalExpression':
      return [
        ...langKeysFromExpression(node.left, fileLiterals),
        ...langKeysFromExpression(node.right, fileLiterals)
      ];

    case 'TemplateLiteral': {
      const statics = node.quasis.map((quasi) => quasi.value.cooked);
      if(statics.join('').length < MIN_TEMPLATE_LENGTH) return [];

      // an interpolated part is one step of the key, never the whole tail, and it
      // has to be a value the file actually has — a commented-out row must not
      // bring its strings into the index
      const pattern = new RegExp('^' + statics.map(escapeForRegExp).join('([^.]*)') + '$');
      const matched = [...LANG_KEYS.keys()].filter((key) => {
        const match = pattern.exec(key);
        return match && match.slice(1).every((part) => fileLiterals.has(part)) && isLangKey(key);
      });

      return matched.length <= MAX_TEMPLATE_KEYS ? matched : [];
    }

    default:
      return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// the tab registry — every section the search can navigate to
// ─────────────────────────────────────────────────────────────────────────────

const resolveModule = (fromFile, spec) => {
  const base = spec.startsWith('.') ?
    path.resolve(path.dirname(fromFile), spec) :
    path.join(SRC, spec.replace(/^@\//, '').replace(/^@components\//, 'components/'));
  for(const candidate of [base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if(fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const collectTabs = () => {
  const tabs = new Map();
  babel.traverse(parseFile(TABS_FILE), {
    VariableDeclarator(p) {
      const {id, init} = p.node;
      if(id.type !== 'Identifier' || !init) return;

      // The declaration may be wrapped — `Object.assign(scaffoldSolidJSTab({...}), {...})`.
      let scaffoldCall = null;
      walkNode(init, (n) => {
        if(scaffoldCall) return false;
        if(n.type !== 'CallExpression') return;
        const callee = n.callee.type === 'CallExpression' ? n.callee.callee : n.callee;
        if(callee.type === 'Identifier' && callee.name.startsWith('scaffoldSolidJSTab')) {
          scaffoldCall = n;
          return false;
        }
      });
      if(!scaffoldCall) return;

      const options = scaffoldCall.arguments[0];
      if(options?.type !== 'ObjectExpression') return;

      let titleLangKey = null;
      let modulePath = null;
      for(const prop of options.properties) {
        if(prop.type !== 'ObjectProperty') continue;
        const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
        if(key === 'title' && prop.value.type === 'StringLiteral') titleLangKey = prop.value.value;
        else if(key === 'getComponentModule') {
          walkNode(prop.value, (n) => {
            if(modulePath) return false;
            if(n.type === 'ImportExpression' && n.source?.type === 'StringLiteral') modulePath = n.source.value;
            else if(n.type === 'CallExpression' && n.callee?.type === 'Import' && n.arguments[0]?.type === 'StringLiteral') {
              modulePath = n.arguments[0].value;
            }
          });
        }
      }

      const file = modulePath && resolveModule(TABS_FILE, modulePath);
      if(file) tabs.set(id.name, {titleLangKey, file});
    }
  });
  return tabs;
};

// ─────────────────────────────────────────────────────────────────────────────
// per-file extraction
// ─────────────────────────────────────────────────────────────────────────────

const relativeImports = (ast, file) => {
  const files = [];
  babel.traverse(ast, {
    ImportDeclaration(p) {
      const spec = p.node.source.value;
      if(!spec.startsWith('.')) return;
      const resolved = resolveModule(file, spec);
      if(resolved && HELPER_ROOTS.some((root) => resolved.startsWith(root))) files.push(resolved);
    }
  });
  return files;
};

/**
 * Pulls every searchable label out of one file, plus the tab constructors it
 * references (the section-tree edges) and the lang keys it pairs with a tab
 * constructor (alternative titles for that section, e.g. the Settings list uses
 * `AccountSettings.Notifications` for a tab titled `Telegram.Notification…`).
 */
const analyzeFile = (file, knownTabs) => {
  const ast = parseFile(file);

  // `clickable={onDevicesClick}` hides the tab it opens behind a handler, so the
  // file's own declarations are followed to find it.
  const locals = new Map();
  babel.traverse(ast, {
    VariableDeclarator(p) {
      if(p.node.id.type === 'Identifier' && p.node.init) locals.set(p.node.id.name, p.node.init);
    }
  });

  const tabsOpenedBy = (node, seen = new Set()) => {
    const found = new Set();
    const visit = (n) => {
      if(n.type !== 'Identifier') return;
      if(knownTabs.has(n.name)) found.add(n.name);
      else if(locals.has(n.name) && !seen.has(n.name)) {
        seen.add(n.name);
        for(const name of tabsOpenedBy(locals.get(n.name), seen)) found.add(name);
      }
    };

    // `walkNode` stops descending when a visitor returns false, so never do
    const visitor = (n) => {
      if(n.type === 'Identifier') visit(n);
    };

    if(Array.isArray(node)) node.forEach((item) => walkNode(item, visitor));
    else walkNode(node, visitor);
    return found;
  };
  const entries = [];
  const referenced = new Set();
  const backRefs = new Set();
  const aliases = new Map(); // tab name -> lang keys
  const icons = new Map(); // tab name -> the icon of the row that opens it
  const rowLinks = []; // rows that lead into a tab, resolved after the walk
  const captured = new Set();

  // every string the file spells out, so a templated key only expands over values
  // that are really there
  const fileLiterals = new Set();
  babel.traverse(ast, {
    StringLiteral(p) {
      fileLiterals.add(p.node.value);
    }
  });

  /**
   * Which menu a label is buried in, if any. The header menu (`ButtonMenuToggle`)
   * holds controls the search can point at by opening it; every other menu is a
   * context menu of a list row — nothing points at those, so they are skipped.
   */
  const menuKindOf = (p) => {
    for(let cur = p; cur; cur = cur.parentPath) {
      const node = cur.node;
      if(node.type !== 'CallExpression') continue;

      const callee = node.callee;
      const name = callee.type === 'Identifier' ? callee.name :
        callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : '';
      if(name.startsWith('ButtonMenu')) {
        return name.startsWith('ButtonMenuToggle') ? 'menu' : 'context';
      }
    }
  };

  const push = (kind, langKey, extra) => {
    if(!isLangKey(langKey) || captured.has(langKey)) return;
    captured.add(langKey);
    entries.push({kind, langKey, ...extra});
  };

  babel.traverse(ast, {
    Identifier(p) {
      if(knownTabs.has(p.node.name)) referenced.add(p.node.name);
    },

    CallExpression(p) {
      const callee = p.node.callee;
      const calleeName = callee.type === 'Identifier' ? callee.name :
        callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : '';

      // `sliceTabsUntilTab(AppSettingsTab)` walks back up the stack and `getTab`
      // only looks one up — neither opens anything.
      if(calleeName === 'sliceTabsUntilTab' || calleeName === 'closeTabsUntilTab' || calleeName === 'getTab') {
        for(const a of p.node.arguments) if(a.type === 'Identifier') backRefs.add(a.name);
        return;
      }

      // A call carrying both a tab and a label is a row leading into that section:
      // `makeSubTabConfig('bell_filled', 'AccountSettings.Notifications', Tab, …)`
      // and `addRow(key, i18n('PrivacyPhoneTitle'), () => createTab(Tab))` alike.
      const opened = tabsOpenedBy(p.node.arguments);
      if(opened.size) {
        const literals = p.node.arguments.filter((a) => a.type === 'StringLiteral').map((a) => a.value);
        rowLinks.push({
          icon: literals.find((v) => ICON_NAMES.has(v)),
          langKey: literals.find(isLangKey) || findI18nKey(p.node.arguments),
          opened
        });
      }

      if(!I18N_CALLEES.has(calleeName) || callee.type !== 'Identifier') return;

      const arg = p.node.arguments.find((a) => a.type === 'StringLiteral');
      if(!arg || !isLangKey(arg.value) || captured.has(arg.value)) return;
      if(DENY_KEY_SHAPE.test(arg.value)) return;

      for(let cur = p.parentPath; cur; cur = cur.parentPath) {
        const n = cur.node;
        if(n.type === 'CallExpression') {
          const c = n.callee;
          const name = c.type === 'Identifier' ? c.name :
            c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : '';
          if(DENY_CALLEES.test(name)) return;
        } else if(n.type === 'JSXAttribute' && n.name.type === 'JSXIdentifier' && DENY_PROPS.has(n.name.name)) {
          return;
        }
      }

      push('row', arg.value);
    },

    ObjectProperty(p) {
      const key = p.node.key.type === 'Identifier' ? p.node.key.name : p.node.key.value;

      // a row's context menu is never on the screen — see menuKindOf
      const menuKind = menuKindOf(p);
      if(menuKind === 'context') return;

      // `exceptionTexts: ['…NeverAllow', '…AlwaysAllow']` — the two rows every
      // privacy screen ends with, and what its `/never` and `/always` links open.
      if(key === 'exceptionTexts' && p.node.value.type === 'ArrayExpression') {
        for(const element of p.node.value.elements || []) {
          if(element?.type === 'StringLiteral') push('row', element.value);
        }
        return;
      }

      // a title handed to a component built from an options object, the way the
      // privacy screens are: `new PrivacySection({title: 'PrivacyP2PHeader'})`
      if(DENY_PROPS.has(key) || (!TITLE_PROPS.includes(key) && !TITLE_PROP_SUFFIX.test(key))) return;

      for(const langKey of langKeysFromExpression(p.node.value, fileLiterals)) {
        if(!DENY_KEY_SHAPE.test(langKey)) push(menuKind || 'row', langKey);
      }
    },

    // Option lists: `[['day', 'ThemeDay'], ...]` and `[{value, langKey}, ...]`,
    // including titles built by template from a list of keys.
    ArrayExpression(p) {
      // `ButtonMenuToggle({buttons: [...]})` — those controls are not on the
      // screen until the menu is opened, and the search has to open it to point
      // at one, the way tdesktop's `ShowLogOutMenu` does.
      const menuKind = menuKindOf(p);
      if(menuKind === 'context') return;

      const kind = menuKind || 'option';

      for(const element of p.node.elements || []) {
        if(!element) continue;
        if(element.type === 'ArrayExpression') {
          for(const item of element.elements || []) {
            if(item?.type === 'StringLiteral' && !DENY_KEY_SHAPE.test(item.value)) push(kind, item.value);
          }
        } else if(element.type === 'ObjectExpression') {
          for(const prop of element.properties) {
            if(prop.type !== 'ObjectProperty') continue;
            const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
            if(!TITLE_PROPS.includes(key)) continue;

            for(const langKey of langKeysFromExpression(prop.value, fileLiterals)) {
              if(!DENY_KEY_SHAPE.test(langKey)) push(kind, langKey);
            }
          }
        }
      }
    },

    JSXElement(p) {
      const element = p.node;
      const name = jsxName(element.openingElement);

      if(name === 'Section') {
        push('subsection', stringAttr(element, 'name'));
        return;
      }

      if(name === 'Row') {
        const iconElement = findDescendantElement(element, 'Row.Icon');
        const icon = iconElement && stringAttr(iconElement, 'icon');
        const titleElement = findDescendantElement(element, 'Row.Title');
        // children first: `titleRight={i18n('LanguageName')}` is the value on the
        // right ("English"), not what the row is called
        const langKey = titleElement && (findI18nKey(titleElement.children) || findI18nKey(titleElement));

        // A row that opens exactly one tab is how that section is pictured and
        // named in the list it is reached from — resolved once the whole file is
        // walked, so a back-navigation reference doesn't count as opening it.
        rowLinks.push({icon, langKey, opened: tabsOpenedBy(element)});

        if(!langKey) return; // dynamic title — a list item, not a setting
        const hasCheckbox = !!findDescendantElement(element, 'Row.CheckboxField') ||
          !!findDescendantElement(element, 'Row.CheckboxFieldToggle');
        push(hasCheckbox ? 'toggle' : 'row', langKey);
        return;
      }

      if(/^[A-Z]/.test(name)) {
        for(const attribute of element.openingElement.attributes) {
          if(attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;

          const prop = attribute.name.name;
          if(!TITLE_PROPS.includes(prop) && !TITLE_PROP_SUFFIX.test(prop)) continue;
          if(DENY_PROPS.has(prop)) continue;

          const value = stringAttr(element, prop);
          if(value && !DENY_KEY_SHAPE.test(value)) push('row', value);
        }
      }
    }
  });

  for(const {icon, langKey, opened} of rowLinks) {
    const forward = [...opened].filter((name) => !backRefs.has(name));
    if(forward.length !== 1) continue; // ambiguous — say nothing about any of them

    const [opensTab] = forward;
    if(icon && !icons.has(opensTab)) icons.set(opensTab, icon);
    if(langKey) {
      if(!aliases.has(opensTab)) aliases.set(opensTab, new Set());
      aliases.get(opensTab).add(langKey);
    }
  }

  return {ast, entries, aliases, icons, edges: new Set([...referenced].filter((n) => !backRefs.has(n)))};
};

// ─────────────────────────────────────────────────────────────────────────────
// build
// ─────────────────────────────────────────────────────────────────────────────

const build = () => {
  const tabs = collectTabs();
  const analyzed = new Map();
  const analyze = (file) => {
    if(!analyzed.has(file)) analyzed.set(file, analyzeFile(file, tabs));
    return analyzed.get(file);
  };

  for(const tab of tabs.values()) analyze(tab.file);

  // Reachability from Settings — everything else is a chat/community/folder tab.
  const parentOf = new Map();
  const sectionOrder = [];
  const seen = new Set([ROOT_TAB]);
  const queue = [ROOT_TAB];
  while(queue.length) {
    const current = queue.shift();
    sectionOrder.push(current);
    for(const child of analyze(tabs.get(current).file).edges) {
      if(!tabs.has(child) || seen.has(child)) continue;
      seen.add(child);
      parentOf.set(child, current);
      queue.push(child);
    }
  }

  // Helper modules: a file reached from exactly one section contributes its rows
  // to that section. Shared ones (privacy/privacyTab.tsx feeds ten sub-tabs)
  // would otherwise stamp the same generic labels onto every one of them.
  const helperOwners = new Map();
  for(const section of sectionOrder) {
    const visited = new Set([tabs.get(section).file]);
    let frontier = [tabs.get(section).file];
    for(let depth = 0; depth < HELPER_DEPTH; ++depth) {
      const next = [];
      for(const file of frontier) {
        for(const imported of relativeImports(analyze(file).ast, file)) {
          if(visited.has(imported) || tabs.has(imported)) continue;
          if([...tabs.values()].some((t) => t.file === imported)) continue;
          visited.add(imported);
          next.push(imported);
          if(!helperOwners.has(imported)) helperOwners.set(imported, new Set());
          helperOwners.get(imported).add(section);
        }
      }
      frontier = next;
    }
  }

  const sections = [];
  const entries = [];
  const entryIds = new Set();

  const addEntries = (sectionId, list) => {
    for(const entry of list) {
      const id = `${sectionId}:${entry.langKey}`;
      if(entryIds.has(id)) continue;
      entryIds.add(id);
      entries.push({id, sectionId, kind: entry.kind, titleLangKey: entry.langKey});
    }
  };

  for(const sectionId of sectionOrder) {
    const tab = tabs.get(sectionId);
    const analysis = analyze(tab.file);

    const aliasKeys = new Set();
    let icon;
    for(const other of sectionOrder) {
      const analysis = analyze(tabs.get(other).file);
      const found = analysis.aliases.get(sectionId);
      if(found) for(const key of found) if(key !== tab.titleLangKey) aliasKeys.add(key);
      icon ||= analysis.icons.get(sectionId);
    }

    sections.push({
      id: sectionId,
      parentId: parentOf.get(sectionId),
      titleLangKey: tab.titleLangKey,
      icon: icon || SECTION_ICONS[sectionId],
      aliasLangKeys: aliasKeys.size ? [...aliasKeys].sort() : undefined
    });

    addEntries(sectionId, analysis.entries);
  }

  for(const [file, owners] of helperOwners) {
    if(owners.size !== 1) continue;
    addEntries([...owners][0], analyze(file).entries);
  }

  entries.sort((a, b) => a.sectionId.localeCompare(b.sectionId) || a.titleLangKey.localeCompare(b.titleLangKey));
  return {sections, entries, links: collectLinks({sections, entries})};
};

// ─────────────────────────────────────────────────────────────────────────────
// deep links — the canonical `tg://settings/...` vocabulary, shared with the
// other clients. `src/scripts/in/settings-links.csv` holds the paths and, per
// path, where Web K is expected to land; the destination is matched against the
// sections and rows found above by their English text.
// ─────────────────────────────────────────────────────────────────────────────

const parseCsv = (text) => {
  const rows = [];
  let row = [], field = '', quoted = false;
  for(let i = 0; i < text.length; ++i) {
    const c = text[i];
    if(quoted) {
      if(c === '\"' && text[i + 1] === '\"') { field += '\"'; ++i; }
      else if(c === '\"') quoted = false;
      else field += c;
    } else if(c === '\"') quoted = true;
    else if(c === ',') { row.push(field); field = ''; }
    else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

// steps of the Web K column that are not settings destinations
const LINK_PATH_SKIP = new Set(['chat list', 'chat lis', 'hamburger', 'settings', 'three dots', 'pencil']);
const normalizeText = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const collectLinks = ({sections, entries}) => {
  if(!fs.existsSync(LINKS_FILE)) return [];

  // English text -> the keys that render it
  const byText = new Map();
  const addText = (key) => {
    const value = LANG_KEYS.get(key);
    if(!value) return;
    const text = normalizeText(value.replace(/\{.*?\}|%\d?\$?[sd@]|\*\*/g, ''));
    if(!byText.has(text)) byText.set(text, []);
    byText.get(text).push(key);
  };

  const sectionByKey = new Map();
  for(const section of sections) {
    for(const key of [section.titleLangKey, ...(section.aliasLangKeys || [])].filter(Boolean)) {
      addText(key);
      if(!sectionByKey.has(key)) sectionByKey.set(key, section.id);
    }
  }

  const entriesByKey = new Map();
  for(const entry of entries) {
    addText(entry.titleLangKey);
    if(!entriesByKey.has(entry.titleLangKey)) entriesByKey.set(entry.titleLangKey, []);
    entriesByKey.get(entry.titleLangKey).push(entry);
  }

  const childrenOf = new Map();
  for(const section of sections) {
    if(!section.parentId) continue;
    if(!childrenOf.has(section.parentId)) childrenOf.set(section.parentId, []);
    childrenOf.get(section.parentId).push(section.id);
  }
  const subtreeOf = (id, acc = new Set()) => {
    acc.add(id);
    for(const child of childrenOf.get(id) || []) subtreeOf(child, acc);
    return acc;
  };

  const links = [];
  for(const [link, destination] of parseCsv(fs.readFileSync(LINKS_FILE, 'utf8')).slice(1)) {
    if(!link) continue;

    const path = link.replace(/^tg:\/\/settings\/?/, '').replace(/\/$/, '');
    if(PROCESSOR_PATHS.has(path)) continue;

    const steps = destination.split('>')
    .map((step) => step.trim())
    .filter((step) => step && !LINK_PATH_SKIP.has(normalizeText(step)));

    // the longest prefix wins, so `edit/log-out` is not swallowed by `edit`
    const override = Object.keys(LINK_OVERRIDES)
    .filter((prefix) => path === prefix || path.startsWith(prefix + '/'))
    .sort((a, b) => b.length - a.length)[0];
    let sectionId = override ? LINK_OVERRIDES[override] : null;
    let highlight;

    for(const step of steps) {
      const keys = byText.get(normalizeText(step)) || [];

      // a step naming a section moves down the tree
      const asSection = keys.map((key) => sectionByKey.get(key)).find(Boolean);
      if(asSection && (!sectionId || subtreeOf(sectionId).has(asSection))) {
        sectionId = asSection;
        highlight = undefined;
        continue;
      }

      // otherwise it may name a row inside the section reached so far
      const scope = sectionId ? subtreeOf(sectionId) : null;
      for(const key of keys) {
        const entry = (entriesByKey.get(key) || []).find((e) => !scope || scope.has(e.sectionId));
        if(entry) {
          sectionId = entry.sectionId;
          highlight = key;
          break;
        }
      }
    }

    const explicit = LINK_HIGHLIGHTS[path];
    if(explicit && LANG_KEYS.has(explicit)) {
      // the control moves us into its own section when it is an indexed row, and
      // is taken on trust otherwise — it only has to name a label on the screen
      const entry = (entriesByKey.get(explicit) || [])
      .find((e) => !sectionId || subtreeOf(sectionId).has(e.sectionId));

      if(entry) sectionId = entry.sectionId;
      highlight = explicit;
    }

    const suffix = Object.keys(LINK_EXCEPTION_SUFFIXES).find((end) => path.endsWith(end));
    if(suffix && sectionId) {
      const pattern = LINK_EXCEPTION_SUFFIXES[suffix];
      const exception = entries.find((entry) => entry.sectionId === sectionId && pattern.test(entry.titleLangKey));
      if(exception) highlight = exception.titleLangKey;
    }

    if(sectionId) links.push({path, sectionId, highlight});
  }

  links.sort((a, b) => a.path.localeCompare(b.path));
  return links;
};

// ─────────────────────────────────────────────────────────────────────────────
// emit
// ─────────────────────────────────────────────────────────────────────────────

const serialize = (object, keys) => '{' + keys
  .filter((key) => object[key] !== undefined && object[key] !== null)
  .map((key) => {
    const value = object[key];
    return `${key}: ${Array.isArray(value) ? '[' + value.map((v) => `'${v}'`).join(', ') + ']' : `'${value}'`}`;
  })
  .join(', ') + '}';

const emit = ({sections, entries, links}) => {
  const lines = [
    '/* eslint-disable */',
    '// AUTO-GENERATED by src/scripts/generate_settings_search.js — do not edit.',
    '// Identifiers only: every visible string is resolved from the language pack at runtime.',
    '',
    'import type {GeneratedSettingsSearchData} from \'@lib/settingsSearch/types\';',
    '',
    'const generated: GeneratedSettingsSearchData = {',
    '  sections: [',
    ...sections.map((s) => '    ' + serialize(s, ['id', 'parentId', 'titleLangKey', 'icon', 'aliasLangKeys']) + ','),
    '  ],',
    '  entries: [',
    ...entries.map((e) => '    ' + serialize(e, ['id', 'sectionId', 'kind', 'titleLangKey']) + ','),
    '  ],',
    '  links: [',
    ...links.map((l) => '    ' + serialize(l, ['path', 'sectionId', 'highlight']) + ','),
    '  ]',
    '};',
    '',
    'export default generated;',
    ''
  ];
  return lines.join('\n');
};

const generate = () => {
  const data = build();
  const content = emit(data);
  const previous = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
  if(previous !== content) {
    fs.mkdirSync(path.dirname(OUT_FILE), {recursive: true});
    fs.writeFileSync(OUT_FILE, content, 'utf8');
  }
  return {...data, changed: previous !== content};
};

module.exports = {generate, build, emit, OUT_FILE, PROCESSOR_PATHS};

if(require.main === module) {
  const {sections, entries, links, changed} = generate();
  console.log(
    `settings search index: ${sections.length} sections, ${entries.length} entries, ` +
    `${links.length} links${changed ? '' : ' (unchanged)'}`
  );
}
