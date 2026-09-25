import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {DraftMessage} from '@layer';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));
const frames = vi.hoisted(() => [] as Array<() => void>);
vi.mock('@helpers/schedulers', async(original) => ({
  ...await original<typeof import('@helpers/schedulers')>(),
  fastRaf: (callback: () => void) => frames.push(callback)
}));
const toastNew = vi.hoisted(() => vi.fn());
vi.mock('@components/toast', () => ({toast: toastNew, toastNew}));

const richDraft = (value: string): DraftMessage.draftMessage => ({
  _: 'draftMessage', date: 0, pFlags: {no_webpage: true}, message: '',
  rich_message: {_: 'richMessage', pFlags: {}, photos: [], documents: [], blocks: [
    {_: 'pageBlockHeading2', text: {_: 'textPlain', text: value}}
  ]}
});

/** `pageBlockTitle` has no editable counterpart, so the composer refuses it. */
const unsupportedDraft = (): DraftMessage.draftMessage => ({
  _: 'draftMessage', date: 0, pFlags: {no_webpage: true}, message: '',
  rich_message: {_: 'richMessage', pFlags: {}, photos: [], documents: [], blocks: [
    {_: 'pageBlockTitle', text: {_: 'textPlain', text: 'Not editable here'}}
  ]}
});

let mounted: ReturnType<typeof mountChatInputEditor>;
afterEach(() => {mounted?.editor.destroy(); mounted?.input.remove(); frames.length = 0;});

function setup() {
  mounted = mountChatInputEditor();
  const {editor, input} = mounted;
  let effect: string;
  const syncDraft = vi.fn();
  const host = Object.assign(Object.create(ChatInput.prototype), {
    chat: {type: ChatType.Chat, peerId: 42, threadId: undefined},
    messageInput: input,
    richMessageInput: {
      editor,
      field: {input, syncFromInput() {}, setValueSilently: (value: string | Node) => editor.setContent(value)}
    },
    inputValueGeneration: 0,
    managers: {appDraftsManager: {syncDraft, getDraft: async(): Promise<undefined> => undefined}},
    getMiddleware: () => () => true,
    effect: () => effect,
    setEffect: (value?: string) => effect = value,
    clearHelper: vi.fn(),
    saveDraftDebounced: {isDebounced: () => false},
    clearInput: vi.fn(async(_restore: boolean, _emit: boolean, value = '') => {
      ++host.inputValueGeneration;
      host.appliedInputDraft = undefined;
      editor.setTextWithEntities(value);
    }),
    onMessageInput: vi.fn((_event?: Event, suppressDraftSync?: boolean) => {
      if(!suppressDraftSync && !host.processingDraftMessage) host.saveDraft();
    })
  });
  const flush = () => {while(frames.length) frames.shift()!();};
  const apply = async(value: string) => {
    const result = await host.setDraft(richDraft(value), true);
    flush();
    return result;
  };
  return {host, editor, syncDraft, apply, flush};
}

test('does not re-save a received rich draft during hydration or chat leave', async() => {
  const {host, editor, apply, syncDraft} = setup();
  expect(await apply('Remote')).toBe(true);
  host.saveDraft();
  expect(editor.getRichValue().value).toBe('Remote');
  expect(syncDraft).not.toHaveBeenCalled();
});

test('applies subsequent remote revisions to an untouched nonempty composer', async() => {
  const {host, editor, apply, syncDraft} = setup();
  await apply('First');
  expect(await apply('Second')).toBe(true);
  expect(editor.getRichValue().value).toBe('Second');
  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();
});

test('keeps local changes ahead of a remote update and sends them once', async() => {
  const {host, editor, apply, syncDraft} = setup();
  await apply('Remote');
  editor.setTextWithEntities('My edit');
  expect(await apply('Other session')).toBe(false);
  host.saveDraft();
  expect(editor.getRichValue().value).toBe('My edit');
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('My edit');
});

test.each(['reply', 'effect'] as const)('saves a locally changed %s even when text is unchanged', async(kind) => {
  const {host, apply, syncDraft} = setup();
  await apply('Remote');
  if(kind === 'reply') host.replyToMsgId = 9;
  else host.setEffect('42');
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  const draft = syncDraft.mock.calls[0][0].localDraft;
  if(kind === 'reply') expect(draft.reply_to.reply_to_msg_id).toBe(9);
  else expect(draft.effect).toBe('42');
});

test('resaves undo to the former received content after a local draft was published', async() => {
  const {host, editor, apply, syncDraft} = setup();
  await apply('Remote');
  editor.setTextWithEntities('My edit');
  host.saveDraft();
  editor.setRichMessage(richDraft('Remote').rich_message);
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(2);
});

test('clears an untouched received draft without restoring or echoing it', async() => {
  const {host, editor, apply, syncDraft} = setup();
  await apply('Remote');
  await host.setDraft(undefined, true);
  expect(host.clearInput).toHaveBeenCalledWith(false, false);
  expect(host.onMessageInput).toHaveBeenCalledWith(undefined, true);
  expect(editor.isEmpty()).toBe(true);
  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();
});

test('treats a programmatic local replacement as a new draft', async() => {
  const {host, apply, flush, syncDraft} = setup();
  await apply('Remote');
  host.setInputValue('Local replacement', false, false);
  flush();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('Local replacement');
});

test('does not mark typing before a deferred hydration frame as received content', () => {
  const {host, editor, flush, syncDraft} = setup();
  const draft = richDraft('Remote');
  host.setInputValue('', true, false, draft, draft.rich_message);
  editor.setTextWithEntities('Typed before frame');
  flush();
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('Typed before frame');
});

test('saves what is typed over a rich draft the composer could not load', async() => {
  const {host, editor, syncDraft} = setup();
  expect(await host.setDraft(unsupportedDraft(), true)).toBe(false);
  expect(toastNew).toHaveBeenCalled();

  // Nothing of our own yet: the received draft must survive a chat leave.
  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();

  editor.setTextWithEntities('My own text');
  host.acceptUserEditOverUnsupportedRichMessageDraft();
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('My own text');
});
