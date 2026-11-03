import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import createChatInputEditor from '@components/chat/inputEditor';
import reloadChatInputEditor from '@components/chat/inputEditor/reload';
import deferredPromise from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import type {DraftMessage, InputReplyTo, MessageEntity} from '@layer';

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

function setup({canWriteRich = true} = {}) {
  mounted = mountChatInputEditor();
  const {editor, input} = mounted;
  let effect: string;
  // * a save is on its way until `confirmSaves` (or `failSave`) answers it, as the worker does once the server has
  const saves: ReturnType<typeof deferredPromise<boolean>>[] = [];
  const syncDraft = vi.fn((_args: {localDraft?: DraftMessage.draftMessage}) => {
    const save = deferredPromise<boolean>();
    saves.push(save);
    return save;
  });
  const host = Object.assign(Object.create(ChatInput.prototype), {
    chat: {type: ChatType.Chat, peerId: 42, threadId: undefined},
    messageInput: input,
    richMessageInput: {
      editor,
      canWriteRich,
      prepareForRichMessage() {},
      field: {input, syncFromInput() {}, setValueSilently: (value: string | Node) => host.richMessageInput.editor.setContent(value)}
    },
    inputValueGeneration: 0,
    // * as a chat opens with no draft (`setDraft` restoring): the empty field is what the server has
    appliedInputDraft: {value: undefined},
    draftSaveRevision: 0,
    managers: {appDraftsManager: {syncDraft, getDraft: async(): Promise<undefined> => undefined}},
    getMiddleware: () => () => true,
    effect: () => effect,
    setEffect: (value?: string) => effect = value,
    clearHelper: vi.fn(),
    // the field's resets ask for its save a while on (`clearHelper`): a test sets `pending` for that
    saveDraftDebounced: {pending: false, isDebounced() {return this.pending;}, clearTimeout() {this.pending = false;}},
    clearInput: vi.fn(async(_restore: boolean, _emit: boolean, value: string | {text: string, entities?: MessageEntity[]} = '') => {
      ++host.inputValueGeneration;
      host.appliedInputDraft = undefined;
      // * a plain draft comes as its text with entities
      if(typeof value === 'string') host.richMessageInput.editor.setTextWithEntities(value);
      else host.richMessageInput.editor.setTextWithEntities(value.text, value.entities);
    }),
    onMessageInput: vi.fn((_event?: Event, suppressDraftSync?: boolean) => {
      if(!suppressDraftSync && !host.processingDraftMessage) host.saveDraft();
    })
  });
  const flush = () => {while(frames.length) frames.shift()!();};
  /** a draft from elsewhere: the server's, another session's or tab's */
  const fromElsewhere = (draft: DraftMessage.draftMessage) => host.setDraft(draft, true);
  const apply = async(value: string) => {
    const result = await fromElsewhere(richDraft(value));
    flush();
    return result;
  };
  /** the saves on their way have gone through */
  const confirmSaves = async() => {
    saves.splice(0).forEach((save) => save.resolve(true));
    await pause(0);
  };
  return {host, editor, syncDraft, apply, flush, fromElsewhere, confirmSaves, saves};
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
  // * typed: its save is to go a while on (`onMessageInput` asks for it)
  expect(await apply('Other session')).toBe(false);
  host.saveDraft();
  expect(editor.getRichValue().value).toBe('My edit');
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('My edit');
});

