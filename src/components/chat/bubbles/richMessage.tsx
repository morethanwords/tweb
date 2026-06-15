import {Show, createSignal} from 'solid-js';
import {Message, Page, RichMessage} from '@layer';
import {openInstantViewInAppBrowser} from '@components/browser';
import {InstantViewBlocks} from '@components/instantView';
import styles from '@components/instantView.module.scss';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {isRichMessagePart, richMessageToPage} from '@lib/richMessage';
import cancelEvent from '@helpers/dom/cancelEvent';

export function RichMessageBubble(props: {
  message: Message.message,
  richMessage: RichMessage,
  page: Page.page
}) {
  const {i18n, rootScope} = useHotReloadGuard();
  const [loading, setLoading] = createSignal(false);
  const [fullPage, setFullPage] = createSignal<Page.page>();
  let fullPagePromise: Promise<Page.page | undefined>;

  const openPage = (page: Page.page) => {
    openInstantViewInAppBrowser({
      webPageId: props.message.mid,
      cachedPage: page,
      HotReloadGuardProvider: SolidJSHotReloadGuardProvider
    });
  };

  const openFull = async(e: MouseEvent) => {
    cancelEvent(e);

    if(!isRichMessagePart(props.richMessage)) {
      openPage(props.page);
      return;
    }

    const cached = fullPage();
    if(cached) {
      openPage(cached);
      return;
    }

    setLoading(true);
    try {
      fullPagePromise ??= rootScope.managers.appMessagesManager.getRichMessage(props.message.peerId, props.message.mid)
      .then((richMessage) => richMessage && richMessageToPage(richMessage));
      const page = await fullPagePromise;
      if(page) {
        setFullPage(page);
        openPage(page);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class={styles.RichMessageWrapper}>
      <InstantViewBlocks
        webPageId={props.message.mid}
        page={props.page}
        openNewPage={(url) => {
          openInstantViewInAppBrowser({
            cachedPage: url,
            HotReloadGuardProvider: SolidJSHotReloadGuardProvider
          });
        }}
        collapse={() => {}}
        class={styles.RichMessage}
        paddings={0}
      />
      <Show when={isRichMessagePart(props.richMessage)}>
        <button
          type="button"
          class={styles.RichMessageMore}
          disabled={loading()}
          onClick={openFull}
        >
          {loading() ? i18n('Loading') : i18n('Chat.Message.Ad.ReadMore')}
        </button>
      </Show>
    </div>
  );
}
