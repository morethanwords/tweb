import styles from '@components/simpleFormField/styles.module.scss';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {Accessor, batch, createContext, createMemo, createSignal, JSX, onCleanup, onMount, ParentProps, Ref, Setter, splitProps, useContext} from 'solid-js';


type SimpleFormFieldContextValue = {
  input: Accessor<HTMLInputElement>;
  setInput: Setter<HTMLInputElement>;
  offsetElement: Accessor<HTMLElement>;
  setOffsetElement: Setter<HTMLElement>;
  value: Accessor<string>;
  onChange: (value: string) => void;
  forceFocused: Accessor<boolean>;
  useSetForceFocused: () => (focused: boolean) => void;
};

const Context = createContext<SimpleFormFieldContextValue>();

export const useSimpleFormFieldContext = () => useContext(Context);

type ObjectRef = {};

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
    'hoverDisabled'
  ]);

  const [input, setInput] = createSignal<HTMLInputElement>();
  const [offsetElement, setOffsetElement] = createSignal<HTMLElement>();

  const [forceFocusedRefs, setForceFocusedRefs] = createSignal<ObjectRef[]>([]);

  const forceFocused = createMemo(() => forceFocusedRefs().length > 0);

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
    useSetForceFocused: () => {
      const ref = {};

      const setter = (focused: boolean) => {
        const newValue = forceFocusedRefs().filter((ref) => ref !== ref);

        setForceFocusedRefs(
          focused ? [...newValue, ref] : newValue
        );
      };

      onCleanup(() => {
        setter(false);
      });

      return setter;
    }
  };

  return (
    <Context.Provider value={contextValue}>
      <div
        class={classNames(styles.Container, props.class)}
        classList={{
          [styles.error]: props.isError,
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
    </div>
  );
};

SimpleFormField.SideContent = (inProps: JSX.HTMLAttributes<HTMLDivElement> & {
  class?: string;
  first?: boolean;
  last?: boolean;
}) => {
  const [props, restProps] = splitProps(inProps, ['class', 'first', 'last', 'classList', 'children']);
  return (
    <div
      class={classNames(styles.SideContent, props.class)}
      classList={{
        [styles.first]: props.first,
        [styles.last]: props.last,
        ...props.classList
      }}
      {...restProps}
    >
      {props.children}
    </div>
  );
};

export default SimpleFormField;