// * the local text went to the server before the other session's draft did: that draft is the newer, and left out,
// * the field's older text would be saved over it as the chat is left
test('takes a newer draft from another session over text already saved here', async() => {
  const {host, editor, flush, syncDraft, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('Typed and saved');
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  await confirmSaves();
  expect(await fromElsewhere(richDraft('Newer elsewhere'))).toBe(true);
  flush();
  expect(editor.getRichValue().value).toBe('Newer elsewhere');
  // * leaving the chat does not put the older text back
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
});

// * two saves back to back (structural changes save at once): the first one's notice comes while the second is on its way
test('keeps the field over a save of its own that comes back late', async() => {
  const {host, editor, syncDraft} = setup();
  editor.setTextWithEntities('First');
  host.saveDraft();
  const first = syncDraft.mock.calls[0][0].localDraft;
  editor.setTextWithEntities('Second');
  host.saveDraft();
  expect(await host.setDraft(first, true)).toBe(false);
  expect(editor.getRichValue().value).toBe('Second');
});

// * the field emptied and saved at once: the notice of the save of its text before must not fill it again
test('keeps the field it emptied over a save of its own that comes back late', async() => {
  const {host, editor, syncDraft} = setup();
  editor.setTextWithEntities('First');
  host.saveDraft();
  const first = syncDraft.mock.calls[0][0].localDraft;
  mounted.tiptap.chain().selectAll().deleteSelection().run();
  host.saveDraft();
  expect(syncDraft.mock.calls[1][0].localDraft).toBeUndefined();
  expect(await host.setDraft(first, true)).toBe(false);
  expect(editor.isEmpty()).toBe(true);
});

// * a save that did not go through leaves the text the newest there is: no draft from elsewhere takes it, though no
// * save of it is pending any more
test('keeps text whose save failed over a draft from elsewhere', async() => {
  const {host, editor, saves, fromElsewhere} = setup();
  editor.setTextWithEntities('Mine, not saved');
  host.saveDraft();
  saves[0].reject({type: 'NETWORK_BAD_REQUEST'});
  await pause(0);
  expect(await fromElsewhere(richDraft('Older elsewhere'))).toBe(false);
  expect(editor.getRichValue().value).toBe('Mine, not saved');
});

// * the effect is the draft's: chosen after the text was saved, it is the field's own until saved too
test('keeps an effect chosen after the text was saved over a draft from elsewhere', async() => {
  const {host, editor, flush, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('With an effect');
  host.saveDraft();
  await confirmSaves();
  host.setEffect('42');
  expect(await fromElsewhere(richDraft('Elsewhere'))).toBe(false);
  flush();
  expect(editor.getRichValue().value).toBe('With an effect');
  expect(host.effect()).toBe('42');
});

// * a change that saves at once (a structural one) still has its save on the way to the worker: a draft sent from
// * there before it came is older
test('keeps a change whose save is on its way over a draft that came meanwhile', async() => {
  const {host, editor, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('Saved');
  host.saveDraft();
  await confirmSaves();
  editor.setTextWithEntities('Changed and saved at once');
  host.saveDraft();
  expect(await fromElsewhere(richDraft('Sent before it came'))).toBe(false);
  expect(editor.getRichValue().value).toBe('Changed and saved at once');
});

test('puts no draft over messages picked to forward', async() => {
  const {host, editor, syncDraft, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('A comment to them');
  host.forwarding = {[42]: [1, 2]};
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  await confirmSaves();
  expect(await fromElsewhere(richDraft('Elsewhere'))).toBe(false);
  expect(host.forwarding).toEqual({[42]: [1, 2]});
  expect(editor.getRichValue().value).toBe('A comment to them');
});

test('puts no draft over a post being suggested', async() => {
  const {host, editor, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('A post to suggest');
  // * its price and schedule are no part of a draft: the server's would turn it into an ordinary message
  host.suggestedPost = {stars: 100};
  host.saveDraft();
  await confirmSaves();
  expect(await fromElsewhere(richDraft('Elsewhere'))).toBe(false);
  expect(editor.getRichValue().value).toBe('A post to suggest');
});

test('keeps what is written while a draft from another session waits for the editor', async() => {
  const {host, editor, fromElsewhere, confirmSaves} = setup();
  editor.setTextWithEntities('Saved before');
  host.saveDraft();
  await confirmSaves();
  const ready = deferredPromise<void>();
  host.richMessageInput.richReady = ready;
  const applying = fromElsewhere(richDraft('Older elsewhere'));
  // * written and saved before the editor is ready: newer than the draft that came
  editor.setTextWithEntities('Written meanwhile');
  host.saveDraft();
  await confirmSaves();
  ready.resolve();
  expect(await applying).toBe(false);
  expect(editor.getRichValue().value).toBe('Written meanwhile');
});

// * the send emptied the field and its draft clear is back: the server's draft is as empty as the field
test('takes a draft from elsewhere into a field a send emptied once the send\'s clear is back', async() => {
  const {host, editor, flush, fromElsewhere} = setup();
  host.ownSends = [{clears: 1, until: Date.now() + 30e3, saveRevision: host.draftSaveRevision}];
  host.appliedInputDraft = undefined;
  expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(true);
  expect(await fromElsewhere(richDraft('Elsewhere'))).toBe(true);
  flush();
  expect(editor.getRichValue().value).toBe('Elsewhere');
});

// * a draft that came while the field's save was on its way is older than it, even if the save ends while it waits
test('keeps text whose save ends while a draft that came during it waits for the editor', async() => {
  const {host, editor, confirmSaves, fromElsewhere} = setup();
  editor.setTextWithEntities('Mine');
  host.saveDraft();
  const ready = deferredPromise<void>();
  host.richMessageInput.richReady = ready;
  const applying = fromElsewhere(richDraft('Older elsewhere'));
  await confirmSaves();
  ready.resolve();
  expect(await applying).toBe(false);
  expect(editor.getRichValue().value).toBe('Mine');
});

// * the clear comes back after the next message was begun, saved and erased: the erasing is the field's own, to save
test('saves the erasing of a message begun after a send whose clear comes back late', () => {
  const {host, editor, syncDraft} = setup();
  host.ownSends = [{clears: 1, until: Date.now() + 30e3, saveRevision: host.draftSaveRevision}];
  host.appliedInputDraft = undefined;
  editor.setTextWithEntities('Next message');
  host.saveDraft();
  editor.setTextWithEntities('');
  expect(host.takeOwnDraftUpdate(42, undefined, undefined, false, true)).toBe(true);
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(2);
  expect(syncDraft.mock.calls[1][0].localDraft).toBeUndefined();
});

// * a rich draft the field cannot show leaves it holding nothing of its own: the next draft that can be shown comes in
test('takes a draft from elsewhere after a restore whose rich draft it could not load', async() => {
  const {host, editor, flush, fromElsewhere} = setup();
  host.appliedInputDraft = undefined;
  host.managers.appDraftsManager.getDraft = async() => unsupportedDraft();
  expect(await host.setDraft(undefined, false)).toBe(false);
  expect(await fromElsewhere(richDraft('Can be shown'))).toBe(true);
  flush();
  expect(editor.getRichValue().value).toBe('Can be shown');
});

test('takes a plain draft from elsewhere after a restore whose rich draft it may not write', async() => {
  const {host, editor, flush, fromElsewhere} = setup({canWriteRich: false});
  host.appliedInputDraft = undefined;
  host.managers.appDraftsManager.getDraft = async() => richDraft('Rich');
  expect(await host.setDraft(undefined, false)).toBe(false);
  expect(await fromElsewhere({_: 'draftMessage', date: 0, pFlags: {}, message: 'Plain'})).toBe(true);
  flush();
  expect(editor.getRichValue().value).toBe('Plain');
});

// * a field restored with nothing there holds what the server has: the first draft from elsewhere fills it
test('fills a field restored empty with a draft from elsewhere', async() => {
  const {host, editor, flush, fromElsewhere} = setup();
  host.appliedInputDraft = undefined;
  expect(await fromElsewhere(richDraft('Before the restore'))).toBe(false);
  await host.setDraft(undefined, false);
  expect(await fromElsewhere(richDraft('Elsewhere'))).toBe(true);
  flush();
  expect(editor.getRichValue().value).toBe('Elsewhere');
});

test('puts no draft over a message being edited', async() => {
  const {host, editor, apply} = setup();
  editor.setTextWithEntities('The message as edited');
  host.editMsgId = 5;
  expect(await apply('Draft elsewhere')).toBe(false);
  expect(editor.getRichValue().value).toBe('The message as edited');
});

test.each(['reply', 'effect'] as const)('saves a locally changed %s even when text is unchanged', async(kind) => {
  const {host, apply, syncDraft} = setup();
  await apply('Remote');
  if(kind === 'reply') host.replyToMsgId = 9;
  else host.setEffect('42');
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  const draft = syncDraft.mock.calls[0][0].localDraft;
  if(kind === 'reply') expect((draft.reply_to as InputReplyTo.inputReplyToMessage).reply_to_msg_id).toBe(9);
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

// * left pending, the save the resets before a received draft asked for would hold off the draft's clear coming next
// * from the server (another session sent it), and then publish the draft back
test('leaves no save pending once a received draft is in', async() => {
  const {host, apply} = setup();
  host.saveDraftDebounced.pending = true;
  await apply('Remote');
  expect(host.saveDraftDebounced.isDebounced()).toBe(false);
});

test('counts the reply of a received draft as received, though it is set once its message is read', async() => {
  const {host, flush, syncDraft} = setup();
  host.initMessageReply = async({replyToMsgId}: {replyToMsgId: number}) => {
    await new Promise((resolve) => setTimeout(resolve));
    host.replyToMsgId = replyToMsgId;
  };
  const draft = richDraft('Remote');
  draft.reply_to = {_: 'inputReplyToMessage', reply_to_msg_id: 9} as DraftMessage.draftMessage['reply_to'];
  expect(await host.setDraft(draft, true)).toBe(true);
  flush();
  await new Promise((resolve) => setTimeout(resolve));
  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();
});

test('saves an effect chosen while the reply of a received draft is read', async() => {
  const {host, flush, syncDraft} = setup();
  const read = deferredPromise<void>();
  host.initMessageReply = async({replyToMsgId}: {replyToMsgId: number}) => {
    await read;
    host.replyToMsgId = replyToMsgId;
  };
  const draft = richDraft('Remote');
  draft.reply_to = {_: 'inputReplyToMessage', reply_to_msg_id: 9} as DraftMessage.draftMessage['reply_to'];
  await host.setDraft(draft, true);
  flush();
  host.setEffect('42');
  read.resolve();
  await new Promise((resolve) => setTimeout(resolve));
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.effect).toBe('42');
});

test('a clear that comes while the reply of a received draft is read leaves no text behind', async() => {
  const {host, editor, flush} = setup();
  const asked = deferredPromise<void>(), read = deferredPromise<void>();
  host.initMessageReply = async({replyToMsgId}: {replyToMsgId: number}) => {
    asked.resolve();
    await read;
    host.replyToMsgId = replyToMsgId;
  };
  const draft = richDraft('Remote');
  draft.reply_to = {_: 'inputReplyToMessage', reply_to_msg_id: 9} as DraftMessage.draftMessage['reply_to'];
  const applying = host.setDraft(draft, true);
  await asked;
  await host.setDraft(undefined, true);
  read.resolve();
  await applying;
  flush();
  expect(editor.isEmpty()).toBe(true);
});

test('keeps the undo history of an emptied composer when its own cleared draft comes back', async() => {
  const {host, editor, syncDraft} = setup();
  editor.setTextWithEntities('Typed and saved');
  host.saveDraft();
  // Cmd+A, Backspace
  mounted.tiptap.chain().selectAll().deleteSelection().run();
  expect(editor.isEmpty()).toBe(true);
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(2);
  expect(syncDraft.mock.calls[1][0].localDraft).toBeUndefined();
  // the drafts manager announces the cleared draft to every composer, this one included
  expect(await host.setDraft(undefined, true)).toBe(true);
  expect(host.clearInput).not.toHaveBeenCalled();
  expect(editor.undo()).toBe(true);
  expect(editor.getRichValue().value).toBe('Typed and saved');
});

test('a cleared draft still takes a reply off an otherwise empty composer', async() => {
  const {host} = setup();
  host.replyToMsgId = 9;
  host.getReplyTo = () => ({replyToMsgId: 9});
  // * the reply the server's draft brought
  host.appliedInputDraft = {value: host.getCurrentInputAsDraft()};
  await host.setDraft(undefined, true);
  expect(host.clearInput).toHaveBeenCalledWith(false, false);
  expect(host.clearHelper).toHaveBeenCalled();
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

// as Android has it: where rich text may not be written, a rich draft is not shown, and it stays on
// the server until something of the field's own replaces it
test('keeps a rich draft out of a field that may not write rich text', async() => {
  const {host, editor, syncDraft} = setup({canWriteRich: false});
  toastNew.mockClear();
  expect(await host.setDraft(richDraft('Remote'), true)).toBe(false);
  expect(editor.getRichValue().value).toBe('');
  expect(toastNew).not.toHaveBeenCalled();

  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();

  editor.setTextWithEntities('My own text');
  host.acceptUserEditOverUnsupportedRichMessageDraft();
  host.saveDraft();
  expect(syncDraft).toHaveBeenCalledTimes(1);
  expect(syncDraft.mock.calls[0][0].localDraft.message).toBe('My own text');
});

// the field picks its schema once rich posting's answer is in, replacing the editor: a draft fetched
// meanwhile must land in the new one, not be dropped as stale and then saved over as an empty field
test('restores a draft into the editor the field settles on', async() => {
  const {host, editor, syncDraft, flush} = setup();
  let settle: () => void;
  host.richMessageInput.richReady = new Promise<void>((resolve) => settle = resolve);
  let answer: (draft: DraftMessage.draftMessage) => void;
  host.managers.appDraftsManager.getDraft = () => new Promise((resolve) => answer = resolve);

  const restoring = host.setDraft(undefined, false);
  const replacement = reloadChatInputEditor(editor, createChatInputEditor, {});
  host.richMessageInput.editor = replacement;
  mounted.editor = replacement;
  settle();
  await Promise.resolve();
  answer(richDraft('Saved'));
  expect(await restoring).toBe(true);
  flush();

  expect(replacement.getRichValue().value).toBe('Saved');
  host.saveDraft();
  expect(syncDraft).not.toHaveBeenCalled();
});
