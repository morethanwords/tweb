import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import type {Chat} from '@layer';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

function setup({
  flags = {},
  threadId = 42,
  isMonoforum = false,
  peerId = (-100).toPeerId()
}: {
  flags?: Chat.channel['pFlags'],
  threadId?: number,
  isMonoforum?: boolean,
  peerId?: PeerId
} = {}) {
  const peer = {
    _: 'channel',
    pFlags: {megagroup: true, forum: true, left: true, ...flags}
  } as Chat.channel;
  const chat = {
    peer,
    peerId,
    threadId,
    isForum: !!peer.pFlags.forum,
    get isForumTopic() {return !!(this.isForum && this.threadId);},
    isMonoforum,
    type: ChatType.Chat,
    isStartButtonNeeded: async() => false
  };
  const controlContainer = document.createElement('div');
  const input = Object.assign(Object.create(ChatInput.prototype), {
    chat,
    controlContainer
  }) as ChatInput;
  return {input, chat, peer, controlContainer};
}

test.each([1, 42])('shows Join in forum topic %s when membership is optional for sending', async(threadId) => {
  const {input, controlContainer} = setup({threadId});
  expect(input.getJoinButtonType()).toBe('join');
  expect(await input.getNeededFakeContainer()).toBe(controlContainer);
});

test('restores the composer after joining a forum topic and offers Join after leaving', async() => {
  const {input, peer, controlContainer} = setup();
  expect(await input.getNeededFakeContainer()).toBe(controlContainer);

  delete peer.pFlags.left;
  expect(input.getJoinButtonType()).toBeUndefined();
  expect(await input.getNeededFakeContainer()).toBeUndefined();

  peer.pFlags.left = true;
  expect(input.getJoinButtonType()).toBe('join');
  expect(await input.getNeededFakeContainer()).toBe(controlContainer);
});

test('keeps the join request action in a forum topic', async() => {
  const {input, controlContainer} = setup({flags: {join_request: true}});
  expect(input.getJoinButtonType()).toBe('request');
  expect(await input.getNeededFakeContainer()).toBe(controlContainer);
});

test('keeps Join when a forum requires membership to send', () => {
  expect(setup({flags: {join_to_send: true}}).input.getJoinButtonType()).toBe('join');
});

test.each([true, false])('keeps Join at the group root (forum: %s)', (forum) => {
  const {input, chat} = setup({flags: {forum: forum || undefined}});
  chat.threadId = undefined;
  expect(input.getJoinButtonType()).toBe('join');
});

test('keeps the composer for channel comments that allow non-members to send', async() => {
  const {input} = setup({flags: {forum: undefined}});
  expect(input.getJoinButtonType()).toBeUndefined();
  expect(await input.getNeededFakeContainer()).toBeUndefined();
});

test.each([
  {flags: {forum: undefined, join_to_send: true}, expected: 'join'},
  {flags: {forum: undefined, join_request: true}, expected: 'request'}
] as const)('keeps $expected for channel comments requiring membership', ({flags, expected}) => {
  expect(setup({flags}).input.getJoinButtonType()).toBe(expected);
});

test('does not offer Join to an existing member', () => {
  expect(setup({flags: {left: undefined}}).input.getJoinButtonType()).toBeUndefined();
});

test('keeps broadcast channels on their separate control path', () => {
  expect(setup({flags: {broadcast: true, forum: undefined}}).input.getJoinButtonType()).toBeUndefined();
});

test('does not offer group membership controls in monoforums or user chats', () => {
  expect(setup({isMonoforum: true}).input.getJoinButtonType()).toBeUndefined();
  expect(setup({peerId: (100).toPeerId()}).input.getJoinButtonType()).toBeUndefined();
});
