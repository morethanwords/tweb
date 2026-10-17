import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

/**
 * Messages sent from the field in quick succession. The rule, written before the code, as Android has it: the
 * field is read as it is pressed and let go of whole as the message goes, once the checks before the send (slow
 * mode, payment) are through, with its reply and effect; one the checks stop stays in the field as it was. A
 * press while a message is on its way out of the field does nothing. Send Without Sound and Schedule Message act
 * on their press at once and are no mode.
 */

let mounted: ReturnType<typeof mountChatInputEditor>;
afterEach(() => {
  mounted?.editor.destroy();
  mounted?.input.remove();
  vi.restoreAllMocks();
});

type Sent = {text: string, replyToMsgId: number, silent: boolean, scheduleDate: number};

function setup() {
  mounted = mountChatInputEditor();
  const {editor, input} = mounted;
  const sent: Sent[] = [];
  /** the messages whose checks before the send have begun */
  const checking: string[] = [];
  /** what the checks before a send come to: sent, or not (`false`), or thrown */
  let check: () => Promise<boolean> = async() => true;
  /** what goes after the field was let go (a forwarded message looked up) */
  let afterSending: () => Promise<void> = async() => {};
  vi.spyOn(ChatInput, 'sendMessageWithForward').mockImplementation(async({sendingParams, forwarding, onSending}) => {
    const {replyToMsgId, silent, scheduleDate} = sendingParams;
    const {value} = editor.getRichValue(false, false); // read off the field first, as the real one does
    checking.push(value);
    if(!await check()) return false;
    const messageCount = (value ? 1 : 0) + (forwarding ? 1 : 0);
    if(messageCount) {
      onSending?.(value ? 1 : 0);
      sent.push({text: value, replyToMsgId, silent, scheduleDate});
      await afterSending();
    }
    return {value, messageCount};
  });

  let chatGeneration = 0;
  let effect: DocId;
  const host = Object.assign(Object.create(ChatInput.prototype), {
    chat: {
      type: ChatType.Chat,
      peerId: 42,
      getMessageSendingParams: () => ({
        peerId: 42,
        replyToMsgId: host.replyToMsgId,
        silent: host.sendSilent,
        scheduleDate: host.scheduleDate,
        effect: host.effect()
      })
    },
    messageInput: input,
    richMessageInput: {editor, field: {input}, cancelMedia: vi.fn()},
    inputValueGeneration: 0,
    ownSends: [],
    managers: {
      appMessagesManager: {readAllHistory: vi.fn(), editMessage: vi.fn(async() => {})},
      appEmojiManager: {pushRecentEmoji: vi.fn()}
    },
    // the chat's: one taken in the next chat is that chat's, and alive
    getMiddleware: () => {
      const generation = chatGeneration;
      return () => generation === chatGeneration;
    },
    effect: () => effect,
    setEffect: (value: DocId) => effect = value,
    verifyEphemeralCommand: vi.fn(() => true),
    getDefaultParamsForSlowModeTooltip: (): undefined => undefined,
    isDroppingCaptions: () => false,
    clearInput: vi.fn((_canSetDraft?: boolean, _fireEvent?: boolean, value: string | {text: string, entities: any[]} = '') => {
      ++host.inputValueGeneration;
      effect = undefined;
      if(typeof(value) === 'string') editor.setTextWithEntities(value);
      else editor.setTextWithEntities(value.text, value.entities);
    }),
    clearHelper: vi.fn(() => host.replyToMsgId = host.forwarding = undefined),
    onMessageInput: vi.fn(),
    setMessageInputExpanded: vi.fn(),
    updateSendBtn: vi.fn()
  }) as any;

  const type = (text: string) => {
    editor.focusAtEnd();
    editor.replaceSelection(text);
  };

  return {
    host,
    editor,
    sent,
    checking,
    type,
    /** the field is taken to another chat (`cleanup`) */
    leaveChat() {
      ++chatGeneration;
      host.cleanup();
    },
    /** sends whose checks wait until released, to be sent or not */
    holdSends() {
      const held: Array<(sent: boolean) => void> = [];
      check = () => new Promise<boolean>((resolve) => held.push(resolve));
      return (sent = true) => held.splice(0).forEach((resolve) => resolve(sent));
    },
    /** the rest of a send, after the field was let go, waits until released */
    holdAfterSending() {
      const held: Array<() => void> = [];
      afterSending = () => new Promise<void>((resolve) => held.push(resolve));
      return () => held.splice(0).forEach((resolve) => resolve());
    },
    failSends(how: 'refused' | 'thrown') {
      check = async() => {
        if(how === 'thrown') throw new Error('the slow mode check failed');
        return false;
      };
    },
    field() {
      return editor.getRichValue(false, false).value;
    }
  };
}

