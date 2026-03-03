import {children, createContext, createEffect, createMemo, createSignal, For, JSX, Ref, Show, useContext} from 'solid-js';
import {render} from 'solid-js/web';
import wrapKeyboardButton from '@components/wrappers/keyboardButton';
import type Chat from '@components/chat/chat';
import {KeyboardButtonRow, Message} from '@layer';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';

type ContextValue = {
  elements: () => JSX.Element[]
};
const Context = createContext<ContextValue>();

const ReplyMarkupLayout = (props: {
  children?: JSX.Element
}) => {
  const [elements, setElements] = createSignal<JSX.Element[]>([]);
  const value: ContextValue = {
    elements
  };

  const resolvedChildren = children(() => (
    <Context.Provider value={value}>
      {props.children}
    </Context.Provider>
  ));

  createEffect<void>(() => void setElements(resolvedChildren.toArray()));

  return (
    <div class="reply-markup">
      {resolvedChildren()}
    </div>
  );
};

type RowContextValue = {
  isLast: boolean,
  elements: () => JSX.Element[]
};
const RowContext = createContext<RowContextValue>();

ReplyMarkupLayout.Row = (props: {
  children: JSX.Element
}) => {
  const context = useContext(Context);
  const [elements, setElements] = createSignal<JSX.Element[]>([]);
  let ref: HTMLDivElement;
  const value: RowContextValue = {
    get isLast() {
      return context.elements()[context.elements().length - 1] === ref;
    },
    elements
  };

  const resolvedChildren = children(() => (
    <RowContext.Provider value={value}>
      {props.children}
    </RowContext.Provider>
  ));

  createEffect<void>(() => void setElements(resolvedChildren.toArray()));

  return (
    <div ref={ref} class="reply-markup-row">
      {resolvedChildren()}
    </div>
  );
};

ReplyMarkupLayout.Button = (props: {
  onClick: (e: MouseEvent) => void,
  children: JSX.Element,
  class?: string,
  textClass?: string,
  icon?: Icon,
  ref?: Ref<HTMLElement>,
  as?: 'button' | 'a'
}) => {
  const rowContext = useContext(RowContext);
  let ref: HTMLElement;
  const isFirst = createMemo(() => rowContext.elements()[0] === ref);
  const isLast = createMemo(() => rowContext.elements()[rowContext.elements().length - 1] === ref);
  return (
    <RippleElement
      component={props.as || 'button'}
      ref={(_ref: any) => {
        ref = _ref;
        (props.ref as any)?.(ref);
      }}
      class={classNames(
        'reply-markup-button',
        rowContext.isLast && isFirst() && 'is-first',
        rowContext.isLast && isLast() && 'is-last',
        props.class
      )}
      onClick={props.onClick}
    >
      <Show when={props.icon}>
        <IconTsx icon={props.icon} class="reply-markup-button-icon" />
      </Show>
      <span class={classNames('reply-markup-button-text', props.textClass)}>
        {props.children}
      </span>
    </RippleElement>
  );
};

ReplyMarkupLayout.Inline = (props: {
  rows: KeyboardButtonRow[],
  chat?: Chat,
  message?: Message.message,
  wrapOptions?: WrapSomethingOptions
}) => {
  const rows = props.rows.filter((row) => row.buttons.length);

  return (
    <ReplyMarkupLayout>
      <For each={rows}>
        {(row) => (
          <ReplyMarkupLayout.Row>
            <For each={row.buttons}>
              {(button) => {
                return wrapKeyboardButton({
                  button,
                  chat: props.chat,
                  message: props.message,
                  wrapOptions: props.wrapOptions
                });
              }}
            </For>
          </ReplyMarkupLayout.Row>
        )}
      </For>
    </ReplyMarkupLayout>
  );
};

export default ReplyMarkupLayout;

export function createInlineReplyMarkup(options: {
  rows: KeyboardButtonRow[],
  chat?: Chat,
  message?: Message.message,
  wrapOptions?: WrapSomethingOptions
}): HTMLDivElement {
  const container = document.createElement('div');
  const dispose = render(() => (
    <ReplyMarkupLayout.Inline
      rows={options.rows}
      chat={options.chat}
      message={options.message}
      wrapOptions={options.wrapOptions}
    />
  ), container);
  options.wrapOptions.middleware.onDestroy(dispose);
  return container.firstElementChild as HTMLDivElement || container as unknown as HTMLDivElement;
}
