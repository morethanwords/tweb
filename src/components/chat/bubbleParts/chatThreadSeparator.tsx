import {Accessor, batch, createEffect, createMemo, createRoot, createSignal, onCleanup, Ref} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import clamp from '@helpers/number/clamp';
import {attachHotClassName} from '@helpers/solid/classname';
import type CustomEmojiElement from '@lib/customEmoji/element';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {IconTsx} from '@components/iconTsx';
import type ChatBubbles from '@components/chat/bubbles';
import Chat from '@components/chat/chat';
import styles from '@components/chat/bubbleParts/chatThreadSeparator.module.scss';

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
  chat: Chat;
  peerId: PeerId;
  threadId?: number;
  lastMsgId?: number;
  index: number;
};

const ChatThreadSeparator = defineSolidElement({
  name: 'chat-thread-separator',
  component: (props: PassedProps<Props>) => {
    const {appImManager, PeerTitleTsx} = useHotReloadGuard();
    attachHotClassName(props.element, styles.Container);

    let clickTriggerEl: HTMLElement;
    let scaledEl: HTMLElement;

    const [serviceMsg, setServiceMsg] = createSignal<HTMLElement>();

    const state = useIntersector({
      bubbles: props.bubbles,
      element: serviceMsg,
      index: () => props.index
    });

    const onClick = () => {
      const isMonoforum = props.chat.isMonoforum;
      appImManager.setPeer({
        peerId: isMonoforum ? props.chat.peerId : props.peerId,
        monoforumThreadId: isMonoforum ? props.peerId : undefined,
        threadId: props.threadId,
        lastMsgId: props.lastMsgId
      });
    };

    const scale = createMemo(() => clamp((state().nextIntersectionRatio ?? 1), 0, 1));

    const isScaling = createMemo(() => scale() < 1);

    createEffect(() => {
      if(!isScaling() || !scaledEl) return;

      const emojiElements = Array.from(scaledEl.querySelectorAll<CustomEmojiElement>('custom-emoji-element'))
      .filter(emojiElement => !emojiElement?.paused);

      emojiElements.forEach((emojiElement) => {
        emojiElement.pause();
      });

      onCleanup(() => {
        emojiElements.forEach((emojiElement) => {
          emojiElement.play();
        });
      });
    });

    const InnerPeerTitle = (thisProps: {ref?: Ref<HTMLElement>}) => {
      return (
        <PeerTitleTsx
          ref={thisProps.ref}
          class={styles.PeerTitle}
          peerId={props.peerId}
          threadId={props.threadId}
          withIcons={!!props.threadId}
          limitSymbols={LIMIT_SYMBOLS}
          onlyFirstName={true}
        />
      );
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
          <InnerPeerTitle ref={clickTriggerEl} />
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
              '--scale': scale()
            }}
            onClick={onClick}
          >
            <InnerPeerTitle ref={scaledEl} />
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

export default ChatThreadSeparator;
