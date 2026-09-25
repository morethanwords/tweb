import {useChatInputEditorHarness, tableDocument} from '@/tests/helpers/chatInputEditorHarness';
import {richMessageToTiptap, tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';
import canSafelyEditRichMessage from '@components/chat/inputEditor/richMessageEditability';
import type {PageBlock, RichMessage, RichText} from '@layer';

const plain = (text: string): RichText.textPlain => ({_: 'textPlain', text});

function richMessage(blocks: PageBlock[]): RichMessage.richMessage {
  return {_: 'richMessage', pFlags: {}, blocks, photos: [], documents: []};
}

describe('Tiptap chat input editor: layer 229 buttons', () => {
  const {mountEditor} = useChatInputEditorHarness();

  test('puts a button inside the text and sends it as a textButton', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Read ');
    editor.restoreSelection({from: 6, to: 6}, false);

    expect(editor.insertRichButton({
      text: 'the docs',
      action: 'url',
      url: 'https://core.telegram.org',
      color: 'primary'
    })).toBe(true);

    expect(editor.getMode()).toBe('rich');
    expect(editor.getRichMessage().input.blocks).toEqual([{
      _: 'pageBlockParagraph',
      text: {
        _: 'textConcat',
        texts: [plain('Read '), {
          _: 'textButton',
          text: plain('the docs'),
          type: {_: 'inlineButtonTypeUrl', url: 'https://core.telegram.org'},
          style: {_: 'richButtonStyle', pFlags: {bg_primary: true, bg_success: undefined, bg_danger: undefined, link: undefined}}
        }]
      }
    }]);
  });

  test('puts a row of buttons on a line of its own and sends it as pageBlockButtonRow', () => {
    const {editor} = mountEditor();
    expect(editor.insertRichButton({
      text: 'Copy the code',
      action: 'copy',
      copyText: 'TELEGRAM',
      separateLine: true
    })).toBe(true);

    const [row] = editor.getRichMessage().input.blocks as [PageBlock.pageBlockButtonRow];
    expect(row).toEqual({
      _: 'pageBlockButtonRow',
      pFlags: {align_left: undefined, align_center: undefined, align_right: undefined},
      buttons: [{
        _: 'pageButton',
        text: plain('Copy the code'),
        type: {_: 'inlineButtonTypeCopy', copy_text: 'TELEGRAM'},
        style: undefined
      }]
    });
  });

  test('round-trips buttons a user may author, rows keep their alignment', () => {
    const blocks: PageBlock[] = [
      {
        _: 'pageBlockParagraph',
        text: {
          _: 'textConcat',
          texts: [plain('Say hi to '), {
            _: 'textButton',
            text: plain('Pavel'),
            type: {_: 'inlineButtonTypeUserProfile', user_id: 1},
            style: {_: 'richButtonStyle', pFlags: {link: true}}
          }]
        }
      },
      {
        _: 'pageBlockButtonRow',
        pFlags: {align_center: true},
        buttons: [
          {_: 'pageButton', text: plain('Site'), type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'}},
          {
            _: 'pageButton',
            text: plain('Soon'),
            type: {_: 'inlineButtonTypeDisabled'},
            style: {_: 'richButtonStyle', pFlags: {bg_danger: true}}
          }
        ]
      }
    ];

    expect(canSafelyEditRichMessage(richMessage(blocks))).toBe(true);
    const document = richMessageToTiptap(richMessage(blocks));
    expect(document.content?.map((node) => node.type)).toEqual(['paragraph', 'buttonRow']);
    expect(document.content?.[1].attrs).toMatchObject({align: 'center', buttons: [
      {action: 'url', url: 'https://telegram.org', label: [{type: 'text', text: 'Site'}]},
      {action: 'disabled', color: 'danger', label: [{type: 'text', text: 'Soon'}]}
    ]});

    const {input} = tiptapToRichMessage(document);
    expect(input.blocks[0]).toMatchObject({
      _: 'pageBlockParagraph',
      text: {texts: [plain('Say hi to '), {
        _: 'textButton',
        type: {_: 'inlineButtonTypeUserProfile', user_id: 1},
        style: {pFlags: {link: true}}
      }]}
    });
    expect(input.blocks[1]).toMatchObject({
      _: 'pageBlockButtonRow',
      pFlags: {align_center: true},
      buttons: [
        {text: plain('Site'), type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'}},
        {text: plain('Soon'), type: {_: 'inlineButtonTypeDisabled'}, style: {pFlags: {bg_danger: true}}}
      ]
    });

    const {editor} = mountEditor();
    editor.setDocument(document);
    expect(editor.getRichMessage().input.blocks).toEqual(input.blocks);
  });

  test('draws every button as a real button, which Tab reaches and which opens its box', () => {
    const {editor, input} = mountEditor();
    const label = (text: string) => [{type: 'text', text}];
    editor.setDocument({
      type: 'doc',
      content: [
        {type: 'paragraph', content: [
          {type: 'text', text: 'Take '},
          {type: 'richButton', attrs: {action: 'copy', copyText: 'TELEGRAM', label: label('Copy')}}
        ]},
        {type: 'buttonRow', attrs: {align: null, buttons: [{
          action: 'disabled', url: '', copyText: '', userId: null, color: null, link: false, label: label('Soon')
        }]}}
      ]
    });

    const chips = Array.from(input.querySelectorAll<HTMLButtonElement>('.chat-input-rich-button'));
    expect(chips.map((chip) => [chip.tagName, chip.type, chip.getAttribute('aria-haspopup'), chip.textContent])).toEqual([
      ['BUTTON', 'button', 'dialog', 'Copy'],
      ['BUTTON', 'button', 'dialog', 'Soon']
    ]);
    expect(chips.every((chip) => chip.tabIndex === 0 && !chip.hasAttribute('role'))).toBe(true);
  });

  test('a bot\'s button is not the composer\'s to author: such a message is not edited', () => {
    expect(canSafelyEditRichMessage(richMessage([{
      _: 'pageBlockButtonRow',
      pFlags: {},
      buttons: [{
        _: 'pageButton',
        text: plain('Press'),
        type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}
      }]
    }]))).toBe(false);
  });

  test('keeps a compact table compact (layer 229)', () => {
    const {editor} = mountEditor();
    const document = tableDocument([['A', 'B'], ['1', '2']]);
    const table = document.content[0];
    table.attrs = {...table.attrs, compact: true};
    editor.setDocument(document);

    const [block] = editor.getRichMessage().input.blocks as [PageBlock.pageBlockTable];
    expect(block.pFlags.compact).toBe(true);
    const restored = richMessageToTiptap(richMessage([block]));
    expect(restored.content?.[0].content?.[1].attrs).toMatchObject({compact: true});
  });
});
