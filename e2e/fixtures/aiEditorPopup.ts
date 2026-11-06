import {createMockManagers} from '@components/popupSandbox/mockManagers';
import {openAiEditorPopup, type AiEditorSendOptions} from '@components/popups/aiEditorPopup/aiEditorPopup';
import {openCreateWithAiPopup} from '@components/popups/aiEditorPopup/createWithAiPopup';
import PopupElement from '@components/popups/indexTsx';
import deferredPromise from '@helpers/cancellablePromise';
import type {AiComposeTone, RichMessage, TextWithEntities} from '@layer';
import rootScope from '@lib/rootScope';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import type {LocalTextWithEntities} from '@types';
import type {AiSendStyle} from '@components/chat/aiSendStyles';

/** Actual popup UI, with local generation/send outcomes controlled by the test. */
export function openAiPopupHarness(options: {
  rich: boolean,
  create?: boolean,
  scheduled?: boolean,
  /** "Always use in this chat" is offered, with this request kept for the chat; `refuse` has keeping fail */
  sendStyle?: {saved?: AiSendStyle, refuse?: boolean},
  /** how many styles the style tab lists besides its own Prompt and Create */
  tones?: number
}) {
  const controller = createMockManagers();
  const generated: TextWithEntities.textWithEntities = {
    _: 'textWithEntities', text: 'Generated text', entities: [{_: 'messageEntityBold', offset: 0, length: 9}]
  };
  const richMessage: RichMessage.richMessage = {
    _: 'richMessage', pFlags: {}, documents: [], photos: [], blocks: [
      {_: 'pageBlockHeader', text: {_: 'textPlain', text: 'Generated heading'}},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Generated text'}}
    ]
  };
  let generations = 0;
  controller.override({aiTonesManager: {
    getTones: (): AiComposeTone[] => Array.from({length: options.tones ?? 0}, (_, index) => ({
      _: 'aiComposeToneDefault', tone: 'tone' + index, emoji_id: '1', title: 'Style ' + index
    })),
    composeMessageWithAi: async() => {
      ++generations;
      return {ok: true, data: {resultText: generated, resultRichMessage: options.rich ? richMessage : undefined}};
    }
  }});
  // This fixture is only imported after the no-session popup sandbox has booted.
  rootScope.managers = controller.managers;
  PopupElement.MANAGERS = controller.managers;
  const calls: Array<{action: string, value: unknown, options?: AiEditorSendOptions}> = [];
  let pending: ReturnType<typeof deferredPromise<boolean>>;
  const online = deferredPromise<boolean>();
  let onlineRequests = 0;
  const act = (action: string, value: unknown, options?: AiEditorSendOptions) => {
    calls.push({action, value, options});
    pending = deferredPromise<boolean>();
    return pending;
  };
  const callbacks = {
    peerId: 777002 as PeerId,
    onApply: (value: LocalTextWithEntities) => act('apply', value),
    onApplyRichMessage: (value: RichMessage) => act('apply-rich', value)
  };
  if(options.create) openCreateWithAiPopup(callbacks, HotReloadGuard);
  else openAiEditorPopup({
    ...callbacks,
    text: {_: 'textWithEntities', text: 'Original draft', entities: []},
    richMessage: options.rich ? {_: 'inputRichMessage', pFlags: {}, blocks: richMessage.blocks} : undefined,
    onSend: (value, options) => act('send', value, options),
    onSendRichMessage: (value, options) => act('send-rich', value, options),
    isScheduled: options.scheduled,
    canSendWhenOnline: () => {++onlineRequests; return online;},
    ...(options.sendStyle ? {
      savedSendStyle: options.sendStyle.saved,
      onSaveSendStyle: (style: AiSendStyle) => {
        calls.push({action: 'save-style', value: style});
        return !options.sendStyle.refuse;
      }
    } : {})
  }, HotReloadGuard);
  return {
    state: () => ({calls, generations, onlineRequests}),
    finish: (result: boolean | 'error') => {
      if(result === 'error') pending.reject(new Error('FIXTURE_SEND_FAILED'));
      else pending.resolve(result);
    },
    finishOnline: () => online.resolve(true)
  };
}

export type AiPopupHarness = ReturnType<typeof openAiPopupHarness>;
