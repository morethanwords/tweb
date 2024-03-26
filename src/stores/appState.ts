import {createRoot} from 'solid-js';
import {createStore, unwrap} from 'solid-js/store';
import {State} from '../config/state';
import rootScope from '../lib/rootScope';

const [appState, _setAppState] = createRoot(() => createStore<State>({} as any));

const setAppState: typeof _setAppState = (...args: any[]) => {
  const key = args[0];
  // @ts-ignore
  _setAppState(...args);
  // @ts-ignore
  rootScope.managers.appStateManager.setByKey(key, unwrap(appState[key]));
};

const setAppStateSilent = _setAppState;

const useAppState = () => appState;

export {
  appState,
  useAppState,
  setAppState,
  setAppStateSilent
};
