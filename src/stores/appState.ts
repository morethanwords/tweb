import {createRoot} from 'solid-js';
import {createStore, reconcile, SetStoreFunction, unwrap} from 'solid-js/store';
import {State} from '@config/state';
import rootScope from '@lib/rootScope';

const [appState, _setAppState] = createRoot(() => createStore<State>({} as any));

const setAppState: SetStoreFunction<State, Promise<void>> = (...args: any[]) => {
  const key = args[0];
  // @ts-ignore
  _setAppState(...args);
  // @ts-ignore
  return rootScope.managers.appStateManager.setByKey(key, unwrap(appState[key]));
};

const setAppStateSilent = (key: any, value?: any) => {
  if(typeof(key) === 'object') {
    _setAppState(key);
    return;
  }

  _setAppState(key, reconcile(value));
};

// * the whole state of another account, when the tab switches to it
const replaceAppStateSilent = (state: State) => {
  _setAppState(reconcile(state));
};

const useAppState = () => [appState, setAppState] as const;

const useAppConfig = () => appState.appConfig;

const useIsFrozen = () => !!useAppConfig().freeze_since_date;

export {
  appState,
  useAppState,
  setAppState,
  setAppStateSilent,
  replaceAppStateSilent,
  useAppConfig,
  useIsFrozen
};
