import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import {registerChatInputEditor} from '@components/chat/inputEditor/registry';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import rootScope from '@lib/rootScope';
import deferredPromise from '@helpers/cancellablePromise';
import type {DraftMessage, Message, MessageEntity, RichMessage} from '@layer';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

const mocks = vi.hoisted(() => ({reply: vi.fn(), toast: vi.fn(), frames: [] as Array<() => void>}));
vi.mock('@helpers/schedulers', async(importOriginal) => ({
  ...await importOriginal<typeof import('@helpers/schedulers')>(),
  fastRaf: (callback: () => void) => mocks.frames.push(callback)
}));
vi.mock('@components/wrappers/messageForReply', () => ({default: mocks.reply}));
vi.mock('@lib/richTextProcessor/wrapDraftText', () => ({default: () => document.createDocumentFragment()}));
vi.mock('@components/toast', () => ({toast: mocks.toast, toastNew: mocks.toast}));

const completeRichMessage: RichMessage = {
  _: 'richMessage', pFlags: {}, photos: [], documents: [],
  blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Rich'}}]
};

beforeEach(() => {
  mocks.reply.mockReset().mockResolvedValue(document.createDocumentFragment());
  mocks.toast.mockReset();
  mocks.frames.length = 0;
});

function setup(partial = false) {
  const message = {
    message: 'Message', peerId: 42, mid: 1,
    rich_message: partial ? {...completeRichMessage, pFlags: {part: true}} : undefined
  } as unknown as Message.message;
  let current = true;
  const host = {
    messageEditingGeneration: 0,
    inputValueGeneration: 0,
    chat: {peerId: 42, threadId: 1, getMessage: vi.fn((_mid: number) => message)},
    managers: {appMessagesManager: {getRichMessage: vi.fn(async() => completeRichMessage)}},
    getMiddleware: () => () => current,
    messageInput: {isContentEditable: true, innerHTML: ''},
    getPlaceholderParams: vi.fn(async(_editing: boolean) => ({key: 'Message' as const})),
    setMessageInputEditable: vi.fn((editable: boolean) => {}),
    updateMessageInputPlaceholder: vi.fn(() => ({oldKey: 'Message', oldArgs: []})),
    editMsgId: undefined as number,
    editMessage: undefined as Message.message,
    restoreInputLock: undefined as (() => void),
    setTopInfo: vi.fn(),
    setReplyTo: vi.fn(),
    btnSuggestPost: document.createElement('button'),
    canShowSuggestPostButton: () => false,
    inputState: {set: vi.fn()},
    setCurrentHover: vi.fn(),
    saveDraftDebounced: vi.fn(),
    clearInput: vi.fn()
  };
  const input = host as unknown as ChatInput;
  host.setMessageInputEditable.mockImplementation(editable => host.messageInput.isContentEditable = editable);
  host.setTopInfo.mockImplementation(() => ChatInput.prototype.clearHelper.call(input, 'edit', true));
  return {
    host,
    message,
    edit: (mid = 1) => ChatInput.prototype.initMessageEditing.call(input, mid),
    cancel: () => ChatInput.prototype.clearHelper.call(input),
    destroy: () => current = false
  };
}

