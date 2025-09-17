import {Accessor, createContext, createSignal, JSX, mergeProps, onMount, ParentProps, Setter, splitProps, useContext} from 'solid-js';
import styles from './styles.module.scss';


type SimpleFormFieldContextValue = {
  input: Accessor<HTMLInputElement>;
  setInput: Setter<HTMLInputElement>;
  value?: Accessor<string>;
  onChange?: (value: string) => void;
};

const Context = createContext<SimpleFormFieldContextValue>();

const SimpleFormField = (props: ParentProps<{
  value?: string;
  onChange?: (value: string) => void;
}>) => {
  const [input, setInput] = createSignal<HTMLInputElement>();

  const contextValue = {
    input,
    setInput,
    value: () => props.value,
    get onChange() {
      return props.onChange;
    }
  };

  return (
    <Context.Provider value={contextValue}>
      <div
        class={styles.Container}
        onClick={() => {
          contextValue.input()?.focus();
        }}
      >
        <div class={styles.BorderThin} />
        <div class={styles.BorderThick} />
        {props.children}
      </div>
    </Context.Provider>
  );
};

SimpleFormField.LabelAndInput = (inProps: {
  inputProps?: Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'ref'>;
  placeholderLabel: JSX.Element;
  forceOffset?: number;
}) => {
  const props = mergeProps({inputProps: {}}, inProps);
  const [inputProps, restInputProps] = splitProps(props.inputProps, ['class', 'classList']);

  const context = useContext(Context);

  const [offset, setOffset] = createSignal(0);

  onMount(() => {
    if(props.forceOffset || !context.input()) return;
    const parentElement = context.input().parentElement;
    if(!parentElement) return;

    const rect = parentElement.getBoundingClientRect();
    const inputRect = context.input().getBoundingClientRect();
    setOffset(inputRect.left - rect.left);
  });

  return (
    <>
      <input
        ref={context.setInput}
        class={styles.Input}
        classList={{
          [inputProps.class]: !!inputProps.class,
          ...inputProps.classList
        }}
        value={context.value()}
        onChange={(e) => context.onChange(e.currentTarget.value)}
        {...restInputProps}
      />
      <div
        class={styles.Label}
        classList={{
          [styles.active]: !!context.value()
        }}
        style={{
          '--offset': `${props.forceOffset || offset()}px`
        }}
      >
        {props.placeholderLabel}
      </div>
    </>
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
