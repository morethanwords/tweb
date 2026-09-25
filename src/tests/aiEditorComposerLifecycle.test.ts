import {createRoot} from 'solid-js';
import {useAiEditorButton} from '@components/richMessageInput/ai';
import createAiEditorContext from '@components/chat/inputState/createAiEditorContext';
import {ChatType} from '@components/chat/chatType';
import type ChatInput from '@components/chat/input';
import type InputField from '@components/inputField';
import {registerChatInputEditor} from '@components/chat/inputEditor/registry';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import type {AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {CreateWithAiPopupProps} from '@components/popups/aiEditorPopup/createWithAiPopup';
import deferredPromise from '@helpers/cancellablePromise';
import type {MessageEntity, RichMessage} from '@layer';

const mocks = vi.hoisted(() => ({
  click: undefined as (() => Promise<void>),
  open: vi.fn(),
  create: vi.fn(),
  getTones: vi.fn()
}));

vi.mock('@components/buttonTsx', () => ({default: (props: {onClick: () => Promise<void>}) => {
  mocks.click = props.onClick;
  return document.createElement('button');
}}));
vi.mock('@components/chat/createAiEditorIcon', () => ({default: () => document.createElement('span')}));
vi.mock('@components/resizeObserver', () => ({observeResize: () => () => {}}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({useHotReloadGuard: () => ({
  rootScope: {managers: {acknowledged: {aiTonesManager: {getTones: mocks.getTones}}}},
  toastNew: vi.fn(),
  HotReloadGuard: undefined as undefined
})}));
vi.mock('@components/popups/aiEditorPopup', () => ({openAiEditorPopup: mocks.open}));
vi.mock('@components/popups/aiEditorPopup/createWithAiPopup', () => ({openCreateWithAiPopup: mocks.create}));
vi.mock('@helpers/dom/getRichValueWithCaret', () => ({
  default: (input: HTMLElement) => ({value: input.textContent, entities: [] as MessageEntity[]})
}));

const text = {_: 'textWithEntities' as const, text: 'Rewritten', entities: [] as MessageEntity[]};
const richMessage: RichMessage = {
  _: 'richMessage', pFlags: {}, photos: [], documents: [],
  blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Rewritten'}}]
};
const disposers: Array<() => void> = [];

beforeEach(() => {
  mocks.open.mockReset();
  mocks.create.mockReset();
  mocks.getTones.mockReset().mockResolvedValue({cached: true, result: []});
});
afterEach(() => {
  while(disposers.length) disposers.pop()!();
  document.body.replaceChildren();
});

function setup(mode: 'legacy' | 'selection' | 'create' = 'legacy') {
  const container = document.createElement('div');
  const input = document.createElement('div');
  input.textContent = 'Original';
  if(mode === 'create') container.classList.add('is-message-input-expanded');
  container.append(input);
  document.body.append(container);
  let revision = 0;
  let current = true;
  const editor = mode === 'legacy' ? undefined : {
    captureSelection: () => ({revision, type: 'text', from: 1, to: mode === 'create' ? 1 : 4}),
    separateHistory: vi.fn(),
    replaceDocumentRange: vi.fn(),
    replaceDocumentRangeWithRichMessage: vi.fn(),
    getSelectedRichMessage: (): undefined => undefined,
    getRichMessage: (): undefined => undefined
  } as unknown as ChatInputEditor;
  if(editor) disposers.push(registerChatInputEditor(input, editor));
  const send = vi.fn(async(): Promise<false | {messageCount: number}> => ({messageCount: 1}));
  const host = {
    chat: {
      peerId: 42,
      threadId: 1,
      type: ChatType.Chat,
      starsAmount: 0,
      getMessageSendingParams: () => ({peerId: host.chat.peerId, threadId: host.chat.threadId})
    },
    editMsgId: undefined as number,
    getMiddleware: () => () => current,
    isEphemeralComposerMode: () => false,
    canSendWhenOnline: vi.fn(),
    getDefaultParamsForSlowModeTooltip: () => ({}),
    paidMessageInterceptor: undefined as undefined,
    Class: {sendMessageWithForward: send},
    setInputValue: vi.fn()
  };
  const apply = vi.fn();
  createRoot(dispose => {
    disposers.push(dispose);
    useAiEditorButton({
      context: createAiEditorContext(host as unknown as ChatInput),
      inputField: () => ({input} as unknown as InputField),
      container: () => container,
      appendTo: () => container,
      onApply: apply,
      canSend: true,
      shouldShowFromHeight: () => 0
    });
  });
  return {
    host, input, apply, editor, send,
    changeContent: () => {input.textContent = 'New draft'; ++revision;},
    destroy: () => current = false,
    open: async() => {
      await mocks.click();
      return (mode === 'create' ? mocks.create : mocks.open).mock.calls[0]?.[0] as
        AiEditorPopupProps & CreateWithAiPopupProps;
    }
  };
}

test.each(['peer', 'thread', 'typed', 'destroy'] as const)('does not open a stale rewrite popup after %s', async(interruption) => {
  const tones = deferredPromise<{cached: boolean, result: never[]}>();
  mocks.getTones.mockReturnValue(tones);
  const setupResult = setup();
  const task = setupResult.open();
  if(interruption === 'peer') setupResult.host.chat.peerId = 43;
  if(interruption === 'thread') setupResult.host.chat.threadId = 2;
  if(interruption === 'typed') setupResult.changeContent();
  if(interruption === 'destroy') setupResult.destroy();
  tones.resolve({cached: true, result: []});
  await task;
  expect(mocks.open).not.toHaveBeenCalled();
});

for(const mode of ['legacy', 'selection', 'create'] as const) for(const format of ['plain', 'rich'] as const) {
  test.each(['none', 'peer', 'thread', 'edit', 'typed', 'destroy', 'detach'] as const)(`${mode} ${format} apply respects %s context`, async(interruption) => {
    const state = setup(mode);
    const popup = await state.open();
    if(interruption === 'peer') state.host.chat.peerId = 43;
    if(interruption === 'thread') state.host.chat.threadId = 2;
    if(interruption === 'edit') state.host.editMsgId = 99;
    if(interruption === 'typed') state.changeContent();
    if(interruption === 'destroy') state.destroy();
    if(interruption === 'detach') state.input.remove();
    if(format === 'plain') popup.onApply(text);
    else popup.onApplyRichMessage(richMessage);
    const target = mode === 'legacy' ? state.apply :
      format === 'plain' ? state.editor.replaceDocumentRange : state.editor.replaceDocumentRangeWithRichMessage;
    expect(target).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
    expect(state.host.setInputValue).not.toHaveBeenCalled();
  });
}

for(const format of ['plain', 'rich'] as const) {
  test.each(['peer', 'typed'] as const)(`${format} send refuses a changed %s before dispatch`, async(interruption) => {
    const state = setup();
    const popup = await state.open();
    if(interruption === 'peer') state.host.chat.peerId = 43;
    else state.changeContent();
    if(format === 'plain') await popup.onSend(text);
    else await popup.onSendRichMessage(richMessage);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.host.setInputValue).not.toHaveBeenCalled();
  });

  test.each(['none', 'peer', 'typed', 'zero-count', 'blocked'] as const)(`${format} completion clears only the sent draft (%s)`, async(interruption) => {
    const state = setup();
    const pending = deferredPromise<false | {messageCount: number}>();
    state.send.mockReturnValue(pending);
    const popup = await state.open();
    const task = format === 'plain' ? popup.onSend(text) : popup.onSendRichMessage(richMessage);
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({
      sendingParams: expect.objectContaining({peerId: 42, threadId: 1})
    }));
    if(interruption === 'peer') state.host.chat.peerId = 43;
    if(interruption === 'typed') state.changeContent();
    pending.resolve(interruption === 'blocked' ? false : {messageCount: interruption === 'zero-count' ? 0 : 1});
    await task;
    expect(state.host.setInputValue).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
  });
}
