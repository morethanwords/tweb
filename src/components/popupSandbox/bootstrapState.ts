/*
 * Side-effect module: builds the mock managers and merges the fixtures into the app's state.
 *
 * Everything here is ADDITIVE, because the sandbox has two homes:
 *  - `?popups=1`, where the app never booted and the stores and mirrors are empty;
 *  - `showPopupSandbox()` inside a live, signed-in session, where they are full of real data that
 *    must survive untouched.
 * So the fixture peers and messages are merged in one key at a time (never as a whole-mirror
 * snapshot), and the stores are only seeded when nobody has filled them yet.
 *
 * In the standalone case this must also run BEFORE the popup modules are pulled in: several read
 * `appState` while their own module body evaluates (`stores/contentSettings.ts` builds memos inside
 * a module-scope `createRoot`), and a memo that throws on first read stays stale forever. That is
 * why every sandbox module that reaches into the app imports this one first.
 */

import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {setAppSettingsSilent} from '@stores/appSettings';
import {appState, setAppStateSilent} from '@stores/appState';
import {SETTINGS_INIT, STATE_INIT} from '@config/state';
import {IS_POPUP_SANDBOX} from '@config/debug';
import {createMockManagers, mockAppConfig} from './mockManagers';
import {messages, peers, selfUser, SELF_PEER_ID} from './fixtures';

export const mockManagers = createMockManagers();

/**
 * `mirrors` is worker-fed state; there is no worker feeding it the fixtures, so push them through
 * the same handler the worker's messages land in rather than reaching into the private field. With
 * a `key` the handler merges into the mirror instead of replacing it — which is what keeps a live
 * session's cached peers and messages intact.
 */
function seedMirror(name: string, key: string, value: any) {
  (apiManagerProxy as any).onMirrorTask({
    name,
    key,
    value,
    accountNumber: getCurrentAccount()
  });
}

function seedFixtureMirrors() {
  for(const peerId in peers) {
    seedMirror('peers', peerId, peers[peerId]);
  }

  const globalKey = apiManagerProxy.getGlobalHistoryMessagesStorage();
  for(const message of messages) {
    // The proxy reroutes legacy (private-chat) mids to the global storage on read, so mirror into
    // both — the fixture itself stays a single object either way.
    for(const storageKey of [apiManagerProxy.getHistoryMessagesStorage(message.peerId), globalKey]) {
      seedMirror('messages', joinDeepPath(storageKey, message.mid), message);
    }
  }
}

/**
 * True when the app booted normally and owns the stores, the theme and the language pack.
 *
 * Taken from the entry point rather than sniffed off the stores: this module is evaluated lazily,
 * on the first `showPopupSandbox()`, and a store-shape guess (`appSettings.themes`) is a race — on a
 * login page it can still be empty, and the standalone branch below would then overwrite the running
 * app's settings, state and managers with fixtures and never put them back.
 */
export const isLiveSession = !IS_POPUP_SANDBOX;

if(!isLiveSession) {
  rootScope.managers = mockManagers.managers;
  rootScope.myId = SELF_PEER_ID;
  rootScope.premium = !!selfUser.pFlags.premium;

  setAppSettingsSilent(SETTINGS_INIT);
  setAppStateSilent({...STATE_INIT, appConfig: mockAppConfig});
} else if(!appState.appConfig) {
  // A live session that has not received its app config yet: the popups read it synchronously.
  setAppStateSilent('appConfig', mockAppConfig);
}

seedFixtureMirrors();
