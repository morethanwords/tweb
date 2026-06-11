import type InputField from '@components/inputField';
import {LocalTextWithEntities} from '@types';
import {JSX} from 'solid-js';
import type ChatInput from '../input';
import {defaultShouldShowFromHeight, useAiEditorButton} from './useAiEditorButton';


type AiEditorButtonProps = {
  instance: ChatInput;
  container: HTMLDivElement;
  appendTo: HTMLDivElement;
  canSend: boolean;
  shouldShowFromHeight?: number;
  onApply: (text: LocalTextWithEntities) => void;
  inputField: InputField;
  class?: string;
};

export const AiEditorButton = (props: AiEditorButtonProps): JSX.Element => {
  useAiEditorButton({
    instance: props.instance,
    class: props.class,
    container: () => props.container,
    appendTo: () => props.appendTo,
    canSend: props.canSend,
    onApply: props.onApply,
    inputField: () => props.inputField,
    shouldShowFromHeight: () => props.shouldShowFromHeight ?? defaultShouldShowFromHeight
  });
  return null;
};
