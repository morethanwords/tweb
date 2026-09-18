import ButtonIcon from '@components/buttonIcon';
import {horizontalMenu} from '@components/horizontalMenu';
import ripple from '@components/ripple';
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
  /** a row the panel fills in later (the emoticons categories) starts out empty */
  children?: JSX.Element
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
  ripple?: boolean,
  children: JSX.Element
}) => {
  return (
    <div
      ref={(el) => {
        // prepends, so it lands before the stripe and the label, as the hand-rolled rows had it
        if(props.ripple) ripple(el);
        (props.ref as (el: HTMLDivElement) => void)?.(el);
      }}
      class={classNames('menu-horizontal-div-item', props.class)}
    >
      <i class="menu-horizontal-div-item-background" />
      <div class="menu-horizontal-div-item-span">
        {props.children}
      </div>
    </div>
  );
};

/**
 * The rounded plate the row sits on. A row that cannot overflow (a fixed set of tabs, or a
 * decorative one) takes the plate alone; anything longer than the popup takes
 * `Tabs.MenuScrollable`, which is this plus the horizontal scroller.
 */
Tabs.MenuShell = (props: {
  ref?: Ref<HTMLDivElement>,
  class?: string,
  classList?: JSX.HTMLAttributes<HTMLDivElement>['classList'],
  /** the plate sits among sections, so it leaves the gap under itself that one would */
  betweenSections?: boolean,
  children: JSX.Element
}) => {
  return (
    <div
      ref={props.ref}
      class={classNames(
        'menu-horizontal-scrollable',
        props.betweenSections && 'is-between-sections',
        props.class
      )}
      classList={props.classList}
    >
      {props.children}
    </div>
  );
};

/**
 * The emoticons panel's flavour of a tab: an icon button borrowing the row's item styles.
 * Those rows are `no-stripe` — nothing slides behind the active tab, and the icon is the whole
 * tab, so there is neither a background element nor a label wrapper.
 */
Tabs.MenuIconTab = (props: {
  icon?: Icon,
  class?: string,
  /** `data-tab`, for a row whose tabs are not addressed by their position */
  tab?: number,
  /** asking for it adds the square a set's preview is rendered into */
  paddingRef?: (el: HTMLElement) => void
}) => {
  // ButtonIcon reads the first word of its argument as the icon, so the classes go on after
  const button = ButtonIcon(props.icon, {noRipple: true});
  // filtered, because classList.add throws on the empty token a stray double space leaves
  button.classList.add('menu-horizontal-div-item', ...(props.class?.split(' ').filter(Boolean) || []));

  if(props.tab !== undefined) {
    button.dataset.tab = '' + props.tab;
  }

  if(props.paddingRef) {
    const padding = document.createElement('div');
    padding.classList.add('menu-horizontal-div-item-padding');
    button.append(padding);
    props.paddingRef(padding);
  }

  return button;
};

/**
 * A scroller nested inside a row, holding tabs of its own: the emoji panel's recent strip,
 * which is a narrow pill until its tab goes active and then widens in place. Takes the
 * caller's scroller, since that one keeps appending tabs to it and destroys it.
 */
Tabs.MenuInner = (props: {scroll: HTMLElement}) => {
  props.scroll.classList.add('menu-horizontal-inner-scroll');

  return (
    <div class="menu-horizontal-inner">
      {props.scroll}
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
    <Tabs.MenuShell ref={props.ref} class={props.class}>
      <Scrollable axis="x" {...(props.scrollableProps || {})}>
        {props.children}
      </Scrollable>
    </Tabs.MenuShell>
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
  class: string,
  /**
   * Wraps the content alone — a `Section`, usually. The row then stands outside it on a plate
   * of its own, the way the forward popup sets out its folder tabs. Without it the row and the
   * content are siblings, for the caller to wrap together or not at all.
   */
  contentWrapper?: (content: JSX.Element) => JSX.Element
}) => {
  const className = untrack(() => props.class);
  const wrapContent = untrack(() => props.contentWrapper);

  let tabs: HTMLDivElement, content: HTMLDivElement;

  const menuElement = (
    <Tabs.Menu ref={tabs} class={`${className}-tabs`}>
      <For each={props.menu}>{(item) => {
        return (
          <Tabs.MenuTab class={`${className}-tab`}>{item}</Tabs.MenuTab>
        );
      }}</For>
    </Tabs.Menu>
  );

  const contentElement = (
    <Tabs.Content ref={content} class={classNames(`${className}-contents`)}>
      <For each={props.content}>{(item, index) => {
        return (
          <Tabs.ContentTab class={`${className}-content`} hide={index() !== props.tab()}>{item}</Tabs.ContentTab>
        );
      }}</For>
    </Tabs.Content>
  );

  const children = wrapContent ? [
    <Tabs.MenuShell betweenSections class={`${className}-tabs-shell`}>{menuElement}</Tabs.MenuShell>,
    wrapContent(contentElement)
  ] : [menuElement, contentElement];

  const ret = (
    <Tabs>
      {children}
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
