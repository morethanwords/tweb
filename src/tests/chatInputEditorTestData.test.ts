import {createChatInputEditorTestData} from '@components/chat/inputEditor/testData';
import {tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';
import collectInputRichMessageReferences from '@appManagers/utils/richMessage/collectInputRichMessageReferences';
import {validateRichMessage} from '@appManagers/utils/richMessage/validateRichMessage';

describe('chat input editor test data', () => {
  test('keeps local previews out of server rich-message references', () => {
    const document = createChatInputEditorTestData();
    const richMessage = tiptapToRichMessage(document, {draft: true});
    const references = collectInputRichMessageReferences(richMessage.input);

    expect(references.documentIds).toEqual([]);
    expect(references.photoIds).toEqual([]);
    expect(richMessage.input.documents).toBeUndefined();
    expect(richMessage.input.photos).toBeUndefined();
    expect(JSON.stringify(richMessage.input)).not.toContain('chat-input-editor-test-photo');
  });

  test('produces a server-valid rich-message draft', () => {
    const document = createChatInputEditorTestData();
    const richMessage = tiptapToRichMessage(document, {draft: true});
    const serialized = JSON.stringify(richMessage.input);
    const map = document.content?.find((node) => node.type === 'richMap');

    expect(validateRichMessage(richMessage.input, undefined, {draft: true})).toMatchObject({
      valid: true,
      error: undefined
    });
    expect(map?.attrs?.block).toMatchObject({
      _: 'inputPageBlockMap',
      h: 200,
      w: 400
    });
    expect(serialized).not.toContain('pageBlockUnsupported');
    expect(serialized).toContain('pageBlockAnchor');
  });

  test('can omit the local preview when the application will upload real media', () => {
    const document = createChatInputEditorTestData({includeLocalMediaPreview: false});
    const serialized = JSON.stringify(document);

    expect(serialized).not.toContain('chat-input-editor-test-photo');
    expect(serialized).not.toContain('chat-input-editor-test-media');
    expect(serialized).not.toContain('richMedia');
  });
});
