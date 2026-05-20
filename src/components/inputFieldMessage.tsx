import InputFieldAnimated from '@components/inputFieldAnimated';
import createEmojiDropdownButton from '@components/emojiDropdownButton';
import classNames from '@helpers/string/classNames';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import ListenerSetter from '@helpers/listenerSetter';
import throttle from '@helpers/schedulers/throttle';
import {LangPackKey} from '@lib/langPack';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import {Accessor, createEffect, JSX, onCleanup, Ref, Show, untrack} from 'solid-js';
import {Portal} from 'solid-js/web';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import type {AnimationItemGroup} from '@components/animationIntersector';
import {IconTsx} from '@components/iconTsx';
import {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import Button from '@components/buttonTsx';
import Animated from '@helpers/solid/animations';
import {getTransition} from '@config/transitions';
import liteMode from '@helpers/liteMode';

type InputFieldMessageProps = {
  placeholder?: LangPackKey,
  name?: string,
  withLinebreaks?: boolean,
  maxLength?: number,
  animationGroup?: AnimationItemGroup,
  listenerSetter?: ListenerSetter,
  onScroll?: () => void,
  onInput?: (hasValue: boolean, length: number) => void,
  draft?: Parameters<InputFieldAnimated['setValueSilently']>[0],
  ref?: (inputField: InputFieldAnimated) => void,
  btnConfirm?: HTMLElement,
  btnProps?: Parameters<typeof Button>[0],
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
  let btnConfirm = untrack(() => props.btnConfirm);

  {
    const _additionalClass = additionalClass + '-confirm';
    const contentClass = _additionalClass + '-content';
    let contentWrapper: HTMLDivElement;
    const inner = () => (
      <Animated
        type="cross-fade"
        itemClass={contentClass + '-item'}
        noItemClass
      >
        <Show
          when={props.stars?.() ?? 0}
          fallback={<IconTsx icon="logo" class={_additionalClass + '-icon'} />}
        >
          <span class={_additionalClass + '-inner'}>
            <IconTsx icon="star" class={_additionalClass + '-inner-star'} />
            {numberThousandSplitterForStars(props.stars?.() ?? 0) + ''}
          </span>
        </Show>
      </Animated>
    );

    if(btnConfirm) {
      btnConfirm.classList.add(_additionalClass);

      <Portal
        mount={btnConfirm}
        ref={(el) => {
          contentWrapper = el;
          el.classList.add(contentClass);
        }}
      >
        {inner()}
      </Portal>;
    } else {
      <Button
        {...(props.btnProps || {})}
        ref={(ref) => {
          btnConfirm = ref;
          (props.btnProps?.ref as any)(ref);
        }}
        primaryFilled
        class={classNames(_additionalClass, props.btnProps.class)}
        noRipple
      >
        <div ref={contentWrapper} class={contentClass}>
          {inner()}
        </div>
      </Button>;
    }

    let prevWidth: number;
    createEffect(() => {
      props.stars?.();
      queueMicrotask(() => {
        const last = contentWrapper?.lastElementChild as HTMLElement | null;
        if(!last?.offsetWidth) return;
        const style = getComputedStyle(btnConfirm);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const minWidth = parseFloat(style.minWidth) || 0;
        const currentWidth = Math.max(last.offsetWidth + padding, minWidth);
        if(prevWidth !== undefined && prevWidth !== currentWidth && liteMode.isAvailable('animations')) {
          btnConfirm.animate([
            {width: prevWidth + 'px'},
            {width: currentWidth + 'px'}
          ], {
            duration: 200,
            easing: getTransition('standard').easing
          });
        }
        prevWidth = currentWidth;
      });
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
        const trimmed = value.trim();
        props.onInput(!!trimmed, trimmed ? value.length : 0);
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
      {btnConfirm}
    </div>
  );
};

export default InputFieldMessage;
