import {horizontalMenu} from '@components/horizontalMenu';
import Scrollable from '@components/scrollable2';
import ListenerSetter from '@helpers/listenerSetter';
import classNames from '@helpers/string/classNames';
import {Accessor, JSX, For, onCleanup, createContext, Ref, untrack} from 'solid-js';

const TabsContext = createContext<{
}>();

const Tabs = (props: {
  // tab: Accessor<number>,
  // onChange: (index: number) => void,
  children: JSX.Element
}) => {
  return (
    <TabsContext.Provider value={{}}>
      {props.children}
    </TabsContext.Provider>
  );
};

Tabs.Menu = (props: {
  class?: string,
  id?: string,
  ref?: Ref<HTMLDivElement>,
  onClick?: (e: MouseEvent) => void,
  children: JSX.Element
}) => {
  return (
    <div
      ref={props.ref}
      class={classNames('menu-horizontal-div', props.class)}
      id={props.id}
      onClick={props.onClick}
    >
      {props.children}
    </div>
  );
};

Tabs.MenuTab = (props: {
  ref?: Ref<HTMLDivElement>,
  class?: string,
  children: JSX.Element
}) => {
  return (
    <div ref={props.ref} class={classNames('menu-horizontal-div-item', props.class)}>
      <i class="menu-horizontal-div-item-background" />
      <div class="menu-horizontal-div-item-span">
        {props.children}
      </div>
    </div>
  );
};

Tabs.MenuScrollable = (props: {
  ref?: Ref<HTMLDivElement>,
  scrollableProps?: Partial<Parameters<typeof Scrollable>[0]>,
  class?: string,
  children: JSX.Element
}) => {
  return (
    <div ref={props.ref} class={classNames('menu-horizontal-scrollable', props.class)}>
      <Scrollable axis="x" {...(props.scrollableProps || {})}>
        {props.children}
      </Scrollable>
    </div>
  );
};

Tabs.MenuGradient = (props: {
  color: 'surface' | 'background',
  smaller?: boolean,
  className?: string,
  ref?: Ref<HTMLDivElement>
}) => {
  return (
    <div
      ref={props.ref}
      class={classNames(
        'menu-horizontal-gradient-container',
        props.className && props.className + '-container'
      )}
    >
      <div
        class={classNames(
          'menu-horizontal-gradient',
          'menu-horizontal-gradient-color-' + props.color,
          props.smaller && 'menu-horizontal-gradient-smaller',
          props.className
        )}
      ></div>
    </div>
  );
};

Tabs.Content = (props: {
  class: string,
  ref?: Ref<HTMLDivElement>,
  children: JSX.Element,
  onClick?: (e: MouseEvent) => void
}) => {
  return (
    <div ref={props.ref} class={props.class}>
      {props.children}
    </div>
  );
};

Tabs.ContentTab = (props: {
  class: string,
  hide: boolean,
  children: JSX.Element
}) => {
  return (
    <div class={classNames(props.class, props.hide && 'hide')}>
      {props.children}
    </div>
  );
};

Tabs.Simple = (props: {
  tab: Accessor<number>,
  onChange: (index: number) => void,
  menu: JSX.Element[],
  content: JSX.Element[],
  class: string
}) => {
  const className = untrack(() => props.class);

  let tabs: HTMLDivElement, content: HTMLDivElement;
  const ret = (
    <Tabs>
      <Tabs.Menu ref={tabs} class={`${className}-tabs`}>
        <For each={props.menu}>{(item) => {
          return (
            <Tabs.MenuTab class={`${className}-tab`}>{item}</Tabs.MenuTab>
          );
        }}</For>
      </Tabs.Menu>
      <Tabs.Content ref={content} class={classNames(`${className}-contents`)}>
        <For each={props.content}>{(item, index) => {
          return (
            <Tabs.ContentTab class={`${className}-content`} hide={index() !== props.tab()}>{item}</Tabs.ContentTab>
          );
        }}</For>
      </Tabs.Content>
    </Tabs>
  );

  const listenerSetter = new ListenerSetter();
  onCleanup(() => {
    listenerSetter.removeAll();
  });

  const selectTab = horizontalMenu(
    tabs,
    content,
    (tab) => {
      props.onChange(tab);
    },
    undefined,
    undefined,
    undefined,
    listenerSetter
  );
  selectTab(props.tab());

  return ret;
};

export default Tabs;
