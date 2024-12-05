import {Accessor, createContext, createEffect, createSignal, JSX, onCleanup, onMount, useContext} from 'solid-js';

import {doubleRaf} from '../../../helpers/schedulers';
import Scrollable from '../../scrollable';

import {delay} from '../utils';
import MediaEditorContext from '../context';

import {mediaEditorTabsOrder} from './tabs';

type TabContentContextValue = {
  container: Accessor<HTMLDivElement>;
  scrollAmount: Accessor<number>;
};
export const TabContentContext = createContext<TabContentContextValue>();

export default function TabContent(props: {
  tabs: Record<string, () => JSX.Element>;
  onContainer: (el: HTMLDivElement) => void;
  onScroll: () => void;
}) {
  const context = useContext(MediaEditorContext);
  const [tab] = context.currentTab;

  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [scrollAmount, setScrollAmount] = createSignal(0);
  let prevElement: HTMLDivElement;
  let prevTab = tab();
  let scrollable: Scrollable;

  createEffect(async() => {
    if(prevTab === tab()) return;

    const toRight = mediaEditorTabsOrder.indexOf(tab()) > mediaEditorTabsOrder.indexOf(prevTab);
    prevTab = tab();

    scrollable.destroy();
    const newElement = (
      <div>
        <div class="media-editor__tab-content-scrollable-content">
          <TabContentContext.Provider value={{container, scrollAmount}}>
            {props.tabs[tab()]()}
          </TabContentContext.Provider>
        </div>
      </div>
    ) as HTMLDivElement;
    setScrollable(newElement);

    const cls = (element: HTMLElement, action: 'add' | 'remove', modifier: string) =>
      element.classList[action]('media-editor__tab-content--' + modifier);

    cls(prevElement, 'add', 'exit');

    if(toRight) {
      cls(newElement, 'add', 'go-right');
      container().append(newElement);
      await doubleRaf();
      cls(prevElement, 'add', 'go-left');
      cls(newElement, 'remove', 'go-right');
    } else {
      cls(newElement, 'add', 'go-left');
      container().append(newElement);
      await doubleRaf();
      cls(prevElement, 'add', 'go-right');
      cls(newElement, 'remove', 'go-left');
    }

    await delay(200);
    prevElement.remove();

    prevElement = newElement;
  });

  const initialTab = props.tabs[tab()]();

  function setScrollable(element: HTMLElement) {
    // TODO: Scrollable thumb not showing
    scrollable = new Scrollable(element);
    scrollable.setListeners();
    scrollable.container.addEventListener('scroll', () => {
      props.onScroll();
      setScrollAmount(scrollable.container.scrollTop);
    });
  }

  onMount(() => {
    setScrollable(prevElement);
  });

  onCleanup(() => {
    scrollable.destroy();
  });

  return (
    <div
      ref={(el) => {
        setContainer(el);
        props.onContainer(el);
      }}
      class="media-editor__tab-content"
    >
      <div ref={prevElement}>
        <div class="media-editor__tab-content-scrollable-content">
          <TabContentContext.Provider value={{container, scrollAmount}}>{initialTab}</TabContentContext.Provider>
        </div>
      </div>
    </div>
  );
}
