import {describe, expect, test, vi} from 'vitest';
import {AiTonesManager} from '@appManagers/aiTonesManager';
import type {InputRichMessage, RichMessage, TextWithEntities} from '@layer';

const source: InputRichMessage.inputRichMessage = {
  _: 'inputRichMessage',
  pFlags: {},
  blocks: [{
    _: 'pageBlockHeading2',
    text: {_: 'textPlain', text: 'Original'}
  }]
};

const legacyText: TextWithEntities.textWithEntities = {
  _: 'textWithEntities',
  text: 'Original',
  entities: []
};

function makeManager(result: RichMessage.richMessage) {
  const manager = new AiTonesManager();
  const invokeApi = vi.fn(async(method: string) => {
    if(method === 'messages.translateRichMessage') {
      return {_: 'messages.translatedRichMessage', result: [result]};
    }
    if(method === 'messages.composeMessageWithAI') {
      return {
        _: 'messages.composedMessageWithAI',
        result_text: legacyText,
        diff_text: undefined
      };
    }

    return {_: 'messages.composedRichMessageWithAI', result};
  });
  const invokeWithRichMessageReferenceRetry = vi.fn((_input, invoke) => invoke());
  const assertRichMessage = vi.fn().mockResolvedValue(undefined);

  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appMessagesManager: {
      resolveInputRichMessage: vi.fn((input) => input),
      assertRichMessage,
      invokeWithRichMessageReferenceRetry
    },
    appDocsManager: {saveDoc: vi.fn((document) => document)},
    appPhotosManager: {savePhoto: vi.fn((photo) => photo)}
  });

  return {
    assertRichMessage,
    invokeApi,
    invokeWithRichMessageReferenceRetry,
    manager
  };
}

describe('rich AI compose transport', () => {
  test('keeps the structured result and falls back to the new side of textDiff', async() => {
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockHeading2',
        text: {
          _: 'textDiff',
          text: {_: 'textPlain', text: 'Corrected'},
          old_text: {_: 'textPlain', text: 'Original'}
        }
      }],
      photos: [],
      documents: []
    };
    const {
      assertRichMessage,
      invokeApi,
      invokeWithRichMessageReferenceRetry,
      manager
    } = makeManager(result);

    const composed = await manager.composeMessageWithAi({
      text: legacyText,
      richMessage: source,
      proofRead: true
    });

    expect(composed).toEqual({
      ok: true,
      data: {
        resultText: {
          _: 'textWithEntities',
          text: 'Corrected',
          entities: []
        },
        resultRichMessage: result
      }
    });
    expect(assertRichMessage).toHaveBeenCalledWith(source);
    expect(invokeWithRichMessageReferenceRetry).toHaveBeenCalledWith(
      source,
      expect.any(Function)
    );
    expect(invokeApi).toHaveBeenCalledWith('messages.composeRichMessageWithAI', {
      text: source,
      emojify: undefined,
      translate_to_lang: undefined,
      tone: undefined,
      proofread: true
    });
  });

  test('uses translateRichMessage for a pure structured translation', async() => {
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockHeading2',
        text: {_: 'textPlain', text: 'Translated'}
      }],
      photos: [],
      documents: []
    };
    const {invokeApi, manager} = makeManager(result);

    const translated = await manager.composeMessageWithAi({
      text: legacyText,
      richMessage: source,
      translateTo: 'de'
    });

    expect(translated.ok && translated.data.resultRichMessage).toBe(result);
    expect(invokeApi).toHaveBeenCalledWith('messages.translateRichMessage', {
      text: [source],
      to_lang: 'de'
    });
  });

  test('sends a single-use custom prompt through the rich compose API', async() => {
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Composed'}
      }],
      photos: [],
      documents: []
    };
    const {invokeApi, manager} = makeManager(result);
    (manager as any).tonesMap.set('formal', {
      _: 'aiComposeToneDefault',
      tone: 'formal'
    });

    const composed = await manager.composeMessageWithAi({
      text: legacyText,
      richMessage: source,
      toneNameOrId: 'formal',
      customPrompt: '  Make this concise  '
    });

    expect(composed.ok && composed.data.resultRichMessage).toBe(result);
    expect(invokeApi).toHaveBeenCalledWith('messages.composeRichMessageWithAI', {
      text: source,
      emojify: undefined,
      translate_to_lang: undefined,
      tone: {
        _: 'inputAiComposeToneSingleUse',
        custom_prompt: '  Make this concise  '
      },
      proofread: undefined
    });
  });

  test('creates a rich message without source text or reference validation', async() => {
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Created from scratch'}
      }],
      photos: [],
      documents: []
    };
    const {
      assertRichMessage,
      invokeApi,
      invokeWithRichMessageReferenceRetry,
      manager
    } = makeManager(result);

    const composed = await manager.composeMessageWithAi({
      text: {_: 'textWithEntities', text: '', entities: []},
      createRichMessage: true,
      customPrompt: '  Create a launch plan  ',
      translateTo: 'de',
      emojify: true
    });

    expect(composed.ok && composed.data.resultRichMessage).toBe(result);
    expect(assertRichMessage).not.toHaveBeenCalled();
    expect(invokeWithRichMessageReferenceRetry).not.toHaveBeenCalled();
    expect(invokeApi).toHaveBeenCalledWith('messages.composeRichMessageWithAI', {
      text: undefined,
      emojify: true,
      translate_to_lang: 'de',
      tone: {
        _: 'inputAiComposeToneSingleUse',
        custom_prompt: '  Create a launch plan  '
      },
      proofread: undefined
    });
  });

  test('supports a single-use prompt in the plain compose fallback', async() => {
    const result: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [],
      photos: [],
      documents: []
    };
    const {invokeApi, manager} = makeManager(result);

    const composed = await manager.composeMessageWithAi({
      text: legacyText,
      customPrompt: 'Rewrite as a question'
    });

    expect(composed.ok && composed.data.resultText).toBe(legacyText);
    expect(invokeApi).toHaveBeenCalledWith('messages.composeMessageWithAI', {
      text: legacyText,
      emojify: undefined,
      translate_to_lang: undefined,
      tone: {
        _: 'inputAiComposeToneSingleUse',
        custom_prompt: 'Rewrite as a question'
      },
      proofread: undefined
    });
  });
});
