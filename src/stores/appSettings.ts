import {createRoot} from 'solid-js';
import {createStore, SetStoreFunction, unwrap} from 'solid-js/store';
import {StateSettings} from '@config/state';
import rootScope from '@lib/rootScope';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import getDeepProperty from '@helpers/object/getDeepProperty';

const [appSettings, _setAppSettings] = createRoot(() => createStore<StateSettings>({} as any));

let silent = false;
const setAppSettings: SetStoreFunction<StateSettings, Promise<void>> = (...args: any[]) => {
  const keys = args.slice(0, -1);
  // @ts-ignore
  _setAppSettings(...args);
  const newValue = getDeepProperty(unwrap(appSettings), keys);

  if(silent) {
    return Promise.resolve();
  }

  return rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', ...keys), newValue);
};

const setAppSettingsSilent = (...args: any[]) => {
  const key = args[0];
  if(typeof(key) === 'object') {
    _setAppSettings(key);
    return;
  }

  silent = true;
  // @ts-ignore
  setAppSettings(...args);
  silent = false;
};

const useAppSettings = () => [appSettings, setAppSettings] as const;

export {
  appSettings,
  useAppSettings,
  setAppSettings,
  setAppSettingsSilent
};
