import Button from '@components/buttonTsx';
import {OverlayedIcon} from '@components/icon';
import {openAiEditorPopup} from '@components/popups/aiEditorPopup';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveFirst} from '@solid-primitives/refs';
import {createEffect, createMemo, onCleanup} from 'solid-js';
import type {ChatInputStateContext} from '.';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';

const shouldShowFromHeight = 72;

export function useAiEditorButton({instance, store}: ChatInputStateContext) {
  const {HotReloadGuard, rootScope} = useHotReloadGuard();
  const canShowButton = createMemo(() => store.inputMessageContainerHeight >= shouldShowFromHeight)

  createEffect(() => {
    if(!store.inputMessageContainerInited || !canShowButton()) return;

    const icon = OverlayedIcon([
      'ai_letters',
      {icon: 'ai_star1', className: 'chat-input-ai-editor-button__star-1'},
      {icon: 'ai_star2', className: 'chat-input-ai-editor-button__star-2'}
    ], 'chat-input-ai-editor-button__icon');

    const button = Button({
      class: classNames('chat-input-ai-editor-button', 'btn-icon'),
      children: icon,
      onClick: async() => {
        const {value, entities} = getRichValueWithCaret(instance.messageInputField.input, true, false);

        const ackedTones = await rootScope.managers.acknowledged.aiTonesManager.getTones();
        const initialTones = ackedTones.cached ? await ackedTones.result : undefined;

        openAiEditorPopup({
          peerId: instance.chat.peerId,
          text: {
            _: 'textWithEntities',
            text: value,
            entities: entities
          },
          onApply: (text) => {
            const node = wrapDraftText(text.text, {
              entities: text.entities,
              middleware: instance.getMiddleware(),
              wrappingForPeerId: instance.chat.peerId
            });
            instance.setInputValue(node, false, true);
          },
          onSend: (text) => {

          },
          initialTones
        }, HotReloadGuard);
      }
    });

    const child = resolveFirst(() => button);
    const element = child();

    instance.newMessageWrapper.append(element);

    onCleanup(() => {
      element.remove();
    });
  });
}
