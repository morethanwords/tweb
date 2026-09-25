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
import {instantViewStyles as styles} from '@components/instantViewFormatting';
import applyRichMessageChecklist from '@appManagers/utils/richMessage/toggleChecklist';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {isRichMessagePart, richMessageToPage} from '@lib/richMessage';
import cancelEvent from '@helpers/dom/cancelEvent';
import type Chat from '@components/chat/chat';
import {
  MessageTextLayoutEvent,
  MessageTextPhase,
  MessageTextRevealCoordinator,
  MessageTextStreamingTail
} from '@components/chat/bubbleParts/solidMessageText';

/** Hydrate a little before the bubble is on screen, so the swap is not visible. */
const HYDRATION_ROOT_MARGIN = '200px';

export function RichMessageBubble(props: {
  message: ReactiveInstantViewValue<Message.message>,
  // the chat the bubble is in: the page's buttons act through it
  chat?: Chat,
  richMessage: ReactiveInstantViewValue<RichMessage>,
  page: ReactiveInstantViewValue<Page.page>,
  sourceRevision?: ReactiveInstantViewValue<number>,
  checklistsDisabled?: ReactiveInstantViewValue<boolean>,
  phase?: ReactiveInstantViewValue<MessageTextPhase>,
  streaming?: ReactiveInstantViewValue<boolean>,
  richTextOptions?: ReactiveInstantViewValue<InstantViewRichTextOptions>,
  revealCoordinator?: MessageTextRevealCoordinator,
  onTextLayout?: (event: MessageTextLayoutEvent) => void,
  scrollToElement?: (element: HTMLElement) => void
}) {
  const {i18n, rootScope} = useHotReloadGuard();
  const [loading, setLoading] = createSignal(false);
  const [optimisticRichMessage, setOptimisticRichMessage] = createSignal<RichMessage>();
  const [canEditChecklists, setCanEditChecklists] = createSignal(false);
  let editabilityToken = 0;
  const [fullPage, setFullPage] = createSignal<{key: string, page: Page.page}>();
  let fullPageRequest: {key: string, promise: Promise<Page.page | undefined>};
  let requestGeneration = 0;
  let layoutGeneration = 0;
  let disposed = false;
  const message = () => readReactiveInstantViewValue(props.message);
  const richMessage = () => readReactiveInstantViewValue(props.richMessage);
  const page = () => readReactiveInstantViewValue(props.page);
  const sourceRevision = () => props.sourceRevision === undefined ? 0 : readReactiveInstantViewValue(props.sourceRevision);
  const fullPageKey = () => `${message().peerId}:${message().mid}:${sourceRevision()}`;
  const phase = (): MessageTextPhase => props.phase === undefined ?
    (props.streaming !== undefined && readReactiveInstantViewValue(props.streaming) ? 'streaming' : 'final') :
    readReactiveInstantViewValue(props.phase);
  const streaming = () => phase() !== 'final';
  const navigationDisabled = () => !!(
    props.richTextOptions &&
    hasInstantViewDisabledNavigation(readReactiveInstantViewValue(props.richTextOptions))
  );
  let element: HTMLDivElement;

  // Hydrating a part costs one `messages.getRichMessage`, so doing it on render
  // makes a channel of long posts pay a request for every post scrolled past.
  // Wait until the bubble is near the screen; `undefined` IntersectionObserver
  // (jsdom, ancient engines) falls back to hydrating right away.
  const [nearViewport, setNearViewport] = createSignal(false);

  createEffect(() => {
    if(nearViewport()) return;
    if(!element || typeof(IntersectionObserver) === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if(!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setNearViewport(true);
    }, {rootMargin: HYDRATION_ROOT_MARGIN});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

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


  onCleanup(() => {
    disposed = true;
    ++requestGeneration;
    ++layoutGeneration;
    ++editabilityToken;
    fullPageRequest = undefined;
  });

  const openPage = (page: Page.page) => {
    openInstantViewInAppBrowser({
      webPageId: message().mid,
      cachedPage: page,
      HotReloadGuardProvider: SolidJSHotReloadGuardProvider
    });
  };

  const loadFullPage = async() => {
    if(streaming() || navigationDisabled()) return;

    const mid = message().mid;
    const key = fullPageKey();
    const generation = requestGeneration;
    const cached = fullPage();
    if(cached?.key === key) {
      return cached.page;
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
        return loadedPage;
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

  const displayedPage = () => fullPage()?.page || (optimisticRichMessage() ?
    richMessageToPage(optimisticRichMessage()) : page());
  const checklistsDisabled = () => props.checklistsDisabled !== undefined && readReactiveInstantViewValue(props.checklistsDisabled);
  const checklistsInteractive = () => canEditChecklists() && !checklistsDisabled() &&
    !streaming() && !isRichMessagePart(richMessage()) && !fullPage();

  createEffect(() => {
    const currentMessage = message();
    const token = ++editabilityToken;
    setCanEditChecklists(false);
    if(streaming() || checklistsDisabled() || isRichMessagePart(richMessage())) return;
    void rootScope.managers.appMessagesManager.canEditMessage(currentMessage, 'text').then((canEdit) => {
      if(!disposed && token === editabilityToken) setCanEditChecklists(canEdit);
    }, () => {});
  });

  const onChecklistToggle = (path: number[], checked: boolean) => {
    if(!checklistsInteractive()) return;
    const source = richMessage();
    const previous = optimisticRichMessage() || source;
    const updated = applyRichMessageChecklist(previous, path, checked);
    if(!updated) return;
    setOptimisticRichMessage(updated);
    const generation = requestGeneration;
    const rollback = () => {
      if(!disposed && generation === requestGeneration && optimisticRichMessage() === updated) {
        setOptimisticRichMessage(previous === source ? undefined : previous);
      }
    };
    void rootScope.managers.appMessagesManager.toggleRichMessageChecklist({
      peerId: message().peerId,
      mid: message().mid,
      path,
      checked,
      scheduled: !!message().pFlags?.is_scheduled
    }).then((accepted) => {
      if(!accepted) rollback();
    }, rollback);
  };

  createEffect(on([fullPageKey, richMessage, streaming, navigationDisabled, nearViewport], ([key, source, isStreaming, blocked, visible], previous) => {
    if(previous && (key !== previous[0] || source !== previous[1] || blocked !== previous[3])) {
      ++requestGeneration;
      fullPageRequest = undefined;
      setFullPage(undefined);
      setOptimisticRichMessage(undefined);
      setLoading(false);
    }
    // Invalidate and hydrate in the same effect so a policy update cannot
    // start a request that another effect immediately invalidates.
    if(visible && isRichMessagePart(source) && !isStreaming && !blocked) void loadFullPage();
  }));

  const openFull = async(e: MouseEvent) => {
    cancelEvent(e);
    if(streaming() || navigationDisabled()) return;
    const generation = requestGeneration;
    const result = isRichMessagePart(richMessage()) ? await loadFullPage() : displayedPage();
    if(result && !disposed && generation === requestGeneration && !streaming() && !navigationDisabled()) openPage(result);
  };

  return (
    <div ref={element} class={styles.RichMessageWrapper}>
      <InstantViewBlocks
        webPageId={() => message().mid}
        page={displayedPage}
        chat={props.chat}
        message={message}
        onChecklistToggle={checklistsInteractive() ? onChecklistToggle : undefined}
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
      <Show when={!streaming() && isRichMessagePart(richMessage()) && !fullPage()}>
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
