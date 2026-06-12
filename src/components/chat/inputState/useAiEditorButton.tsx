import Button from '@components/buttonTsx';
import {OverlayedIcon} from '@components/icon';
import type InputField from '@components/inputField';
import {openAiEditorPopup} from '@components/popups/aiEditorPopup';
import {observeResize} from '@components/resizeObserver';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import track from '@helpers/solid/track';
import classNames from '@helpers/string/classNames';
import trimRichText from '@lib/richTextProcessor/trimRichText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveFirst} from '@solid-primitives/refs';
import {LocalTextWithEntities} from '@types';
import {Accessor, createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import type ChatInput from '../input';

export const defaultShouldShowFromHeight = 72;

type UseAiEditorButtonArgs = {
  instance: ChatInput;
  class?: string;
  container: Accessor<HTMLDivElement>;
  appendTo: () => HTMLDivElement;
  inputField: () => InputField;
  onApply: (text: LocalTextWithEntities) => void;
  canSend: boolean;
  shouldShowFromHeight?: Accessor<number>;
};

export function useAiEditorButton({instance, inputField, onApply, class: className, container, appendTo, canSend, shouldShowFromHeight = () => defaultShouldShowFromHeight}: UseAiEditorButtonArgs) {
  const [containerHeight, setContainerHeight] = createSignal(0);
  const canShowButton = createMemo(() => containerHeight() >= shouldShowFromHeight())

  createEffect(() => {
    if(!container()) return;

    const unobserve = observeResize(container(), (entry) => {
      setContainerHeight(entry.contentRect.height);
    });

    onCleanup(() => unobserve());
  });

  createEffect(() => {
    track(canShowButton); // appendTo might not be reactive
    if(!appendTo() || !inputField() || !canShowButton()) return;

    createAiEditorButton({instance, appendTo: appendTo(), inputField: inputField(), onApply, class: className, canSend});
  });
}

type CreateAiEditorButtonArgs = {
  instance: ChatInput;
  appendTo: HTMLDivElement;
  inputField: InputField;
  onApply: (text: LocalTextWithEntities) => void;
  canSend: boolean;
  class?: string;
};

const createAiEditorButton = ({instance, inputField, appendTo, onApply, class: className, canSend}: CreateAiEditorButtonArgs) => {
  const {HotReloadGuard, rootScope} = useHotReloadGuard();

  const icon = OverlayedIcon([
    'ai_letters',
    {icon: 'ai_star1', className: 'chat-input-ai-editor-button__star-1'},
    {icon: 'ai_star2', className: 'chat-input-ai-editor-button__star-2'}
  ], 'chat-input-ai-editor-button__icon');

  const button = Button({
    class: classNames('chat-input-ai-editor-button', className, 'btn-icon'),
    children: icon,
    onClick: async() => {
      const {value, entities} = getRichValueWithCaret(inputField.input, true, false);

      const ackedTones = await rootScope.managers.acknowledged.aiTonesManager.getTones();
      const initialTones = ackedTones.cached ? await ackedTones.result : undefined;

      openAiEditorPopup({
        peerId: instance.chat.peerId,
        text: {
          _: 'textWithEntities',
          ...trimRichText(value, entities)
        },
        onApply,
        onSend: !instance.chat.starsAmount && canSend ? async(text) => {
          const sendingParams = instance.chat.getMessageSendingParams();

          const result = await instance.Class.sendMessageWithForward({
            text,
            slowModeParams: instance.getDefaultParamsForSlowModeTooltip(),
            chatType: instance.chat.type,
            paidMessageInterceptor: instance.paidMessageInterceptor,
            sendingParams
          });

          if(result) instance.setInputValue('');
        } : undefined,
        initialTones
      }, HotReloadGuard);
    }
  });

  const child = resolveFirst(() => button);
  const element = child();

  appendTo.append(element);

  onCleanup(() => {
    element.remove();
  });
};
