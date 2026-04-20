import InputFieldAnimated from '@components/inputFieldAnimated';
import createEmojiDropdownButton from '@components/emojiDropdownButton';
import classNames from '@helpers/string/classNames';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import ListenerSetter from '@helpers/listenerSetter';
import throttle from '@helpers/schedulers/throttle';
import {LangPackKey} from '@lib/langPack';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import {Accessor, createEffect, JSX, onCleanup} from 'solid-js';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import type {AnimationItemGroup} from '@components/animationIntersector';
import replaceContent from '@helpers/dom/replaceContent';
import Icon from '@components/icon';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';

type InputFieldMessageProps = {
  placeholder?: LangPackKey,
  name?: string,
  withLinebreaks?: boolean,
  maxLength?: number,
  animationGroup?: AnimationItemGroup,
  listenerSetter?: ListenerSetter,
  onScroll?: () => void,
  onInput?: (hasValue: boolean) => void,
  draft?: Parameters<InputFieldAnimated['setValueSilently']>[0],
  ref?: (inputField: InputFieldAnimated) => void,
  children?: JSX.Element,
  btnConfirm?: HTMLElement,
  stars?: Accessor<number>
};

const InputFieldMessage = (props: InputFieldMessageProps) => {
  const inputField = new InputFieldAnimated({
    placeholder: props.placeholder ?? 'PreviewSender.CaptionPlaceholder',
    name: props.name ?? 'message',
    withLinebreaks: props.withLinebreaks ?? true,
    maxLength: props.maxLength
  });

  const additionalClass = 'simple-message-input';
  if(props.btnConfirm) {
    const _additionalClass = additionalClass + '-confirm';
    props.btnConfirm.classList.add(_additionalClass);

    const updateConfirmBtnContent = (stars: number) => {
      if(!stars) {
        replaceContent(
          props.btnConfirm,
          Icon('logo', _additionalClass + '-icon')
        );
        return;
      }

      const span = document.createElement('span');
      span.classList.add(_additionalClass + '-inner');
      span.append(
        Icon('star', _additionalClass + '-inner-star'),
        numberThousandSplitterForStars(stars) + ''
      );

      replaceContent(
        props.btnConfirm,
        span
      );
    };

    createEffect(() => {
      updateConfirmBtnContent(props.stars());
    });
  }

  if(props.animationGroup) {
    inputField.input.dataset.animationGroup = props.animationGroup;
  }

  [inputField.input, inputField.inputFake].forEach((input) => {
    input.classList.replace('input-field-input', 'input-message-input');
    input.classList.add(additionalClass + '-input');
  });

  inputField.placeholder.classList.add(
    'input-message-placeholder',
    additionalClass + '-placeholder'
  );

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

  let emoticonsDropdown: EmoticonsDropdown;
  const {button: emojiButton, dispose} = createEmojiDropdownButton({
    inputField,
    class: additionalClass + '-emoji',
    animationGroup: props.animationGroup,
    customParentElement: document.body,
    onEmoticonsDropdown: (dropdown) => {
      emoticonsDropdown = dropdown;
      emoticonsDropdown.getElement().style.transformOrigin = '0 100%';
    },
    getOpenPosition: () => {
      const rect = container.getBoundingClientRect();
      const cloned = cloneDOMRect(rect);
      cloned.left = rect.left;
      cloned.top = rect.top - 420 - 8;
      return cloned;
    }
  });

  onCleanup(dispose);

  props.ref?.(inputField);

  let container: HTMLDivElement;
  return (
    <div ref={container} class={additionalClass + '-container'}>
      {emojiButton}
      <div class={classNames('input-message-container', additionalClass + '-inputs')}>
        {inputField.input}
        {inputField.placeholder}
        {inputField.inputFake}
      </div>
      {props.children}
    </div>
  );
};

export default InputFieldMessage;
