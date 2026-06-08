import Button from '@components/buttonTsx';
import {OverlayedIcon} from '@components/icon';
import {openAiEditorPopup} from '@components/popups/aiEditorPopup/aiEditorPopup';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveFirst} from '@solid-primitives/refs';
import {createEffect, createMemo, onCleanup} from 'solid-js';
import type {ChatInputStateContext} from '.';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';

const shouldShowFromHeight = 72;

export function useAiEditorButton({instance, store}: ChatInputStateContext) {
  const {HotReloadGuard} = useHotReloadGuard();
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
      onClick: () => {
        const {value, entities} = getRichValueWithCaret(instance.messageInputField.input, true, false);
        openAiEditorPopup({
          peerId: instance.chat.peerId,
          text: {
            _: 'textWithEntities',
            text: value,
            entities: entities
          }
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
