import {createMockManagers} from '@components/popupSandbox/mockManagers';
import {openAiEditorPopup, type AiEditorSendOptions} from '@components/popups/aiEditorPopup/aiEditorPopup';
import {openCreateWithAiPopup} from '@components/popups/aiEditorPopup/createWithAiPopup';
import PopupElement from '@components/popups/indexTsx';
import deferredPromise from '@helpers/cancellablePromise';
import type {RichMessage, TextWithEntities} from '@layer';
import rootScope from '@lib/rootScope';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import type {LocalTextWithEntities} from '@types';

/** Actual popup UI, with local generation/send outcomes controlled by the test. */
export function openAiPopupHarness(options: {rich: boolean, create?: boolean, scheduled?: boolean}) {
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
    getTones: () => [],
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
    canSendWhenOnline: () => {++onlineRequests; return online;}
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
