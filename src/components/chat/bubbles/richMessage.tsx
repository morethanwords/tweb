import {Show, createEffect, createSignal, on, onCleanup} from 'solid-js';
import {Message, Page, RichMessage} from '@layer';
import {openInstantViewInAppBrowser} from '@components/browser';
import {
  InstantViewBlocks,
  InstantViewRichTextOptions,
  ReactiveInstantViewValue,
  hasInstantViewDisabledNavigation,
  readReactiveInstantViewValue
} from '@components/instantView';
import styles from '@components/instantView.module.scss';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {isRichMessagePart, richMessageToPage} from '@lib/richMessage';
import cancelEvent from '@helpers/dom/cancelEvent';
import {
  MessageTextLayoutEvent,
  MessageTextPhase,
  MessageTextRevealCoordinator,
  MessageTextStreamingTail
} from '@components/chat/bubbleParts/solidMessageText';

export function RichMessageBubble(props: {
  message: ReactiveInstantViewValue<Message.message>,
  richMessage: ReactiveInstantViewValue<RichMessage>,
  page: ReactiveInstantViewValue<Page.page>,
  sourceRevision?: ReactiveInstantViewValue<number>,
  phase?: ReactiveInstantViewValue<MessageTextPhase>,
  streaming?: ReactiveInstantViewValue<boolean>,
  richTextOptions?: ReactiveInstantViewValue<InstantViewRichTextOptions>,
  revealCoordinator?: MessageTextRevealCoordinator,
  onTextLayout?: (event: MessageTextLayoutEvent) => void,
  scrollToElement?: (element: HTMLElement) => void
}) {
  const {i18n, rootScope} = useHotReloadGuard();
  const [loading, setLoading] = createSignal(false);
  const [fullPage, setFullPage] = createSignal<{key: string, page: Page.page}>();
  let fullPageRequest: {key: string, promise: Promise<Page.page | undefined>};
  let requestGeneration = 0;
  let layoutGeneration = 0;
  let disposed = false;
  const message = () => readReactiveInstantViewValue(props.message);
  const richMessage = () => readReactiveInstantViewValue(props.richMessage);
  const page = () => readReactiveInstantViewValue(props.page);
  const sourceRevision = () => props.sourceRevision === undefined ? 0 : readReactiveInstantViewValue(props.sourceRevision);
  const fullPageKey = () => `${message().mid}:${sourceRevision()}`;
  const phase = (): MessageTextPhase => props.phase === undefined ?
    (props.streaming !== undefined && readReactiveInstantViewValue(props.streaming) ? 'streaming' : 'final') :
    readReactiveInstantViewValue(props.phase);
  const streaming = () => phase() !== 'final';
  const navigationDisabled = () => !!(
    props.richTextOptions &&
    hasInstantViewDisabledNavigation(readReactiveInstantViewValue(props.richTextOptions))
  );
  let element: HTMLDivElement;

  createEffect(() => {
    props.revealCoordinator?.showTail();
    const revision = sourceRevision();
    const currentPhase = phase();
    const generation = ++layoutGeneration;
    queueMicrotask(() => {
      if(disposed || generation !== layoutGeneration || !element) return;
      props.onTextLayout?.({
        element,
        sourceRevision: revision,
        phase: currentPhase,
        reason: 'decoration',
        renderMode: 'none'
      });
    });
  });

  createEffect(on([fullPageKey, navigationDisabled], () => {
    ++requestGeneration;
    fullPageRequest = undefined;
    setFullPage(undefined);
    setLoading(false);
  }, {defer: true}));

  onCleanup(() => {
    disposed = true;
    ++requestGeneration;
    ++layoutGeneration;
    fullPageRequest = undefined;
  });

  const openPage = (page: Page.page) => {
    openInstantViewInAppBrowser({
      webPageId: message().mid,
      cachedPage: page,
      HotReloadGuardProvider: SolidJSHotReloadGuardProvider
    });
  };

  const openFull = async(e: MouseEvent) => {
    cancelEvent(e);

    if(streaming() || navigationDisabled()) {
      return;
    }

    if(!isRichMessagePart(richMessage())) {
      openPage(page());
      return;
    }

    const mid = message().mid;
    const key = fullPageKey();
    const generation = requestGeneration;
    const cached = fullPage();
    if(cached?.key === key) {
      openPage(cached.page);
      return;
    }

    setLoading(true);
    let request = fullPageRequest;
    try {
      if(request?.key !== key) {
        request = fullPageRequest = {
          key,
          promise: rootScope.managers.appMessagesManager.getRichMessage(message().peerId, mid)
          .then((richMessage) => richMessage && richMessageToPage(richMessage))
        };
      }
      const loadedPage = await request.promise;
      if(
        loadedPage &&
        !disposed &&
        generation === requestGeneration &&
        fullPageKey() === key &&
        !streaming() &&
        !navigationDisabled()
      ) {
        setFullPage({key, page: loadedPage});
        openPage(loadedPage);
      }
    } catch(err) {
      // Drop the rejected promise so the next click retries the fetch (the manager also clears its
      // own cache on error) instead of the button staying permanently stuck; swallowing it here also
      // avoids an unhandled promise rejection.
      if(!disposed && generation === requestGeneration && fullPageRequest === request) {
        fullPageRequest = undefined;
      }
    } finally {
      if(!disposed && generation === requestGeneration && fullPageKey() === key) {
        setLoading(false);
      }
    }
  };

  return (
    <div ref={element} class={styles.RichMessageWrapper}>
      <InstantViewBlocks
        webPageId={() => message().mid}
        page={page}
        sourceRevision={props.sourceRevision}
        phase={phase}
        richTextOptions={props.richTextOptions}
        revealCoordinator={props.revealCoordinator}
        onTextLayout={props.onTextLayout}
        afterBlocks={
          <Show when={props.revealCoordinator?.showTail()}>
            <MessageTextStreamingTail />
          </Show>
        }
        openNewPage={(url) => {
          openInstantViewInAppBrowser({
            cachedPage: url,
            HotReloadGuardProvider: SolidJSHotReloadGuardProvider
          });
        }}
        collapse={() => {}}
        scrollToElement={props.scrollToElement}
        class={styles.RichMessage}
        paddings={0}
      />
      <Show when={!streaming() && isRichMessagePart(richMessage())}>
        <button
          type="button"
          class={styles.RichMessageMore}
          disabled={loading() || navigationDisabled()}
          aria-disabled={navigationDisabled()}
          onClick={openFull}
        >
          {loading() ? i18n('Loading') : i18n('Chat.Message.Ad.ReadMore')}
        </button>
      </Show>
    </div>
  );
}