for(const stage of ['rich', 'reply', 'placeholder'] as const) for(const interruption of ['peer', 'thread', 'cancel', 'destroy', 'typed', 'new-value'] as const) {
  test(`ignores ${stage} completion after ${interruption}`, async() => {
    const pending = deferredPromise<any>();
    const {host, edit, cancel, destroy} = setup(stage === 'rich');
    const operation = stage === 'rich' ? host.managers.appMessagesManager.getRichMessage :
      stage === 'reply' ? mocks.reply : host.getPlaceholderParams;
    operation.mockReturnValueOnce(pending);
    if(stage === 'placeholder') host.messageInput.isContentEditable = false;
    const task = edit();
    await vi.waitFor(() => expect(operation).toHaveBeenCalled());
    if(interruption === 'peer') host.chat.peerId = 43;
    if(interruption === 'thread') host.chat.threadId = 2;
    if(interruption === 'cancel') cancel();
    if(interruption === 'destroy') destroy();
    if(interruption === 'typed') host.messageInput.innerHTML = 'Typed while loading';
    if(interruption === 'new-value') ++host.inputValueGeneration;
    pending.resolve(stage === 'rich' ? completeRichMessage : stage === 'reply' ? document.createDocumentFragment() : {key: 'Message'});
    await task;
    expect(host.setTopInfo).not.toHaveBeenCalled();
    expect(host.setMessageInputEditable).not.toHaveBeenCalled();
    expect(host.editMsgId).toBeUndefined();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
}

test('only opens the newest requested message', async() => {
  const pending = deferredPromise<RichMessage>();
  const {host, message, edit} = setup(true);
  host.managers.appMessagesManager.getRichMessage.mockReturnValueOnce(pending);
  const first = edit();
  const secondMessage: Message.message = {...message, mid: 2, rich_message: undefined};
  host.chat.getMessage.mockReturnValueOnce(secondMessage);
  await edit(2);
  pending.resolve(completeRichMessage);
  await first;
  expect(host.setTopInfo).toHaveBeenCalledTimes(1);
  expect(host.setTopInfo.mock.calls[0][0].message).toBe(secondMessage);
  expect(host.editMsgId).toBe(2);
});

test('uses the full rich message for preview and editing after fetch', async() => {
  const {host, message, edit} = setup(true);
  await edit();
  expect(mocks.reply.mock.calls[0][0].message.rich_message).toBe(completeRichMessage);
  expect(host.setTopInfo).toHaveBeenCalledTimes(1);
  expect(host.setTopInfo.mock.calls[0][0].richMessage).toBe(completeRichMessage);
  expect(message.rich_message).toBe(completeRichMessage);
  expect(host.editMsgId).toBe(1);
});

test.each([false, true])('reports only a current fetch error (stale=%s)', async(stale) => {
  const pending = deferredPromise<RichMessage>();
  const {host, edit, cancel} = setup(true);
  host.managers.appMessagesManager.getRichMessage.mockReturnValueOnce(pending);
  const task = edit();
  if(stale) cancel();
  pending.reject(new Error('FETCH_FAILED'));
  await task;
  expect(mocks.toast).toHaveBeenCalledTimes(stale ? 0 : 1);
  expect(host.setTopInfo).not.toHaveBeenCalled();
});

test('keeps the next edit writable when replacing an edit that temporarily unlocked the input', async() => {
  const {host, edit} = setup();
  host.restoreInputLock = () => host.messageInput.isContentEditable = false;
  await edit();
  expect(host.getPlaceholderParams).toHaveBeenCalledWith(true);
  expect(host.messageInput.isContentEditable).toBe(true);
  expect(host.restoreInputLock).toBeDefined();
  host.restoreInputLock();
  expect(host.messageInput.isContentEditable).toBe(false);
});


for(const interruption of ['peer', 'new-value', 'typed'] as const) test(`does not apply a stale draft frame after ${interruption}`, () => {
  let current = true;
  const host = {
    inputValueGeneration: 0,
    getMiddleware: () => () => current,
    messageInput: document.createElement('div'),
    clearInput: vi.fn(),
    setEffect: vi.fn(),
    getCurrentInputAsDraft: (): undefined => undefined,
    onMessageInput: vi.fn()
  };
  const input = host as unknown as ChatInput;
  const draft = {_: 'draftMessage', pFlags: {}, message: 'Old', date: 0, effect: '1'} as DraftMessage.draftMessage;
  expect(ChatInput.prototype.setInputValue.call(input, 'Old', true, false, draft)).toBe(true);
  const oldFrame = mocks.frames[mocks.frames.length - 1];
  if(interruption === 'peer') current = false;
  else if(interruption === 'typed') host.messageInput.textContent = 'Typed';
  else ChatInput.prototype.setInputValue.call(input, 'New', true, false, {...draft, effect: '2'});
  oldFrame();
  expect(host.setEffect).not.toHaveBeenCalled();
  expect(host.onMessageInput).not.toHaveBeenCalled();
  if(interruption === 'new-value') {
    mocks.frames[mocks.frames.length - 1]();
    expect(host.setEffect).toHaveBeenCalledWith('2');
    expect(host.onMessageInput).toHaveBeenCalledTimes(1);
  }
});


for(const interruption of ['peer', 'typed', 'new-value'] as const) test(`does not replace input with a fetched draft after ${interruption}`, async() => {
  let current = true;
  const pending = deferredPromise<DraftMessage.draftMessage>();
  const host = {
    inputValueGeneration: 0,
    getMiddleware: () => () => current,
    chat: {type: ChatType.Chat, peerId: 42, threadId: 1},
    messageInput: document.createElement('div'),
    managers: {appDraftsManager: {getDraft: () => pending}},
    getCurrentInputAsDraft: (): DraftMessage.draftMessage | undefined => undefined,
    setInputValue: vi.fn(() => true)
  };
  const task = ChatInput.prototype.setDraft.call(host as unknown as ChatInput, undefined, false);
  if(interruption === 'peer') current = false;
  if(interruption === 'typed') host.messageInput.textContent = 'Typed while loading';
  if(interruption === 'new-value') ++host.inputValueGeneration;
  pending.resolve({_: 'draftMessage', pFlags: {}, message: 'Old draft', date: 0});
  await task;
  expect(host.setInputValue).not.toHaveBeenCalled();
});


function setupSending() {
  const previousManagers = rootScope.managers;
  const sendText = vi.fn();
  const forwardMessages = vi.fn(async(_options: {mids: number[]}): Promise<undefined> => undefined);
  const getConfig = vi.fn(async() => ({message_length_max: 4096}));
  const pay = vi.fn(async(): Promise<undefined> => undefined);
  const managers = {
    appMessagesManager: {
      sendText, forwardMessages,
      getMessageByPeer: vi.fn(async() => ({pFlags: {}})),
      getRichMessagePostingState: async() => ({allowed: true}),
      validateRichMessage: async() => ({valid: true})
    },
    apiManager: {getConfig}
  };
  rootScope.managers = managers as unknown as typeof rootScope.managers;
  const slowMode = vi.spyOn(ChatInput, 'showSlowModeTooltipIfNeeded').mockResolvedValue(false);
  const options: Parameters<typeof ChatInput.sendMessageWithForward>[0] = {
    sendingParams: {peerId: 42 as PeerId},
    chatType: ChatType.Chat,
    slowModeParams: {peerId: 42 as PeerId, managers: rootScope.managers, element: document.createElement('div')},
    paidMessageInterceptor: {prepareStarsForPayment: pay} as unknown as Parameters<typeof ChatInput.sendMessageWithForward>[0]['paidMessageInterceptor']
  };
  return {
    options, sendText, forwardMessages, getConfig, pay, slowMode,
    restore() {slowMode.mockRestore(); rootScope.managers = previousManagers;}
  };
}

test.each([false, true])('does not read a changed rich document after waiting for code detection (changed=%s)', async(changed) => {
  const pending = deferredPromise<void>();
  const input = document.createElement('div');
  let revision = 1;
  let value = 'Original';
  const editor = {
    isEmpty: () => false,
    hasPendingRichMediaUploads: () => false,
    captureSelection: () => ({revision}),
    resolveAutoCodeLanguages: () => pending,
    getRichValue: () => ({value, entities: [] as MessageEntity[], caretPos: -1}),
    getLegacyValueIfLossless: (): undefined => undefined,
    getRichMessage: () => ({
      input: {_: 'inputRichMessage', pFlags: {}, blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: value}}]},
      output: {...completeRichMessage, blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: value}}]}
    })
  };
  const unregister = registerChatInputEditor(input, editor as unknown as ChatInputEditor);
  const sending = setupSending();
  try {
    const task = ChatInput.sendMessageWithForward({
      ...sending.options,
      inputField: {input} as unknown as Parameters<typeof ChatInput.sendMessageWithForward>[0]['inputField']
    });
    if(changed) {++revision; value = 'New chat draft';}
    pending.resolve();
    await task;
    expect(sending.sendText).toHaveBeenCalledTimes(changed ? 0 : 1);
    if(!changed) expect(sending.sendText.mock.calls[0][0].richMessage.input.blocks[0].text.text).toBe('Original');
  } finally {
    sending.restore();
    unregister();
  }
});


