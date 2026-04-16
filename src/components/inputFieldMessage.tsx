import InputFieldAnimated from '@components/inputFieldAnimated';
import classNames from '@helpers/string/classNames';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import ListenerSetter from '@helpers/listenerSetter';
import throttle from '@helpers/schedulers/throttle';
import {LangPackKey} from '@lib/langPack';
import {JSX} from 'solid-js';

type InputFieldMessageProps = {
  class?: string;
  placeholder?: LangPackKey;
  name?: string;
  withLinebreaks?: boolean;
  maxLength?: number;
  animationGroup?: string;
  listenerSetter?: ListenerSetter;
  onScroll?: () => void;
  onInput?: (hasValue: boolean) => void;
  draft?: Parameters<InputFieldAnimated['setValueSilently']>[0];
  ref?: (inputField: InputFieldAnimated) => void;
  children?: JSX.Element;
};

const InputFieldMessage = (props: InputFieldMessageProps) => {
  const inputField = new InputFieldAnimated({
    placeholder: props.placeholder ?? 'PreviewSender.CaptionPlaceholder',
    name: props.name ?? 'message',
    withLinebreaks: props.withLinebreaks ?? true,
    maxLength: props.maxLength
  });

  if(props.animationGroup) {
    inputField.input.dataset.animationGroup = props.animationGroup;
  }

  inputField.input.classList.replace('input-field-input', 'input-message-input');
  inputField.inputFake.classList.replace('input-field-input', 'input-message-input');

  if(props.listenerSetter) {
    if(props.onScroll) {
      props.listenerSetter.add(inputField.input)('scroll', props.onScroll);
    }

    if(props.onInput) {
      props.listenerSetter.add(inputField.input)('input', throttle(() => {
        const {value} = getRichValueWithCaret(inputField.input);
        props.onInput(!!value.trim());
      }, 120, true));
    }
  }

  if(props.draft !== undefined) {
    inputField.setValueSilently(props.draft);
  }

  props.ref?.(inputField);

  return (
    <div class="popup-input-container">
      <div class={classNames('input-message-container', props.class)}>
        {inputField.input}
        {inputField.placeholder}
        {inputField.inputFake}
      </div>
      {props.children}
    </div>
  );
};

export default InputFieldMessage;
