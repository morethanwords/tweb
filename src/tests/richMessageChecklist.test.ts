import {RichMessage, RichText} from '@layer';
import toggleRichMessageChecklist from '@appManagers/utils/richMessage/toggleChecklist';

const text = (value: string): RichText => ({_: 'textPlain', text: value});

function makeRichMessage(): RichMessage.richMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{
      _: 'pageBlockDetails',
      pFlags: {open: true},
      title: text('Details'),
      blocks: [{
        _: 'pageBlockCover',
        cover: {
          _: 'pageBlockList',
          items: [{
            _: 'pageListItemBlocks',
            pFlags: {},
            blocks: [{
              _: 'pageBlockOrderedList',
              pFlags: {},
              items: [{
                _: 'pageListOrderedItemText',
                pFlags: {checkbox: true},
                text: text('Nested task')
              }]
            }]
          }]
        }
      }]
    }],
    photos: [],
    documents: []
  };
}

describe('rich message checklist paths', () => {
  test('immutably updates nested list items while treating covers as path-transparent', () => {
    const original = makeRichMessage();
    const updated = toggleRichMessageChecklist(original, [0, 0, 0, 0, 0], true);

    expect(updated).toBeTruthy();
    expect(updated).not.toBe(original);
    expect(original.blocks[0]).not.toHaveProperty(
      'blocks.0.cover.items.0.blocks.0.items.0.pFlags.checked'
    );
    expect(updated).toHaveProperty(
      'blocks.0.blocks.0.cover.items.0.blocks.0.items.0.pFlags.checked',
      true
    );
  });

  test('returns the same object for an idempotent update and rejects stale paths', () => {
    const original = makeRichMessage();
    const checked = toggleRichMessageChecklist(original, [0, 0, 0, 0, 0], true)!;

    expect(toggleRichMessageChecklist(checked, [0, 0, 0, 0, 0], true)).toBe(checked);
    expect(toggleRichMessageChecklist(checked, [0, 9], false)).toBeUndefined();
    expect(toggleRichMessageChecklist(checked, [0], false)).toBeUndefined();
  });
});
