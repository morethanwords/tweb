import {createEffect, createMemo, onCleanup} from 'solid-js';
import type {ChatInputStateContext} from '.';
import {OverlayedIcon} from '@components/icon';
import Button from '@components/buttonTsx';
import classNames from '@helpers/string/classNames';
import {resolveFirst} from '@solid-primitives/refs';

const shouldShowFromHeight = 72;

export function useAiEditorButton({instance, store}: ChatInputStateContext) {
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
      onClick: () => {}
    });

    const child = resolveFirst(() => button);
    const element = child();

    instance.newMessageWrapper.append(element);

    onCleanup(() => {
      element.remove();
    });
  });
}
