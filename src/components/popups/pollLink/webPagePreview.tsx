import createMiddleware from '@helpers/solid/createMiddleware';
import {Message, MessageMedia, WebPage} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createSignal, onCleanup} from 'solid-js';


export function hasRichWebPagePreview(page: WebPage): page is WebPage.webPage {
  return page._ === 'webPage' && !!(
    page.photo ||
    page.document ||
    page.site_name ||
    page.title ||
    page.author ||
    page.description ||
    page.cached_page ||
    page.attributes?.length
  );
}

function makeWebPagePreviewMediaResponsive(box: ParentNode) {
  const preview = box.querySelector<HTMLElement>('.webpage-preview');
  if(!preview) return;

  const width = Number.parseFloat(preview.style.width);
  const height = Number.parseFloat(preview.style.height);
  if(!(width > 0) || !(height > 0)) return;

  // Bubble media is sized inline. In the narrower popup max-width reduces only
  // its width, so keep the original ratio instead of leaving the stale height.
  preview.style.aspectRatio = `${width} / ${height}`;
  preview.style.height = 'auto';
}

export default function PollLinkWebPagePreview(props: {
  class?: string;
  media: MessageMedia.messageMediaWebPage;
  message: Message.message;
  onClose: (restoreTriggerFocus?: boolean) => void;
}) {
  const {appImManager} = useHotReloadGuard();
  const [rendered, setRendered] = createSignal(false);
  let container: HTMLDivElement;

  createEffect(() => {
    const media = props.media;
    const middlewareHelper = createMiddleware();
    const middleware = middlewareHelper.get();
    let box: HTMLAnchorElement;

    setRendered(false);
    container.replaceChildren();

    const bubbles = appImManager.chat?.bubbles;
    if(!bubbles) {
      middlewareHelper.destroy();
      return;
    }

    void bubbles.renderWebPagePreview({
      message: props.message,
      media,
      middleware
    }).then((renderedBox) => {
      if(!middleware() || !renderedBox) return;

      box = renderedBox;
      makeWebPagePreviewMediaResponsive(box);
      box.addEventListener('click', handleClick);
      container.replaceChildren(box);
      setRendered(true);
    }).catch((): undefined => undefined);

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      const nestedAnchor = target?.closest('a');
      if(nestedAnchor && nestedAnchor !== box) {
        if(box.dataset.callback === 'showMaskedAlert') {
          const handled = appImManager.chat?.bubbles.dispatchWebPageClick(box, event);
          if(handled) props.onClose(false);
          return;
        }

        queueMicrotask(() => props.onClose(false));
        return;
      }

      if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const handled = appImManager.chat?.bubbles.dispatchWebPageClick(box, event);
      if(handled) props.onClose(false);
    };

    onCleanup(() => {
      box?.removeEventListener('click', handleClick);
      middlewareHelper.destroy();
      container.replaceChildren();
      setRendered(false);
    });
  });

  return <div ref={container} class={rendered() ? props.class : undefined} />;
}
