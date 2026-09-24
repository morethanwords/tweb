import {Accessor, createContext, createEffect, createSignal, JSX, onCleanup, onMount} from 'solid-js';

import {doubleRaf} from '@helpers/schedulers';
import Scrollable from '@components/scrollable';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import {delay} from '@components/mediaEditor/utils';

import {
  getMediaEditorTabId,
  getMediaEditorTabPanelId,
  mediaEditorTabsOrder
} from '@components/mediaEditor/tabs/tabs';

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
  const {editorState} = useMediaEditorContext();

  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [scrollAmount, setScrollAmount] = createSignal(0);
  let prevElement: HTMLDivElement;
  let prevTab = editorState.currentTab;
  let scrollable: Scrollable;

  function createTabElement(tab: string) {
    return (
      <div
        id={getMediaEditorTabPanelId(tab)}
        role="tabpanel"
        aria-labelledby={getMediaEditorTabId(tab)}
      >
        <div class="media-editor__tab-content-scrollable-content">
          <TabContentContext.Provider value={{container, scrollAmount}}>
            {props.tabs[tab]()}
          </TabContentContext.Provider>
        </div>
      </div>
    ) as HTMLDivElement;
  }

  const initialElement = createTabElement(editorState.currentTab);
  prevElement = initialElement;

  createEffect(async() => {
    if(prevTab === editorState.currentTab) return;

    const toRight = mediaEditorTabsOrder.indexOf(editorState.currentTab) > mediaEditorTabsOrder.indexOf(prevTab);
    prevTab = editorState.currentTab;

    scrollable.destroy();
    const newElement = createTabElement(editorState.currentTab);
    setScrollable(newElement);
    const oldElement = prevElement;
    prevElement = newElement;

    const cls = (element: HTMLElement, action: 'add' | 'remove', modifier: string) =>
      element.classList[action]('media-editor__tab-content--' + modifier);

    cls(oldElement, 'add', 'exit');
    oldElement.inert = true;
    oldElement.setAttribute('aria-hidden', 'true');
    oldElement.removeAttribute('id');

    if(toRight) {
      cls(newElement, 'add', 'go-right');
      container().append(newElement);
      await doubleRaf();
      cls(oldElement, 'add', 'go-left');
      cls(newElement, 'remove', 'go-right');
    } else {
      cls(newElement, 'add', 'go-left');
      container().append(newElement);
      await doubleRaf();
      cls(oldElement, 'add', 'go-right');
      cls(newElement, 'remove', 'go-left');
    }

    await delay(200);
    oldElement.remove();
  });

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
      inert={!editorState.isReady}
      aria-hidden={!editorState.isReady}
    >
      {initialElement}
    </div>
  );
}
