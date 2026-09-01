import type {LangPackKey} from '@lib/langPack';
import {getLinks, settingsSearchVersion} from './registry';
import type {GeneratedSettingsLink} from './types';
import type {SettingsSearchItem} from './index';

/**
 * `tg://settings/<path>` — the vocabulary the other clients speak, kept in
 * `src/scripts/in/settings-links.csv` and resolved against the index at build
 * time. A row with no address of its own is reached through its section's,
 * `?highlight=<key>`, the way tdesktop falls back.
 */
const PREFIX = 'tg://settings';

let byTarget: Map<string, GeneratedSettingsLink>;
let indexedVersion = -1;
const targetKey = (sectionId: string, highlight?: LangPackKey) => sectionId + ':' + (highlight || '');

const index = () => {
  // a hot-reloaded index is a different set of links
  const version = settingsSearchVersion();
  if(!byTarget || indexedVersion !== version) {
    indexedVersion = version;
    byTarget = new Map();
    for(const link of getLinks()) {
      const key = targetKey(link.sectionId, link.highlight);
      // the shortest path wins — `privacy` over `privacy/blocked/block-user`
      const known = byTarget.get(key);
      if(!known || known.path.length > link.path.length) byTarget.set(key, link);
    }
  }

  return byTarget;
};

export function getSettingsLink(item: SettingsSearchItem) {
  const exact = index().get(targetKey(item.sectionId, item.anchorLangKey));
  if(exact) return PREFIX + (exact.path ? '/' + exact.path : '');

  const section = index().get(targetKey(item.sectionId));
  if(!section) return; // nothing addressable — the row has no link to copy

  return PREFIX + (section.path ? '/' + section.path : '') +
    (item.anchorLangKey ? '?highlight=' + encodeURIComponent(item.anchorLangKey) : '');
}

export const findSettingsLink = (path: string) => getLinks().find((link) => link.path === path);
