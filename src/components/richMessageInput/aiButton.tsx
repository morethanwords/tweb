import type InputField from '@components/inputField';
import {LocalTextWithEntities} from '@types';
import {JSX} from 'solid-js';
import type {AiEditorContext} from '@components/richMessageInput/aiContext';
import {defaultShouldShowFromHeight, useAiEditorButton} from '@components/richMessageInput/ai';


type AiEditorButtonProps = {
  context: AiEditorContext;
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
    context: props.context,
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
