import '@helpers/peerIdPolyfill';
import type {PageBlock, RichMessage, RichText} from '@layer';
import wrapTelegramRichText from '@lib/richTextProcessor/wrapTelegramRichText';
import {flattenRichMessageSummary} from '@lib/richMessage';
import {validateRichMessage} from '@appManagers/utils/richMessage/validateRichMessage';
import collectInputRichMessageReferences from '@appManagers/utils/richMessage/collectInputRichMessageReferences';
import {inputPageBlock} from '@lib/richTextProcessor/inputRichMessageBlocks';
import inferRichMessageNoAutolink from '@lib/richTextProcessor/inferRichMessageNoAutolink';

const plain = (text: string): RichText.textPlain => ({_: 'textPlain', text});

const urlButton: RichText.textButton = {
  _: 'textButton',
  text: plain('Open'),
  type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'},
  style: {_: 'richButtonStyle', pFlags: {bg_primary: true}}
};

const profileButton: RichText.textButton = {
  _: 'textButton',
  text: plain('Profile'),
  type: {_: 'inlineButtonTypeUserProfile', user_id: 42}
};

function buttonRow(buttons: PageBlock.pageBlockButtonRow['buttons'], pFlags: PageBlock.pageBlockButtonRow['pFlags'] = {}): PageBlock.pageBlockButtonRow {
  return {_: 'pageBlockButtonRow', pFlags, buttons};
}

describe('layer 229 buttons in rich text', () => {
  test('an inline button marks its label, and a link button carries the link too', () => {
    const wrapped = wrapTelegramRichText({
      _: 'textConcat',
      texts: [plain('Tap '), urlButton, plain(' now')]
    });

    expect(wrapped.text).toBe('Tap Open now');
    expect(wrapped.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({_: 'messageEntityRichButton', offset: 4, length: 4, button: urlButton}),
      expect.objectContaining({_: 'messageEntityTextUrl', offset: 4, length: 4, url: 'https://telegram.org'})
    ]));

    const copy = wrapTelegramRichText({
      _: 'textButton',
      text: plain('Copy'),
      type: {_: 'inlineButtonTypeCopy', copy_text: 'secret'}
    });
    expect(copy.entities.map((entity) => entity._)).toEqual(['messageEntityRichButton']);
  });

  test('a summary keeps only the labels', () => {
    const message: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [
        {_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [plain('Tap '), urlButton]}},
        buttonRow([
          {_: 'pageButton', text: plain('One'), type: {_: 'inlineButtonTypeDisabled'}},
          {_: 'pageButton', text: plain('Two'), type: {_: 'inlineButtonTypeDisabled'}}
        ])
      ],
      photos: [],
      documents: []
    };

    const summary = flattenRichMessageSummary(message, 0);
    expect(summary.text).toBe('Tap Open\nOne Two');
    expect(summary.entities.some((entity) => entity._ === 'messageEntityRichButton')).toBe(false);
  });

  test('a user may send a link, copy, profile or disabled button — and nothing that acts on a bot', () => {
    const valid = validateRichMessage([
      {_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [plain('Hi '), urlButton, profileButton]}},
      buttonRow([
        {_: 'pageButton', text: plain('Copy'), type: {_: 'inlineButtonTypeCopy', copy_text: 'code'}},
        {_: 'pageButton', text: plain('Soon'), type: {_: 'inlineButtonTypeDisabled'}}
      ], {align_center: true})
    ]);
    expect(valid.valid).toBe(true);
    expect(valid.metrics.textLength).toBe('Hi OpenProfileCopySoon'.length);

    const callback = validateRichMessage([buttonRow([{
      _: 'pageButton',
      text: plain('Press'),
      type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}
    }])]);
    expect(callback).toMatchObject({valid: false, error: 'unsupported'});

    const unlabeled = validateRichMessage([buttonRow([{
      _: 'pageButton',
      text: plain(''),
      type: {_: 'inlineButtonTypeDisabled'}
    }])]);
    expect(unlabeled).toMatchObject({valid: false, error: 'content'});

    const twoAlignments = validateRichMessage([buttonRow([{
      _: 'pageButton',
      text: plain('A'),
      type: {_: 'inlineButtonTypeDisabled'}
    }], {align_left: true, align_right: true})]);
    expect(twoAlignments).toMatchObject({valid: false, error: 'invalid'});
  });

  test('a profile button brings its user into the message, and a file block its document', () => {
    const references = collectInputRichMessageReferences({
      _: 'inputRichMessage',
      pFlags: {},
      blocks: [
        {_: 'pageBlockParagraph', text: profileButton},
        buttonRow([{_: 'pageButton', text: plain('Me'), type: {_: 'inlineButtonTypeUserProfile', user_id: 7}}]),
        {_: 'pageBlockDocument', document_id: 555, caption: {_: 'pageCaption', text: plain(''), credit: plain('')}}
      ]
    });

    expect(references.userIds.map(Number).sort((a, b) => a - b)).toEqual([7, 42]);
    expect(references.documentIds.map(Number)).toEqual([555]);
  });

  test('buttons survive the trip back into an input message, and their labels never autolink', () => {
    const row = buttonRow([{_: 'pageButton', text: plain('Go'), type: {_: 'inlineButtonTypeUrl', url: 'https://t.me'}}], {align_right: true});
    expect(inputPageBlock(row)).toEqual(row);

    expect(inferRichMessageNoAutolink({
      _: 'richMessage',
      pFlags: {},
      blocks: [buttonRow([{_: 'pageButton', text: plain('https://t.me'), type: {_: 'inlineButtonTypeDisabled'}}])],
      photos: [],
      documents: []
    })).toBe(false);
  });
});
