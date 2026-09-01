import {appSettings, setAppSettings} from '@stores/appSettings';

const MAX_RECENT = 5;

export const getRecentSettingsSearch = () => appSettings.settingsSearchRecent || [];

export function bumpRecentSettingsSearch(id: string) {
  const next = [id, ...getRecentSettingsSearch().filter((recent) => recent !== id)].slice(0, MAX_RECENT);
  setAppSettings('settingsSearchRecent', next);
}

export function removeRecentSettingsSearch(id: string) {
  setAppSettings('settingsSearchRecent', getRecentSettingsSearch().filter((recent) => recent !== id));
}
