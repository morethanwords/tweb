import fieldSectionStyles from '@/scss/modulePartials/fieldSectionPanel.module.scss';
import styles from '@components/simpleFormField/styles.module.scss';
import {requestRAF} from '@helpers/solid/requestRAF';
import {useMaxLengthError} from '@helpers/solid/useMaxLengthError';
import classNames from '@helpers/string/classNames';
import {Accessor, batch, createContext, createEffect, createMemo, createSignal, JSX, onCleanup, onMount, ParentProps, Ref, Setter, Show, splitProps, useContext} from 'solid-js';


type SimpleFormFieldContextValue = {
  input: Accessor<HTMLInputElement>;
  setInput: Setter<HTMLInputElement>;
  offsetElement: Accessor<HTMLElement>;
  setOffsetElement: Setter<HTMLElement>;
  value: Accessor<string>;
  onChange: (value: string) => void;
  forceFocused: Accessor<boolean>;
  useSetForceFocused: () => (focused: boolean) => void;
  forceError: Accessor<boolean>;
  useSetForceError: () => (error: boolean) => void;
};

const Context = createContext<SimpleFormFieldContextValue>();

export const useSimpleFormFieldContext = () => useContext(Context);


const SimpleFormField = (inProps: ParentProps<{
  value?: string;
  onChange?: (value: string) => void;

  onClick?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  isError?: boolean;
  clickable?: boolean;
  withEndButtonIcon?: boolean;
  withStartButtonIcon?: boolean;
  withMinHeight?: boolean;
  solidBackground?: boolean;
  hoverDisabled?: boolean;

  isMarkupTooltipHost?: boolean;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onChange' | 'onClick'>>) => {
  const [props, restProps] = splitProps(inProps, [
    'value',
    'onChange',
    'isError',
    'children',
    'onClick',
    'class',
    'classList',
    'clickable',
    'withEndButtonIcon',
    'withStartButtonIcon',
    'withMinHeight',
    'solidBackground',
    'hoverDisabled',
    'isMarkupTooltipHost'
  ]);

  const [input, setInput] = createSignal<HTMLInputElement>();
  const [offsetElement, setOffsetElement] = createSignal<HTMLElement>();

  const {value: forceFocused, useSetter: useSetForceFocused} = useForceState();
  const {value: forceError, useSetter: useSetForceError} = useForceState();

  const contextValue: SimpleFormFieldContextValue = {
    input,
    setInput,
    offsetElement,
    setOffsetElement,
    value: () => props.value,
    get onChange() {
      return props.onChange;
    },
    forceFocused,
    useSetForceFocused,
    forceError,
    useSetForceError
  };

  return (
    <Context.Provider value={contextValue}>
      <div
        class={classNames(styles.Container, props.class)}
        classList={{
          [styles.error]: props.isError || forceError(),
          [styles.clickable]: props.clickable,
          [styles.withEndButtonIcon]: props.withEndButtonIcon,
          [styles.withStartButtonIcon]: props.withStartButtonIcon,
          [styles.fixedHeight]: !props.withMinHeight,
          [styles.minHeight]: props.withMinHeight,
          [styles.forceFocused]: forceFocused(),
          [styles.solidBackground]: props.solidBackground,
          [styles.hoverEnabled]: !props.hoverDisabled,
          ...props.classList
        }}
        onClick={(...args) => {
          contextValue.input()?.focus();
          props.onClick?.(...args);
        }}
        data-markup-tooltip-host={props.isMarkupTooltipHost}
        {...restProps}
      >
        <div class={styles.BorderThin} />
        <div class={styles.BorderThick} />
        {props.children}
      </div>
    </Context.Provider>
  );
};

SimpleFormField.Input = (inProps: {
  ref?: Ref<HTMLInputElement>;
  forceFieldValue?: boolean;
} & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onInput' | 'ref'>) => {
  const [props, restProps] = splitProps(inProps, ['ref', 'class', 'forceFieldValue']);

  const context = useSimpleFormFieldContext();

  return (
    <input
      ref={(el) => batch(() => {
        context.setInput(el);
        context.setOffsetElement(el);
        if(props.ref instanceof Function) props.ref(el);
      })}
      class={classNames(styles.Input, props.class)}
      value={context.value()}
      onInput={(e) => {
        context.onChange(e.currentTarget.value)
        if(props.forceFieldValue) context.input().value = context.value();
      }}
      {...restProps}
    />
  );
};

SimpleFormField.InputStub = (props: ParentProps<{
  class?: string;
}>) => {
  const context = useSimpleFormFieldContext();

  return (
    <div
      ref={context.setOffsetElement}
      class={classNames(styles.InputStub, props.class)}
    >
      {props.children}
    </div>
  );
};

SimpleFormField.Label = (props: ParentProps<{
  active?: boolean;
  forceOffset?: number;
  maxLength?: number;
}>) => {
  const context = useSimpleFormFieldContext();

  const [offset, setOffset] = createSignal(0);
  const [noTransition, setNoTransition] = createSignal(true);

  onMount(() => {
    if(props.forceOffset || !context.offsetElement()) return;
    const parentElement = context.offsetElement().parentElement;
    if(!parentElement) return;

    const rect = parentElement.getBoundingClientRect();
    const inputRect = context.offsetElement().getBoundingClientRect();
    setOffset(inputRect.left - rect.left);
  });

  onMount(() => {
    requestRAF(() => {
      setNoTransition(false);
    });
  });

  return (
    <div
      class={styles.Label}
      classList={{
        [styles.active]: props.active || !!context.value(),
        [styles.noTransition]: noTransition()
      }}
      style={{
        '--offset': `${props.forceOffset || offset()}px`
      }}
    >
      {props.children}
      <Show when={props.maxLength}>
        <LabelMaxLength maxLength={props.maxLength} />
      </Show>
    </div>
  );
};

const LabelMaxLength = (props: {maxLength: number}) => {
  const context = useSimpleFormFieldContext();

  const {shouldShowLengthLeft, lengthLeft, hasError} = useMaxLengthError(context.value, () => props.maxLength);

  const setForceError = context.useSetForceError();
  createEffect(() => {
    setForceError(hasError());
  });

  return (
    <Show when={shouldShowLengthLeft()}>
      {' '}({lengthLeft()})
    </Show>
  );
};

type SideContentProps = JSX.HTMLAttributes<HTMLDivElement> & {
  class?: string;
  first?: boolean;
  last?: boolean;
  withFixedIcon?: boolean;
};

SimpleFormField.SideContent = (inProps: SideContentProps) => {
  const [props, restProps] = splitProps(inProps, ['class', 'first', 'last', 'withFixedIcon', 'classList', 'children']);
  return (
    <div
      class={classNames(styles.SideContent, props.class)}
      classList={{
        [styles.first]: props.first,
        [styles.last]: props.last,
        [styles.withFixedIcon]: props.withFixedIcon,
        ...props.classList
      }}
      {...restProps}
    >
      {props.children}
    </div>
  );
};

type WithLengthCounterProps = SideContentProps & {
  showLengthLeft: boolean;
  lengthLeft: number;
};

SimpleFormField.WithLengthCounter = (inProps: WithLengthCounterProps) => {
  const [props, restProps] = splitProps(inProps, ['class', 'showLengthLeft', 'lengthLeft', 'children']);

  return (
    <SimpleFormField.SideContent
      class={classNames(styles.withLimit, props.class)}
      {...restProps}
    >
      {props.children}
      <Show when={props.showLengthLeft}>
        <div class={styles.lengthLeft}>
          {props.lengthLeft}
        </div>
      </Show>
    </SimpleFormField.SideContent>
  );
};

type WithAutoLengthCounterProps = SideContentProps & {
  maxLength: number;
};

SimpleFormField.WithAutoLengthCounter = (inProps: WithAutoLengthCounterProps) => {
  const [props, restProps] = splitProps(inProps, ['maxLength']);

  const context = useSimpleFormFieldContext();

  const {shouldShowLengthLeft, lengthLeft, hasError} = useMaxLengthError(context.value, () => props.maxLength);

  const setForceError = context.useSetForceError();
  createEffect(() => {
    setForceError(hasError());
  });

  return (
    <SimpleFormField.WithLengthCounter
      showLengthLeft={shouldShowLengthLeft()}
      lengthLeft={lengthLeft()}
      {...restProps}
    />
  );
};

SimpleFormField.Section = (inProps: JSX.HTMLAttributes<HTMLDivElement>) => {
  const [props, restProps] = splitProps(inProps, ['class']);

  return (
    <div class={classNames(fieldSectionStyles.fieldSectionPanel, props.class)} {...restProps} />
  );
};

SimpleFormField.Caption = (inProps: JSX.HTMLAttributes<HTMLDivElement>) => {
  const [props, restProps] = splitProps(inProps, ['class']);

  return (
    <div class={classNames(fieldSectionStyles.fieldSectionCaption, props.class)} {...restProps} />
  );
};

/**
 * Aggregates a boolean state across multiple independent consumers.
 *
 * Each consumer obtains its own setter via `useSetter()`. The aggregated
 * `value` is `true` whenever at least one consumer has set its flag to `true`.
 * The setter is automatically reset on cleanup of the calling owner.
 */
export const useForceState = () => {
  type ObjectRef = {};

  const [refs, setRefs] = createSignal<ObjectRef[]>([]);

  const value = createMemo(() => refs().length > 0);

  const useSetter = () => {
    const ref: ObjectRef = {};

    const setter = (active: boolean) =>
      setRefs(refs => {
        const filtered = refs.filter((other) => other !== ref);
        return active ? [...filtered, ref] : filtered;
      });

    onCleanup(() => {
      setter(false);
    });

    return setter;
  };

  return {value, useSetter};
};

export default SimpleFormField;
