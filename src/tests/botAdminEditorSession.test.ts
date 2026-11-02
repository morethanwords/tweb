import '@helpers/peerIdPolyfill';
import type {Chat} from '@layer';

/*
 * The admin rights editor a bot is offered in opens for the account the offer was made in: when the tab has
 * switched to another account by the time the bot's place in the chat is known, it is not opened over that one.
 */

const mocks = vi.hoisted(() => ({
  openUserPermissionsTab: vi.fn(),
  leaving: false
}));

vi.mock('@lib/accounts/getCurrentAccount', async(importOriginal) => ({
  ...await importOriginal<typeof import('@lib/accounts/getCurrentAccount')>(),
  getManagersSession: () => ({accountNumber: 1, ended: false}),
  isSessionLeaving: () => mocks.leaving
}));
vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  hotReloadGuard: {
    tabs: {openUserPermissionsTab: mocks.openUserPermissionsTab},
    appSidebarRight: {toggleSidebar: vi.fn()}
  }
}));
vi.mock('@components/popups/pickUser', () => ({default: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/wrappers/peerTitle', () => ({default: vi.fn()}));
vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: vi.fn(), dispatchEvent: vi.fn()}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getChat: vi.fn()}}));

import {openBotAdminEditor} from '@components/popups/addBotToChat';

const channel = {
  _: 'channel',
  id: 100,
  pFlags: {broadcast: true, creator: true},
  admin_rights: {_: 'chatAdminRights', pFlags: {add_admins: true}}
} as Chat.channel;

function open() {
  const managers = {
    // * the bot is not in the channel yet: the editor starts from a plain member made up for it
    appProfileManager: {getParticipantOrMissing: vi.fn(() => Promise.resolve({
      participant: {_: 'channelParticipant', user_id: 7, date: 0},
      missing: true
    }))}
  } as any;
  return openBotAdminEditor({managers, chat: channel, botId: 7, rights: {_: 'chatAdminRights', pFlags: {}}});
}

describe('the admin rights editor offered for a bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leaving = false;
  });

  test('opens for the account it was offered in', async() => {
    await open();
    expect(mocks.openUserPermissionsTab).toHaveBeenCalledTimes(1);
  });

  test('is not opened once the tab is on its way to another account', async() => {
    mocks.leaving = true;
    await open();
    expect(mocks.openUserPermissionsTab).not.toHaveBeenCalled();
  });
});
