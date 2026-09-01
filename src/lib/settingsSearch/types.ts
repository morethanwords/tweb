import type {LangPackKey} from '@lib/langPack';

/**
 * `subsection` is a section header inside a tab, `option` is a choice in a radio
 * list, `menu` is an item of the tab's header menu, `toggle` is a row carrying a
 * checkbox, `row` is everything else.
 */
export type SettingsSearchEntryKind = 'row' | 'toggle' | 'option' | 'menu' | 'subsection';

/** A settings tab. `id` is the tab's export name in `solidJsTabs/tabs.ts`. */
export type GeneratedSettingsSection = {
  id: string,
  parentId?: string,
  /** Absent when the tab titles itself from its payload (wizard steps, editors). */
  titleLangKey?: LangPackKey,
  /** The icon of the row that opens this section, used to picture its category. */
  icon?: Icon,
  /** Other names the same section is shown under (the Settings list uses its own labels). */
  aliasLangKeys?: LangPackKey[]
};

export type GeneratedSettingsEntry = {
  id: string,
  sectionId: string,
  kind: SettingsSearchEntryKind,
  titleLangKey: LangPackKey
};

/**
 * The build-time index. Identifiers only — titles and keywords are resolved from
 * the active language pack at runtime, so a language switch (or a server-side
 * lang pack update) re-indexes without a rebuild.
 */
/** One `tg://settings/<path>` address and what it opens. */
export type GeneratedSettingsLink = {
  path: string,
  sectionId: string,
  /** Row to flash inside that section. */
  highlight?: LangPackKey
};

export type GeneratedSettingsSearchData = {
  sections: GeneratedSettingsSection[],
  entries: GeneratedSettingsEntry[],
  links: GeneratedSettingsLink[]
};

export type SettingsSearchResult = {
  entry: GeneratedSettingsEntry,
  /** Section chain from the root, e.g. `Privacy and Security > Blocked Users`. */
  path: string
};
