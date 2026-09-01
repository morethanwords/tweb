import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'fs';
import {join} from 'path';

/*
 * The popup sandbox is only worth as much as its coverage, and a popup added without a story is
 * invisible until someone happens to look for it. This walks `components/popups` and fails when a
 * module that can open a popup has no story referencing it.
 *
 * Adding a popup? Add a story in `components/popupSandbox/stories/` (see AGENTS.md → Popup sandbox).
 */

const POPUPS_DIR = 'src/components/popups';
const STORIES_DIR = 'src/components/popupSandbox/stories';

/** `export [default] [async] class Popup…` / `function show…|open…` — how a popup is opened. */
const ENTRY = /^export\s+(?:default\s+)?(?:async\s+)?(?:class\s+(\w*Popup\w*)|function\s+(show\w+|open\w+|create\w*Popup\w*)|const\s+(show\w+))/gm;

/**
 * Modules a story reaches without importing them by path. Keep the reason with the entry — an empty
 * reason is how this list turns into a place to hide gaps.
 */
const REACHED_INDIRECTLY: {[file: string]: string} = {
  'aiEditorPopup/aiEditorPopup.tsx': 'the `aiEditor` story imports the folder index, which re-exports it',
  'starsPay.tsx': 'the `payment/starsPay` story goes through `PopupPayment.create`, which picks it for a Stars form',
  'index.ts': 'the popup base class, not a popup',
  'indexTsx.tsx': 'the popup base component, not a popup'
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if(statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('popup sandbox coverage', () => {
  const storySource = readdirSync(STORIES_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => readFileSync(join(STORIES_DIR, name), 'utf8'))
  .join('\n');

  const modulesWithEntries = walk(POPUPS_DIR).filter((path) => {
    ENTRY.lastIndex = 0;
    return ENTRY.test(readFileSync(path, 'utf8'));
  });

  it('finds the popups to check', () => {
    // A regex that silently stops matching would make every assertion below pass.
    expect(modulesWithEntries.length).toBeGreaterThan(50);
  });

  it('has a story for every popup', () => {
    const missing = modulesWithEntries.filter((path) => {
      const relative = path.slice(POPUPS_DIR.length + 1);
      if(relative in REACHED_INDIRECTLY) return false;

      const importPath = '@components/popups/' + relative.replace(/\.tsx?$/, '').replace(/\/index$/, '');
      return !storySource.includes(`'${importPath}'`);
    });

    expect(missing, `no popup sandbox story imports:\n${missing.join('\n')}`).toEqual([]);
  });

  it('does not carry stale entries in the indirect-reach list', () => {
    const known = modulesWithEntries.map((path) => path.slice(POPUPS_DIR.length + 1));
    const stale = Object.keys(REACHED_INDIRECTLY).filter((file) => !known.includes(file));
    expect(stale, `these no longer exist or no longer export a popup:\n${stale.join('\n')}`).toEqual([]);
  });
});

/*
 * A story renders from either source — the fixtures, or a signed-in session's own data — because it
 * asks `ctx` for a peer/message/gift instead of importing one. A story that reaches into
 * `fixtures.ts` from its `open()` body cannot do that, and must say so with `fixtureOnly: true`, or
 * live mode silently shows made-up data while claiming to show the account's own.
 */
describe('popup sandbox live-readiness', () => {
  const storyFiles = readdirSync(STORIES_DIR).filter((name) => name.endsWith('.ts') && name !== 'index.ts');

  /** Splits a story file into one text block per story, keyed by id. */
  function readStories(source: string) {
    const blocks = source.split(/\n(?=  \{\n(?:    \/\/[^\n]*\n)*    id: ')/);
    return blocks.map((block) => {
      const id = /^    id: '([^']+)'/m.exec(block)?.[1];
      const openAt = block.indexOf('    open:');
      return id && openAt !== -1 && {
        id,
        fixtureOnly: /^    fixtureOnly: true,/m.test(block),
        openBody: block.slice(openAt),
        block
      };
    }).filter(Boolean) as Array<{id: string, fixtureOnly: boolean, openBody: string, block: string}>;
  }

  it.each(storyFiles)('%s marks every fixture-bound story', (file) => {
    const source = readFileSync(join(STORIES_DIR, file), 'utf8');
    const imported = /import \{([^}]*)\} from '\.\.\/fixtures';/.exec(source);
    const names = imported ? imported[1].split(',').map((name) => name.trim()).filter(Boolean) : [];

    // Constants that describe no data of their own — a timestamp is the same in both sources.
    const neutral = new Set(['NOW']);
    const dataNames = names.filter((name) => !neutral.has(name));

    const unmarked = readStories(source)
    .filter((story) => !story.fixtureOnly)
    .filter((story) => dataNames.some((name) => new RegExp(`\\b${name}\\b`).test(story.openBody)))
    .map((story) => story.id);

    expect(
      unmarked,
      `these build their popup from a fixture but are not marked fixtureOnly:\n${unmarked.join('\n')}`
    ).toEqual([]);
  });

  it('has no fixtureOnly marks that are no longer needed', () => {
    const stale: string[] = [];

    for(const file of storyFiles) {
      const source = readFileSync(join(STORIES_DIR, file), 'utf8');
      const imported = /import \{([^}]*)\} from '\.\.\/fixtures';/.exec(source);
      const names = (imported ? imported[1].split(',').map((name) => name.trim()) : []).filter(Boolean);

      for(const story of readStories(source)) {
        if(!story.fixtureOnly) continue;
        // The whole block, not just `open()`: a story whose canned manager answers are fixtures is
        // fixture-bound too, since live mode drops those answers.
        const usesFixture = names.some((name) => new RegExp(`\\b${name}\\b`).test(story.block));
        // Inline literals count as well — a hand-built payment form is fixture data with no import.
        const looksSynthetic = usesFixture ||
          /_: '/.test(story.block) ||
          /localhost|location\.origin|'sandbox-/.test(story.block);
        if(!looksSynthetic) stale.push(story.id);
      }
    }

    expect(stale, `fixtureOnly no longer justified:\n${stale.join('\n')}`).toEqual([]);
  });
});