for(const interruption of ['none', 'peer', 'typed', 'new-edit'] as const) test(`only cleans the submitted composer after send (interruption=${interruption})`, async() => {
  const pending = deferredPromise<{value: string, messageCount: number}>();
  const send = vi.spyOn(ChatInput, 'sendMessageWithForward').mockReturnValueOnce(pending);
  let current = true;
  let revision = 1;
  const host = {
    editMsgId: undefined as number,
    inputValueGeneration: 0,
    getMiddleware: () => () => current,
    messageInputEditor: {captureSelection: () => ({revision})},
    messageInputField: {input: document.createElement('div')},
    chat: {type: ChatType.Chat, peerId: 42, getMessageSendingParams: () => ({peerId: 42})},
    verifyEphemeralCommand: () => true,
    checkWelcomeMessagesLimit: () => Promise.resolve(true),
    getDefaultParamsForSlowModeTooltip: () => ({}),
    onMessageSent: vi.fn()
  };
  try {
    const task = ChatInput.prototype.sendMessage.call(host as unknown as ChatInput);
    if(interruption === 'peer') current = false;
    if(interruption === 'typed') ++revision;
    if(interruption === 'new-edit') host.editMsgId = 2;
    pending.resolve({value: 'Submitted', messageCount: 1});
    await task;
    expect(host.onMessageSent).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
  } finally {
    send.mockRestore();
  }
});


