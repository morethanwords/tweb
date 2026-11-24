import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import createChatInputEditor from '@components/chat/inputEditor';
import reloadChatInputEditor from '@components/chat/inputEditor/reload';
import type {ChatInputEditorSnapshot} from '@components/chat/inputEditor/types';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {createRichMediaPreviewUrl} from '@components/chat/inputEditor/mediaPreviewUrl';
import type {Photo} from '@layer';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

describe('setting a composed message aside', () => {
  let host: any;
  let mounted: ReturnType<typeof mountChatInputEditor>;

  beforeEach(() => {
    mounted = mountChatInputEditor();
    host = Object.assign(Object.create(ChatInput.prototype), {
      chat: {type: ChatType.Chat, peerId: 42},
      messageInput: mounted.input,
      richMessageInput: {
        editor: mounted.editor,
        restoreSnapshot(snapshot: ChatInputEditorSnapshot) {
          this.editor = reloadChatInputEditor(this.editor, createChatInputEditor, {}, {...snapshot, focused: false});
        }
      },
      parkedDrafts: new Map(),
      btnParkDraft: document.createElement('button'),
      saveDraftDebounced: {clearTimeout: vi.fn()},
      inputValueGeneration: 0,
      onMessageInput: vi.fn()
    });
  });

  afterEach(() => {
    host.richMessageInput.editor.destroy();
    host.parkedDrafts.forEach(({release}: {release: () => void}) => release());
    mounted.input.remove();
  });

  it('clears the field, swaps both formatted documents, then restores into an empty field', () => {
    host.messageInputEditor.setTextWithEntities('First message', [{_: 'messageEntityBold', offset: 0, length: 5}]);
    const first = host.messageInputEditor.getRichValue(true);
    host.swapParkedDraft();
    expect(host.messageInputEditor.isEmpty()).toBe(true);
    host.messageInputEditor.setTextWithEntities('Second message', [{_: 'messageEntityItalic', offset: 0, length: 6}]);
    const second = host.messageInputEditor.getRichValue(true);
    host.swapParkedDraft();
    expect(host.messageInputEditor.getRichValue(true).entities).toEqual(first.entities);
    expect(host.messageInputEditor.getRichValue().value).toBe(first.value);
    host.swapParkedDraft();
    expect(host.messageInputEditor.getRichValue(true).entities).toEqual(second.entities);
    expect(host.messageInputEditor.getRichValue().value).toBe(second.value);
    host.messageInputEditor.setTextWithEntities('');
    host.swapParkedDraft();
    expect(host.messageInputEditor.getRichValue().value).toBe(first.value);
    expect(host.parkedDrafts.size).toBe(0);
  });

  it('keeps parked messages separate for topics and peers', () => {
    host.messageInputEditor.setTextWithEntities('Topic one');
    host.swapParkedDraft();
    host.chat.threadId = 17;
    host.messageInputEditor.setTextWithEntities('Topic two');
    host.swapParkedDraft();
    host.chat.peerId = 43;
    host.messageInputEditor.setTextWithEntities('Other chat');
    host.swapParkedDraft();
    host.chat.peerId = 42;
    host.swapParkedDraft();
    expect(host.messageInputEditor.getRichValue().value).toBe('Topic two');
    expect(host.parkedDrafts.size).toBe(2);
  });

  it('retains media previews while parked and releases them after the restored editor closes', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:parked-media');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    expect(host.messageInputEditor.insertRichMedia([{
      type: 'photo',
      photo: {_: 'photo', id: '1', access_hash: '2', file_reference: new Uint8Array([1])} as Photo.photo,
      previewUrl: preview.url
    }])).toBe(true);
    preview.release();
    const before = host.messageInputEditor.getDocument();
    host.swapParkedDraft();
    expect(revoke).not.toHaveBeenCalledWith(preview.url);
    host.swapParkedDraft();
    expect(host.messageInputEditor.getDocument()).toEqual(before);
    expect(revoke).not.toHaveBeenCalledWith(preview.url);
    host.messageInputEditor.setTextWithEntities('');
    expect(revoke).toHaveBeenCalledWith(preview.url);
  });
});
