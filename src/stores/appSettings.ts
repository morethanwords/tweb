import {createRoot} from 'solid-js';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import {State, StateSettings} from '../config/state';
import rootScope from '../lib/rootScope';
import {joinDeepPath} from '../helpers/object/setDeepProperty';

const [appSettings, _setAppSettings] = createRoot(() => createStore<StateSettings>({} as any));

const setAppSettings: typeof _setAppSettings = (...args: any[]) => {
  const key = args[0];
  // @ts-ignore
  _setAppSettings(...args);
  // @ts-ignore
  rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', key), unwrap(appSettings[key]));
};

const setAppSettingsSilent = (key: any, value?: any) => {
  if(typeof(key) === 'object') {
    _setAppSettings(key);
    return;
  }

  _setAppSettings(key, reconcile(value));
};

const useAppSettings = () => [appSettings, setAppSettings] as const;

export {
  appSettings,
  useAppSettings,
  setAppSettings,
  setAppSettingsSilent
};
