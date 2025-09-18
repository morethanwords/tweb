import {Accessor, createContext, createSignal, JSX, mergeProps, onMount, ParentProps, Setter, splitProps, useContext, createEffect, batch} from 'solid-js';
import styles from './styles.module.scss';


type SimpleFormFieldContextValue = {
  input: Accessor<HTMLInputElement>;
  setInput: Setter<HTMLInputElement>;
  offsetElement: Accessor<HTMLElement>;
  setOffsetElement: Setter<HTMLElement>;
  value: Accessor<string>;
  onChange: (value: string) => void;
};

const Context = createContext<SimpleFormFieldContextValue>();

const SimpleFormField = (inProps: ParentProps<{
  value?: string;
  onChange?: (value: string) => void;

  onClick?: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  isError?: boolean;
  clickable?: boolean;
  withEndButtonIcon?: boolean;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onChange' | 'onClick'>>) => {
  const [props, restProps] = splitProps(inProps, ['value', 'onChange', 'isError', 'children', 'onClick', 'class', 'classList', 'clickable', 'withEndButtonIcon']);
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [offsetElement, setOffsetElement] = createSignal<HTMLElement>();

  const contextValue: SimpleFormFieldContextValue = {
    input,
    setInput,
    offsetElement,
    setOffsetElement,
    value: () => props.value,
    get onChange() {
      return props.onChange;
    }
  };

  return (
    <Context.Provider value={contextValue}>
      <div
        class={styles.Container}
        classList={{
          [styles.error]: props.isError,
          [styles.clickable]: props.clickable,
          [props.class]: !!props.class,
          [styles.withEndButtonIcon]: props.withEndButtonIcon,
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
  forceFieldValue?: boolean;
} & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onInput' | 'ref'>) => {
  const [props, restProps] = splitProps(inProps, ['class', 'classList', 'forceFieldValue']);

  const context = useContext(Context);

  return (
    <input
      ref={(el) => batch(() => {
        context.setInput(el);
        context.setOffsetElement(el);
      })}
      class={styles.Input}
      classList={{
        [props.class]: !!props.class,
        ...props.classList
      }}
      value={context.value()}
      onInput={(e) => {
        context.onChange(e.currentTarget.value)
        if(props.forceFieldValue) context.input().value = context.value();
      }}
      {...restProps}
    />
  );
};

SimpleFormField.InputStub = (props: ParentProps) => {
  const context = useContext(Context);

  return (
    <div
      ref={context.setOffsetElement}
      class={styles.InputStub}
    >
      {props.children}
    </div>
  );
};

SimpleFormField.Label = (props: ParentProps<{
  active?: boolean;
  forceOffset?: number;
}>) => {
  const context = useContext(Context);

  const [offset, setOffset] = createSignal(0);

  onMount(() => {
    if(props.forceOffset || !context.offsetElement()) return;
    const parentElement = context.offsetElement().parentElement;
    if(!parentElement) return;

    const rect = parentElement.getBoundingClientRect();
    const inputRect = context.offsetElement().getBoundingClientRect();
    setOffset(inputRect.left - rect.left);
  });

  return (
    <div
      class={styles.Label}
      classList={{
        [styles.active]: props.active || !!context.value()
      }}
      style={{
        '--offset': `${props.forceOffset || offset()}px`
      }}
    >
      {props.children}
    </div>
  );
};

SimpleFormField.SideContent = (props: ParentProps<{
  first?: boolean;
  last?: boolean;
}>) => {
  return (
    <div class={styles.SideContent} classList={{
      [styles.first]: props.first,
      [styles.last]: props.last
    }}>
      {props.children}
    </div>
  );
};

export default SimpleFormField;
