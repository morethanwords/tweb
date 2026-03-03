import {IconTsx} from '@components/iconTsx';
import {Accessor, children, createEffect, For, JSX, Match, Switch} from 'solid-js';

const ServiceBubbleDescription = (props: {
  children: JSX.Element,
}) => {
  const resolvedChildren = children(() => props.children);

  createEffect(() => {
    const elements = resolvedChildren.toArray();
    elements.forEach((element) => {
      (element as HTMLElement).classList.add('empty-bubble-placeholder-line');
    });
  });

  return (<>{resolvedChildren()}</>);
};

ServiceBubbleDescription.Title = (props: {children: JSX.Element}) => (
  <span class="empty-bubble-placeholder-title center">
    {props.children}
  </span>
);

ServiceBubbleDescription.Subtitle = (props: {children: JSX.Element}) => (
  <span class="empty-bubble-placeholder-subtitle center">
    {props.children}
  </span>
);

type ListProps<T extends readonly any[]> = {
  each: T,
  children?: (item: T[number], index: Accessor<number>) => JSX.Element,
  type?: 'check' | 'bullet'
};
ServiceBubbleDescription.List = <T extends readonly any[]>(props: ListProps<T>) => (
  <For each={props.each}>
    {(item, index) => (
      <span class="empty-bubble-placeholder-list-item">
        <Switch>
          <Match when={props.type === 'check'}>
            <IconTsx icon="check" class="empty-bubble-placeholder-list-check" />
          </Match>
          <Match when={props.type === 'bullet'}>
            <span class="empty-bubble-placeholder-list-bullet">{'•'}</span>
          </Match>
        </Switch>
        {props.children ? props.children(item, index) : props.each[index()]}
      </span>
    )}
  </For>
);

ServiceBubbleDescription.Sticker = (props: {children: JSX.Element}) => (
  <div class="empty-bubble-placeholder-sticker">{props.children}</div>
);

export default ServiceBubbleDescription;