test('keeps a message in the field while it is checked, and takes it off as it goes', async() => {
  const {host, sent, checking, type, field, holdSends} = setup();
  const release = holdSends();
  type('first');
  const sending = host.sendMessage();

  await vi.waitFor(() => expect(checking).toEqual(['first']));
  expect(field()).toBe('first');
  release();
  await sending;

  expect(sent.map(({text}) => text)).toEqual(['first']);
  expect(field()).toBe('');
});

test('sends nothing a second time when Enter is pressed again while it is checked', async() => {
  const {host, sent, checking, type, holdSends} = setup();
  const release = holdSends();
  type('once');
  const first = host.sendMessage();
  const second = host.sendMessage(); // while the first is on its way out of the field
  await vi.waitFor(() => expect(checking).toHaveLength(1));
  release();
  await Promise.all([first, second]);

  expect(sent.map(({text}) => text)).toEqual(['once']);
  expect(checking).toEqual(['once']);
});

test('sends the next message pressed once the field was let go, while the rest of the one before still goes', async() => {
  const {host, sent, type, field, holdAfterSending} = setup();
  const release = holdAfterSending();
  type('a');
  const first = host.sendMessage();
  await vi.waitFor(() => expect(field()).toBe(''));
  type('b');
  host.sendSilent = true;
  const second = host.sendMessage();
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  release();
  await Promise.all([first, second]);

  expect(sent.map(({text, silent}) => [text, silent])).toEqual([['a', undefined], ['b', true]]);
});

test('gives a reply, Send Without Sound and Schedule Message to the message they were chosen for only', async() => {
  const {host, sent, type} = setup();
  const press = async(text: string, choose?: () => boolean) => {
    type(text);
    await host.sendMessage(!!choose?.());
  };

  await press('a', () => (host.replyToMsgId = 7, host.sendSilent = true, false));
  await press('b');
  await press('c', () => (host.scheduleDate = 1e10, true));
  await press('d');

  expect(sent.map(({text, replyToMsgId, silent, scheduleDate}) => [text, replyToMsgId, silent, scheduleDate])).toEqual([
    ['a', 7, true, undefined],
    ['b', undefined, undefined, undefined],
    ['c', undefined, undefined, 1e10],
    ['d', undefined, undefined, undefined]
  ]);
});

describe('a message the checks stop', () => {
  test.each(['refused', 'thrown'] as const)('stays in the field as it was when its send is %s', async(how) => {
    const {host, type, field, failSends} = setup();
    failSends(how);
    host.replyToMsgId = 7;
    host.setEffect('5');
    type('stays');

    await host.sendMessage().catch(() => {});

    expect(field()).toBe('stays');
    expect(host.replyToMsgId).toBe(7);
    expect(host.effect()).toBe('5');
    expect(host.clearInput).not.toHaveBeenCalled();
    expect(host.clearHelper).not.toHaveBeenCalled();
  });

  test.each(['sends nothing', 'is refused'] as const)(
    'leaves no Send Without Sound behind for the next message when a press %s',
    async(outcome) => {
      const {host, sent, type, failSends} = setup();
      if(outcome === 'is refused') {
        failSends('refused');
        type('a');
      }
      host.sendSilent = true;
      await host.sendMessage();

      expect(host.sendSilent).toBeUndefined();
      expect(sent).toEqual([]);
    }
  );
});

test('lets the whole field go as a message goes, with what was typed and chosen while it was checked', async() => {
  const {host, sent, type, field, holdSends} = setup();
  const release = holdSends();
  host.replyToMsgId = 7;
  type('a');
  const sending = host.sendMessage();
  await vi.waitFor(() => expect(ChatInput.sendMessageWithForward).toHaveBeenCalledOnce());
  type(' b');
  host.replyToMsgId = 9;
  host.setEffect('6');
  release();
  await sending;

  expect(sent.map(({text, replyToMsgId}) => [text, replyToMsgId])).toEqual([['a', 7]]);
  expect(field()).toBe('');
  expect(host.replyToMsgId).toBeUndefined();
  expect(host.effect()).toBeUndefined();
});

test('sends a message whose chat is left while it is checked, and leaves the next chat\'s field alone', async() => {
  const {host, sent, checking, type, field, holdSends, leaveChat} = setup();
  const release = holdSends();
  type('a');
  const first = host.sendMessage();
  const second = host.sendMessage(); // pressed again in that chat
  await vi.waitFor(() => expect(checking).toEqual(['a']));

  leaveChat();
  type('in the next chat');
  release();
  await Promise.all([first, second]);

  expect(sent.map(({text}) => text)).toEqual(['a']);
  expect(checking).toEqual(['a']);
  expect(field()).toBe('in the next chat');
  expect(host.verifyEphemeralCommand).toHaveBeenCalledOnce(); // the second press did nothing
});

