import {Accessor, batch, createMemo, createRoot, createSignal, onCleanup} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import {simulateClickEvent} from '../../../helpers/dom/clickEvent';
import {attachHotClassName} from '../../../helpers/solid/classname';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {IconTsx} from '../../iconTsx';
import {PeerTitleTsx} from '../../peerTitleTsx';
import type ChatBubbles from '../bubbles';
import styles from './monoforumSeparator.module.scss';

if(import.meta.hot) import.meta.hot.accept();


const PADDING = 2;
const SEPARATOR_HEIGHT = 30; // it's actually 29, but let's have it rounded up)

const LIMIT_SYMBOLS = 15;


export type SeparatorIntersectorRoot = ReturnType<typeof createIntersectorRoot>;

type ElementState = {
  floating?: boolean;
  hidden?: boolean;
  nextIntersectionRatio?: number;
};

type ElementMapValue = {
  index: number;
  signal: [ElementState, SetStoreFunction<ElementState>];
};

const getThreshold = () => new Array(SEPARATOR_HEIGHT + 1).fill(0).map((_, idx) => idx / SEPARATOR_HEIGHT);

const createIntersectorRoot = (rootElement: HTMLElement) => createRoot((dispose) => {
  const map = new Map<HTMLElement, ElementMapValue>();

  const observer = new IntersectionObserver((entries) => {
    batch(() => entries.forEach(entry => {
      const element = entry.target as HTMLElement;
      if(!map.has(element)) return;

      const targetMapValue = map.get(element);
      const [, setState] = targetMapValue.signal;

      const floating = entry.boundingClientRect.bottom < entry.rootBounds.top;

      setState({floating});

      const sortedMapValues = Array.from(map.values()).sort((a, b) => a.index - b.index);
      const n = sortedMapValues.length;
      for(let i = 0; i < n - 1; i++) {
        const [, setCurrent] = sortedMapValues[i].signal;
        const [next] = sortedMapValues[i + 1].signal;

        setCurrent({hidden: next.floating});

        if(sortedMapValues[i + 1] === targetMapValue) {
          setCurrent({
            nextIntersectionRatio: entry.boundingClientRect.bottom < entry.rootBounds.bottom ? entry.intersectionRatio : 1
          });
        }
      }
    })
    );
  }, {
    root: rootElement,
    rootMargin: `-${2 * PADDING + 2 * SEPARATOR_HEIGHT}px 0px 0px 0px`,
    threshold: getThreshold()
  });

  let cleaned = false;

  onCleanup(() => {
    cleaned = true;
    observer.disconnect();
  });

  return {
    observe(element: HTMLElement, index: number) {
      setTimeout(() => {
        if(!cleaned) observer.observe(element);
      }, 0);

      const [state, setState] = createStore<ElementState>({floating: false, hidden: false});
      map.set(element, {
        index,
        signal: [state, setState]
      });

      return state;
    },
    unobserve(element: HTMLElement) {
      observer.unobserve(element);
      map.delete(element);
    },
    count: 0,
    dispose
  };
});


type UseIntersectorArgs = {
  bubbles: ChatBubbles;
  element: Accessor<HTMLElement>;
  index: Accessor<number>;
}

function useIntersector({bubbles, element, index}: UseIntersectorArgs) {
  const root = bubbles.separatorIntersectorRoot ??= createIntersectorRoot(bubbles.scrollable.container);
  root.count++;

  onCleanup(() => {
    root.count--;
    if(root.count <= 0) {
      root.dispose();
      bubbles.separatorIntersectorRoot = undefined;
    }
  });

  return createMemo((): ElementState => {
    const el = element();
    if(!el) return {};

    const state = root.observe(el, index());
    onCleanup(() => root.unobserve(el));

    return state;
  });
}

type Props = {
  bubbles: ChatBubbles;
  peerId: PeerId;
  index: number;
};

const MonoforumSeparator = defineSolidElement({
  name: 'monoforum-separator',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container);

    let peerTitleEl: HTMLElement;

    const [serviceMsg, setServiceMsg] = createSignal<HTMLElement>();

    const state = useIntersector({
      bubbles: props.bubbles,
      element: serviceMsg,
      index: () => props.index
    });

    const onClick = () => {
      if(peerTitleEl) simulateClickEvent(peerTitleEl);
    };

    return (
      <>
        <div
          ref={setServiceMsg}
          class={styles.ServiceMsg}
          classList={{
            [styles.hidden]: state().floating
          }}
          onClick={onClick}
        >
          <PeerTitleTsx ref={peerTitleEl} peerId={props.peerId} limitSymbols={LIMIT_SYMBOLS} onlyFirstName />
          <IconTsx icon='arrowhead' class={styles.ArrowIcon} />
        </div>

        <Portal mount={props.bubbles.floatingSeparatorsContainer}>
          <div
            class={styles.ServiceMsg}
            classList={{
              [styles.hidden]: !state().floating || state().hidden,
              [styles.floating]: true
            }}
            style={{
              '--top': `${SEPARATOR_HEIGHT + 2 * PADDING}px`,
              '--scale': (state().nextIntersectionRatio ?? 1)
            }}
            onClick={onClick}
          >
            <PeerTitleTsx peerId={props.peerId} limitSymbols={LIMIT_SYMBOLS} onlyFirstName />
            <IconTsx icon='arrowhead' class={styles.ArrowIcon} />
          </div>
        </Portal>

        <div class={`${styles.Separator} ${styles.SeparatorLeft}`} classList={{
          [styles.center]: state().floating
        }} />
        <div class={`${styles.Separator} ${styles.SeparatorRight}`} classList={{
          [styles.center]: state().floating
        }} />
      </>
    );
  }
});

export default MonoforumSeparator;
