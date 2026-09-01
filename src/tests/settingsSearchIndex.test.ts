import {readFileSync} from 'fs';
import {resolve} from 'path';
import {createRequire} from 'module';
import {describe, expect, it} from 'vitest';
import generated from '@lib/settingsSearch/generated';
import lang from '../lang';
import langSign from '../langSign';

const require = createRequire(import.meta.url);

describe('settings search index', () => {
  const sectionIds = new Set(generated.sections.map((section) => section.id));

  it('is up to date with the settings tabs', () => {
    // The index is derived, not authored — a stale checked-in copy would ship a
    // search that points at rows the tabs no longer have.
    const {build, emit, OUT_FILE} = require('../scripts/generate_settings_search.js');

    expect(readFileSync(OUT_FILE, 'utf8')).toBe(emit(build()));
  });

  it('holds identifiers only, never user-visible text', () => {
    // Everything shown to the user has to come from the language pack at runtime,
    // otherwise switching languages would search stale English strings.
    const strings: Record<string, unknown> = {...lang, ...langSign};

    for(const entry of generated.entries) {
      expect(strings, `entry ${entry.id}`).toHaveProperty(entry.titleLangKey);
    }

    for(const section of generated.sections) {
      for(const key of [section.titleLangKey, ...(section.aliasLangKeys || [])].filter(Boolean)) {
        expect(strings, `section ${section.id}`).toHaveProperty(key);
      }
    }
  });

  it('gives every entry a unique id inside an existing section', () => {
    const ids = new Set<string>();
    for(const entry of generated.entries) {
      expect(ids.has(entry.id), `duplicate ${entry.id}`).toBe(false);
      ids.add(entry.id);
      expect(sectionIds.has(entry.sectionId), `unknown section ${entry.sectionId}`).toBe(true);
    }
  });

  it('forms one tree rooted at the Settings tab', () => {
    const roots = generated.sections.filter((section) => !section.parentId);
    expect(roots.map((section) => section.id)).toEqual(['AppSettingsTab']);

    for(const section of generated.sections) {
      if(section.parentId) expect(sectionIds.has(section.parentId)).toBe(true);

      const seen = new Set<string>();
      let current = section;
      while(current?.parentId) {
        expect(seen.has(current.id), `cycle at ${current.id}`).toBe(false);
        seen.add(current.id);
        current = generated.sections.find((other) => other.id === current.parentId);
      }
    }
  });

  it('addresses every settings link the clients share', () => {
    // `src/scripts/in/settings-links.csv` is the vocabulary; a path naming no
    // screen of the tree opens through a case in internalLinkProcessor instead,
    // and the generator keeps that list — so a dropped link cannot pass unnoticed.
    const {PROCESSOR_PATHS: handledByTheProcessor} = require('../scripts/generate_settings_search.js');

    const csv = readFileSync(resolve(__dirname, '../scripts/in/settings-links.csv'), 'utf8');
    const paths = csv.split('\n').slice(1).filter(Boolean)
    .map((line) => line.split(',')[0].replace(/^tg:\/\/settings\/?/, '').replace(/\/$/, ''));

    const addressed = new Set(generated.links.map((link) => link.path));
    for(const path of paths) {
      expect(addressed.has(path) || handledByTheProcessor.has(path), `unaddressed ${path}`).toBe(true);
    }
  });

  it('points every link at a section that can open it', () => {
    const seen = new Set<string>();
    for(const link of generated.links) {
      expect(seen.has(link.path), `duplicate ${link.path}`).toBe(false);
      seen.add(link.path);
      expect(sectionIds.has(link.sectionId), `unknown section in ${link.path}`).toBe(true);

      // the highlight names a label on the screen; most are indexed rows, the
      // rest are controls the table points at explicitly
      if(link.highlight) {
        expect({...lang, ...langSign}, `unknown string in ${link.path}`).toHaveProperty(link.highlight);
      }
    }
  });

  it('covers the settings a user would look for', () => {
    const byKey = new Set(generated.entries.map((entry) => entry.titleLangKey));
    for(const key of ['ChatBackground', 'BlockedUsers', 'TwoStepVerification', 'AutoDeleteMessages', 'TextSize']) {
      expect(byKey.has(key as any), `missing ${key}`).toBe(true);
    }
  });
});
