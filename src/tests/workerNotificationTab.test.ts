import '@helpers/peerIdPolyfill';
import type {TabState} from '@lib/apiManagerProxy';

// The shared worker hands a notification to one tab - the one that shows its
// account, or (notifications of all accounts on) whichever the user is in. A
// task posted to no tab in particular goes to every tab there is: each played
// the sound, bumped its title and showed it. (An incoming call's fallback:
// appCallsManagerCallUpdateRouting.test.ts.)

const settings = {notifyAllAccounts: true};
vi.mock('@lib/commonStateStorage', () => ({
  default: {get: async() => settings}
}));

const sent: {type: string, port: unknown}[] = [];
vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {
    getInstance: () => ({
      invokeVoid: (type: string, _payload: unknown, port?: unknown) => {
        sent.push({type, port});
      }
    })
  }
}));

import appTabsManager from '@appManagers/appTabsManager';
import {AppNotificationsManager} from '@appManagers/appNotificationsManager';

const ACCOUNT = 2;
const OTHER_ACCOUNT = 1;
const peerId = (100).toPeerId();

// * two tabs, both showing the other account
const tabs = [1, 2].map((id) => ({
  source: {name: `tab${id}`} as any as MessageEventSource,
  state: {id, accountNumber: OTHER_ACCOUNT, chatPeerIds: [], idleStartTime: id === 1 ? 0 : Date.now()} as TabState
}));

function makeNotificationsManager() {
  const manager: AppNotificationsManager = Object.create(AppNotificationsManager.prototype);
  Object.assign(manager, {
    getAccountNumber: () => ACCOUNT,
    appPeersManager: {isPeerRestricted: async() => false}
  });
  return manager;
}

describe('a message notification of an account no tab shows', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.spyOn(appTabsManager, 'getTabs').mockReturnValue(tabs as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('goes to the tab the user is in, with notifications of all accounts on', async() => {
    settings.notifyAllAccounts = true;
    await makeNotificationsManager().routeNotification(peerId, {message: {peerId}} as any, false);
    expect(sent).toEqual([{type: 'notificationBuild', port: tabs[0].source}]);
  });

  test('goes to no tab with them off, rather than to every tab', async() => {
    settings.notifyAllAccounts = false;
    await makeNotificationsManager().routeNotification(peerId, {message: {peerId}} as any, false);
    expect(sent).toEqual([]);
  });
});
