import {createRoot, createSignal} from 'solid-js';
import generated from './generated';
import {NON_NAVIGABLE_SECTIONS} from './openers';
import type {
  GeneratedSettingsEntry,
  GeneratedSettingsLink,
  GeneratedSettingsSearchData,
  GeneratedSettingsSection
} from './types';

export const ROOT_SECTION_ID = 'AppSettingsTab';

/**
 * Bumped whenever what is searchable changes — a hot-reloaded index during
 * development, or a new language pack at runtime. Everything derived from the
 * registry (the search index, an open results list) watches this to rebuild.
 */
const [version, setVersion] = createRoot(() => createSignal(0));
export const settingsSearchVersion = version;
export const bumpSettingsSearchVersion = () => setVersion((value) => value + 1);

let allSections = new Map<string, GeneratedSettingsSection>();
let sections = new Map<string, GeneratedSettingsSection>();
let entries: GeneratedSettingsEntry[] = [];
let links: GeneratedSettingsLink[] = [];

const chainOf = (sectionId: string) => {
  const chain: string[] = [];
  for(let current = sectionId; current; current = allSections.get(current)?.parentId) {
    if(chain.includes(current)) break; // a cycle would only come from a bad index
    chain.unshift(current);
  }
  return chain;
};

/** A section is searchable only when every step down to it can actually be opened. */
const isReachable = (sectionId: string) => chainOf(sectionId).every((id) => !NON_NAVIGABLE_SECTIONS.has(id));

const load = (data: GeneratedSettingsSearchData) => {
  allSections = new Map(data.sections.map((section) => [section.id, section]));
  sections = new Map(
    data.sections.filter((section) => isReachable(section.id)).map((section) => [section.id, section])
  );
  entries = data.entries.filter((entry) => sections.has(entry.sectionId));
  links = data.links.filter((link) => sections.has(link.sectionId));
};

load(generated);

if(import.meta.hot) {
  // The index is regenerated from the settings tabs on every edit; pick up the
  // new one in place instead of making the developer reload.
  import.meta.hot.accept('./generated', (newModule) => {
    if(!newModule) return;
    load((newModule as unknown as typeof import('./generated')).default);
    bumpSettingsSearchVersion();
  });
}

export const getSections = () => sections;
export const getEntries = () => entries;
export const getLinks = () => links;
export const getSection = (sectionId: string) => sections.get(sectionId);

/** Section ids from the root down to (and including) `sectionId`. */
export const getSectionChain = (sectionId: string) => chainOf(sectionId).filter((id) => sections.has(id));

/**
 * Titles of the sections a result lives under, root first. `includeSelf` is what
 * a row wants (`Privacy and Security > Blocked Users`); a section result drops
 * its own title, which is already the result's heading.
 */
export const getSectionPathKeys = (sectionId: string, includeSelf = true) => {
  const chain = getSectionChain(sectionId);
  const path = includeSelf ? chain : chain.slice(0, -1);
  return path
  // the search itself lives in Settings — saying so on every result adds nothing
  .filter((id) => id !== ROOT_SECTION_ID)
  .map((id) => sections.get(id).titleLangKey)
  .filter(Boolean);
};

export const getSectionDepth = (sectionId: string) => getSectionChain(sectionId).length;

