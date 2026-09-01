import SearchIndex from '@lib/searchIndex';
import I18n, {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {
  bumpSettingsSearchVersion,
  getEntries,
  getSectionChain,
  getSectionDepth,
  getSectionPathKeys,
  getSections,
  ROOT_SECTION_ID,
  settingsSearchVersion
} from './registry';
import type {SettingsSearchEntryKind} from './types';

/**
 * Synonyms live in the language pack, not in the build-time index: a row titled
 * `K` picks up `K.SearchKeywords` when the pack has it — a list separated by
 * commas or newlines, as iOS writes its `SettingsSearch_Synonyms_*`. That is what
 * makes keywords translatable: they travel with the rest of the strings and
 * change with the language, without a rebuild.
 */
const KEYWORDS_SUFFIX = '.SearchKeywords';
const KEYWORDS_SEPARATOR = /[,\n]/;

export type SettingsSearchItem = {
  id: string,
  /** Section to navigate to. */
  sectionId: string,
  titleLangKey: LangPackKey,
  /** Label to scroll to and flash inside the section; absent when the result IS the section. */
  anchorLangKey?: LangPackKey,
  kind: SettingsSearchEntryKind | 'section',
  /** Top-level section the result belongs to; absent for the Settings list itself. */
  categoryLangKey?: LangPackKey,
  /** Pictures that category — drawn on the first result of each run, as on iOS. */
  categoryIcon?: Icon,
  pathKeys: LangPackKey[]
};

let items: Map<string, SettingsSearchItem>;
let index: SearchIndex<string>;
let titles: Map<string, string>;

/**
 * `I18n.format` echoes the key back when the pack has no string for it, and some
 * strings legitimately read like their key (`Animations`) — so ask the pack
 * whether it knows the key instead of comparing the result to it.
 */
const resolve = (key: LangPackKey) => I18n.strings.has(key) ? I18n.format(key, true) : '';

const resolveKeywords = (key: LangPackKey) => {
  const value = resolve((key + KEYWORDS_SUFFIX) as LangPackKey);
  return value ? value.split(KEYWORDS_SEPARATOR).map((keyword) => keyword.trim()).filter(Boolean) : [];
};

/** The top-level section a result lives under — its category, the way iOS groups them. */
const getCategory = (sectionId: string) => {
  const [, category] = getSectionChain(sectionId);
  const section = category && getSections().get(category);
  return {categoryLangKey: section?.titleLangKey, categoryIcon: section?.icon};
};

const build = () => {
  items = new Map();
  titles = new Map();
  index = new SearchIndex<string>({clearBadChars: true, latinize: true, ignoreCase: true});

  const add = (item: SettingsSearchItem, extraKeys: LangPackKey[]) => {
    if(!item.titleLangKey) return;

    const title = resolve(item.titleLangKey);
    if(!title) return; // the pack has nothing to show — nothing to search either

    items.set(item.id, item);
    titles.set(item.id, title);

    const searchable = [title, ...resolveKeywords(item.titleLangKey)];
    for(const key of extraKeys) {
      const alias = resolve(key);
      if(alias) searchable.push(alias);
      searchable.push(...resolveKeywords(key));
    }

    index.indexObjectArray(item.id, searchable);
  };

  for(const section of getSections().values()) {
    if(section.id === ROOT_SECTION_ID) continue;
    add({
      id: 'section:' + section.id,
      sectionId: section.id,
      titleLangKey: section.titleLangKey,
      kind: 'section',
      ...getCategory(section.id),
      pathKeys: getSectionPathKeys(section.id, false)
    }, section.aliasLangKeys || []);
  }

  // A label that repeats a section's own name says nothing the section result
  // does not: the row that opens it from the parent, and the header it repeats
  // inside itself. Keep the section — it navigates there — and drop both.
  const sectionLabels = new Set<string>();
  for(const section of getSections().values()) {
    for(const key of [section.titleLangKey, ...(section.aliasLangKeys || [])].filter(Boolean)) {
      sectionLabels.add(section.parentId + ':' + key);
      sectionLabels.add(section.id + ':' + key);
    }
  }

  // The row that opens a section often carries a key of its own — a screen titled
  // `TwoStepVerificationTitle` is opened by a row titled `TwoStepVerification` —
  // so the same repetition has to be caught by what the user reads, not by the key.
  const childLabels = new Map<string, Set<string>>();
  for(const section of getSections().values()) {
    if(!section.parentId) continue;

    let labels = childLabels.get(section.parentId);
    if(!labels) childLabels.set(section.parentId, labels = new Set());

    for(const key of [section.titleLangKey, ...(section.aliasLangKeys || [])].filter(Boolean)) {
      const label = resolve(key);
      if(label) labels.add(label.toLowerCase());
    }
  }

  const sameLabel = (a: string, b: string) => !!a && a.toLowerCase() === b?.toLowerCase();

  for(const entry of getEntries()) {
    if(sectionLabels.has(entry.sectionId + ':' + entry.titleLangKey)) continue;

    const title = resolve(entry.titleLangKey);

    // the row leading into a section of its own, whatever key it is written with
    if(title && childLabels.get(entry.sectionId)?.has(title.toLowerCase())) continue;

    // …and a different key that reads the same as the section it lives in
    // (`Active sessions` under `Active Sessions`) is that same repetition
    if(sameLabel(title, resolve(getSections().get(entry.sectionId).titleLangKey))) continue;

    add({
      id: entry.id,
      sectionId: entry.sectionId,
      titleLangKey: entry.titleLangKey,
      anchorLangKey: entry.titleLangKey,
      kind: entry.kind,
      ...getCategory(entry.sectionId),
      pathKeys: getSectionPathKeys(entry.sectionId)
    }, []);
  }
};

let builtVersion = -1;

const ensureBuilt = () => {
  const version = settingsSearchVersion();
  if(items && builtVersion === version) return;

  build();
  builtVersion = version;
};

// Titles and keywords both come from the language pack, so a new pack means a
// new index — including keywords a translator added for a language we ship no
// English fallback for.
rootScope.addEventListener('language_change', bumpSettingsSearchVersion);
rootScope.addEventListener('language_apply', bumpSettingsSearchVersion);

/**
 * Ranks a title-first: whole-title prefix beats a match somewhere inside, and
 * shallower sections beat deeper ones — a top-level row should never sit under a
 * row three tabs down that happens to sort earlier.
 */
const scoreOf = (id: string, query: string) => {
  const title = titles.get(id).toLowerCase();
  if(title.startsWith(query)) return 0;
  return title.includes(query) ? 1 : 2;
};

export function searchSettings(query: string): SettingsSearchItem[] {
  ensureBuilt();

  const trimmed = query.trim();
  if(!trimmed) return [];

  const lowerCased = trimmed.toLowerCase();
  const found = [...index.search(trimmed)];

  const ranked = found
  .map((id) => {
    const item = items.get(id);
    return {
      id,
      score: scoreOf(id, lowerCased),
      // a section outranks the rows inside it — "Notifications" before its toggles
      isSection: item.kind === 'section' ? 0 : 1,
      depth: getSectionDepth(item.sectionId)
    };
  })
  .sort((a, b) => {
    return a.score - b.score ||
      a.isSection - b.isSection ||
      a.depth - b.depth ||
      titles.get(a.id).localeCompare(titles.get(b.id));
  })
  .map(({id}) => items.get(id));

  // Same-category results end up in one run, categories ordered by their best
  // match — that run is what the list draws under a single category icon, led by
  // the section itself the way iOS lists a category before its items.
  const runs: Map<LangPackKey, SettingsSearchItem[]> = new Map();
  for(const item of ranked) {
    const run = runs.get(item.categoryLangKey) || runs.set(item.categoryLangKey, []).get(item.categoryLangKey);
    run.push(item);
  }

  // sections keep their rank order among themselves, ahead of the rows
  return [...runs.values()]
  .map((run) => run.filter((item) => item.kind === 'section').concat(run.filter((item) => item.kind !== 'section')))
  .flat();
}

/** What the list shows before anything is typed. */
export function getSettingsSearchSuggestions(recentIds: string[]): SettingsSearchItem[] {
  ensureBuilt();
  return recentIds.map((id) => items.get(id)).filter(Boolean);
}

export function getSettingsSearchTitle(item: SettingsSearchItem) {
  ensureBuilt();
  return titles.get(item.id) || '';
}

const PATH_SEPARATOR = ' › ';

/**
 * The whole way down to the result — `Appearance › Chat Wallpaper` for Set a
 * Color — the way iOS spells its breadcrumbs out on every row.
 */
export function getSettingsSearchPath(item: SettingsSearchItem) {
  return item.pathKeys.map(resolve).filter(Boolean).join(PATH_SEPARATOR);
}
