import '@/tests/mocks/chatInputEditorTableUi';
import {dispatchPaste, mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {MessageEntity} from '@layer';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import parseEntities from '@lib/richTextProcessor/parseEntities';

// * outside Apple's systems a message draws its emoji as pictures (wrapRichText), and so does this file
vi.mock('@lib/richTextProcessor/emojiImage', async(importOriginal) => ({
  ...await importOriginal<typeof import('@lib/richTextProcessor/emojiImage')>(),
  areAllEmojiNative: () => false,
  isEmojiNative: () => false
}));

describe('chat input editor: emoji drawn as pictures, pasted', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  // * a copy of several messages is the browser's copy of the chat's HTML: the emoji are in the alts
  test('pastes an emoji picture as the emoji, in the composer and a plain field', () => {
    for(const plainOnly of [false, true]) {
      const {editor, tiptap} = mountChatInputEditor({plainOnly});
      expect(tiptap.view.pasteHTML(
        '<div class="message">Hi <img class="emoji emoji-image" src="https://example.com/1f525.png" alt="🔥"> there</div>' +
        '<div class="message"><img class="emoji emoji-image" src="https://example.com/1f44d.png" alt="👍"></div>',
        new Event('paste') as ClipboardEvent
      )).toBe(true);
      expect(editor.getRichValue().value).toBe('Hi 🔥 there\n👍');
      editor.destroy();
    }
  });

  test('pastes only the selection of a whole copied document with emoji pictures in it', () => {
    const {editor, input} = mountChatInputEditor();
    const text = 'Selected text';
    dispatchPaste(input, '<html><body><p>Selected text</p>' +
      '<p>Unselected footer<img class="emoji emoji-image" src="https://example.com/1f525.png" alt="🔥"></p></body></html>', text);
    expect(editor.getRichValue().value).toBe(text);
    editor.destroy();
  });

  // * the chat's Copy puts the message's text and entities beside its HTML, vouched by the HTML's shape,
  // * emoji pictures included: pasted from those, its code block keeps its language
  test('pastes a message copied with its entities from them, emoji pictures in its HTML', () => {
    const {editor, tiptap} = mountChatInputEditor();
    const text = 'Hi 🔥\nconst a = 1;';
    const pre: MessageEntity = {_: 'messageEntityPre', offset: 6, length: 12, language: 'js'};
    const {html} = prepareTextWithEntitiesForCopying({text, entities: [...parseEntities(text), pre]});
    expect(html).toContain('emoji-image');
    expect(tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent)).toBe(true);
    const value = editor.getRichValue();
    expect(value.value).toBe(text);
    expect(value.entities).toEqual(expect.arrayContaining([pre]));
    editor.destroy();
  });
});