test('saves an edit on its own, without waiting for a send under way', async() => {
  const {host, type, holdSends} = setup();
  const release = holdSends();
  type('a');
  const first = host.sendMessage();
  await vi.waitFor(() => expect(ChatInput.sendMessageWithForward).toHaveBeenCalledOnce());

  host.editMsgId = 5;
  host.editMessage = {_: 'message', mid: 5, peerId: 42, message: 'old', pFlags: {}};
  type('edited');
  await host.sendMessage();

  expect(host.managers.appMessagesManager.editMessage).toHaveBeenCalledOnce();
  release();
  await first;
});

test('takes Send Without Sound in a scheduled chat on to the time picked for it', async() => {
  const {host, sent, type} = setup();
  host.chat.type = ChatType.Scheduled;
  host.scheduleSending = vi.fn();
  type('later');
  host.sendSilent = true;
  await host.sendMessage();

  expect(host.scheduleSending).toHaveBeenCalledOnce();
  expect(host.sendSilent).toBeUndefined(); // nothing left behind while the picker is open

  // a time picked (`setScheduleTimestamp`)
  host.scheduleDate = 1e10;
  host.scheduleSending.mock.calls[0][0]();
  await vi.waitFor(() => expect(sent).toHaveLength(1));

  expect(sent).toEqual([{text: 'later', replyToMsgId: undefined, silent: true, scheduleDate: 1e10}]);
});

test('says a story reply was sent once, after the field let go of it', async() => {
  const {host, type} = setup();
  host.chat.type = ChatType.Stories;
  host.onMessageSent2 = vi.fn();
  type('nice');
  await host.sendMessage();

  expect(host.onMessageSent2).toHaveBeenCalledOnce();
  expect(host.clearInput.mock.invocationCallOrder[0]).toBeLessThan(host.onMessageSent2.mock.invocationCallOrder[0]);
});

describe('the draft of a chat while a message that left its field is on its way', () => {
  function field(chat: {threadId?: number, monoforumThreadId?: PeerId, isMonoforum?: boolean}, clears = 1) {
    return Object.assign(Object.create(ChatInput.prototype), {
      chat: {peerId: 42, ...chat},
      ownSends: [{clears, until: Date.now() + 1e4}]
    }) as any;
  }

  test('is cleared by its send once for each message its text goes as', async() => {
    const {host, type} = setup();
    vi.mocked(ChatInput.sendMessageWithForward).mockImplementationOnce(async({onSending}) => {
      onSending(2);
      return {value: 'long', messageCount: 2};
    });
    type('long');
    await host.sendMessage();

    expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(true);
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(true);
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(false); // someone else's
  });

  test('saved before it went does not come back into the field, nor clear the next message', async() => {
    const {host, type, holdSends} = setup();
    const release = holdSends();
    type('sent');
    const sending = host.sendMessage();
    await vi.waitFor(() => expect(ChatInput.sendMessageWithForward).toHaveBeenCalledOnce());
    // still in the field while it is checked: drafts go their usual way
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, true, false)).toBe(false);
    release();
    await sending;

    expect(host.takeOwnDraftUpdate(42, undefined, undefined, true, false)).toBe(true);
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, false)).toBe(true);
    // one that fills the field on purpose (a link) still does
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, true, true)).toBe(false);
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(true); // its clear
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, true, false)).toBe(false);
  });

  test('is let through after a message without text', async() => {
    const {host} = setup();
    host.forwarding = {[42]: [5]};
    await host.sendMessage();

    expect(ChatInput.sendMessageWithForward).toHaveBeenCalledOnce();
    expect(host.takeOwnDraftUpdate(42, undefined, undefined, true, false)).toBe(false);
  });

  test('is that of its own topic only', () => {
    const topic1 = field({threadId: 1});
    const topic2 = field({threadId: 2});

    expect(topic2.takeOwnDraftUpdate(42, 1, undefined, false, true)).toBe(false);
    expect(topic1.takeOwnDraftUpdate(42, 1, undefined, false, true)).toBe(true);
    expect(topic1.takeOwnDraftUpdate(42, 1, undefined, false, true)).toBe(false); // one was waited for
  });

  test('of a monoforum thread is that of the global monoforum chat that sent into it', () => {
    expect(field({isMonoforum: true}).takeOwnDraftUpdate(42, undefined, 7, false, true)).toBe(true);
  });

  test('is not held past its time, nor by a field that sent nothing', () => {
    const late = field({});
    late.ownSends[0].until = Date.now() - 1;

    expect(late.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(false);
    expect(late.takeOwnDraftUpdate(42, undefined, undefined, true, false)).toBe(false);
    expect(field({}, 0).takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(false);
  });
});