test.each([
  {name: 'plain', text: 'Scheduled', expected: 1},
  {name: 'long plain', text: 'x'.repeat(5000), expected: 2},
  {name: 'rich', text: 'Rich', expected: 1},
  {name: 'forwarding', text: '', expected: 2},
  {name: 'empty', text: '', expected: 0}
])('counts queued $name messages without immediate slow-mode/payment checks', async({name, text, expected}) => {
  const sending = setupSending();
  try {
    const result = await ChatInput.sendMessageWithForward({
      ...sending.options,
      chatType: ChatType.Scheduled,
      text: {text},
      forwarding: name === 'forwarding' ? {[51 as PeerId]: [11, 12]} : undefined,
      sendTextParams: name === 'rich' ? {richMessage: {
        input: {_: 'inputRichMessage', pFlags: {}, blocks: completeRichMessage.blocks},
        output: completeRichMessage
      }} : undefined
    });
    expect(result && result.messageCount).toBe(expected);
    expect(sending.sendText).toHaveBeenCalledTimes(text ? 1 : 0);
    expect(sending.forwardMessages).toHaveBeenCalledTimes(name === 'forwarding' ? 1 : 0);
    expect(sending.slowMode).not.toHaveBeenCalled();
    expect(sending.pay).not.toHaveBeenCalled();
  } finally {sending.restore();}
});

test('keeps the submitted forwarding selection stable while preparation waits', async() => {
  const sending = setupSending();
  const pending = deferredPromise<{message_length_max: number}>();
  sending.getConfig.mockReturnValueOnce(pending);
  const forwarding = {[51 as PeerId]: [11, 12]};
  try {
    const task = ChatInput.sendMessageWithForward({...sending.options, forwarding});
    forwarding[51].push(13);
    pending.resolve({message_length_max: 4096});
    await task;
    expect(sending.pay).toHaveBeenCalledWith(2);
    expect(sending.forwardMessages.mock.calls[0][0].mids).toEqual([11, 12]);
  } finally {sending.restore();}
});
