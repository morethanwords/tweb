import '@helpers/peerIdPolyfill';
import {render} from 'solid-js/web';
import {ChannelAdminLogEvent, ExportedChatInvite} from '@layer';
import I18n from '@lib/langPack';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';

// * no workers to start for what only lays text out
vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn(), getChat: vi.fn(), getPeer: vi.fn()}}));

type Resolver = typeof import('@components/sidebarRight/tabs/adminRecentActions/logEntriesResolver');
type KeyValuePair = typeof import('@components/sidebarRight/tabs/adminRecentActions/keyValuePair');
let resolveLogEntry: Resolver['resolveLogEntry'];
let InviteKeyValue: KeyValuePair['InviteKeyValue'];

// * the resolver's graph reaches the message rendering, which wants the browser APIs jsdom lacks on import
beforeAll(async() => {
  stubBrowserGlobals();
  ({resolveLogEntry} = await import('@components/sidebarRight/tabs/adminRecentActions/logEntriesResolver'));
  ({InviteKeyValue} = await import('@components/sidebarRight/tabs/adminRecentActions/keyValuePair'));
}, 60_000);

const PUBLIC: ExportedChatInvite = {_: 'chatInvitePublicJoinRequests'};
const EXPORTED = {
  _: 'chatInviteExported',
  pFlags: {request_needed: true},
  link: 'https://t.me/+abc',
  admin_id: 1,
  date: 1
} as ExportedChatInvite.chatInviteExported;

const joinByRequest = (invite: ExportedChatInvite): ChannelAdminLogEvent => ({
  _: 'channelAdminLogEvent',
  id: '1',
  date: 1,
  user_id: 2,
  action: {_: 'channelAdminLogEventActionParticipantJoinByRequest', invite, approved_by: 3}
});

let dispose: VoidFunction;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

const message = (invite: ExportedChatInvite) => {
  const {Message} = resolveLogEntry({channelId: 100 as ChatId, event: joinByRequest(invite), isBroadcast: false, isForum: false});
  return (Message({}) as HTMLElement).textContent;
};

test('a member let in from public join requests is said to have come that way, one let in by a link by request', () => {
  expect(message(PUBLIC)).toBe(I18n.format('AdminRecentActionMessage.ParticipantJoinedByPublicRequest', true));
  expect(message(EXPORTED)).toBe(I18n.format('AdminRecentActionMessage.ParticipantJoinedByRequest', true));
});

test('the invite of public join requests is shown instead of being skipped', () => {
  dispose = render(() => <InviteKeyValue invite={PUBLIC} />, document.body);
  expect(document.body.textContent).toContain(I18n.format('InviteLink', true));
  expect(document.body.textContent).toContain(I18n.format('AdminRecentActions.PublicJoinRequest', true));
  dispose();

  dispose = render(() => <InviteKeyValue invite={EXPORTED} />, document.body);
  expect(document.body.textContent).toContain('https://t.me/+abc');
});
