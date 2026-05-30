import type {AnimationItemGroup} from '@components/animationIntersector';
import createMiddleware from '@helpers/solid/createMiddleware';
import type {MyDocument} from '@lib/appManagers/appDocsManager';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {onMount} from 'solid-js';
import type wrapSticker from './wrappers/sticker';


export type StickerPreviewProps = {
  /** When provided, the sticker is rendered synchronously without an extra lookup. */
  doc?: MyDocument;
  /** Fallback when only the docId is available; the doc will be fetched lazily. */
  docId?: DocId;
  /** Animation group passed to `wrapSticker`. Defaults to `'none'`. */
  animationGroup?: AnimationItemGroup;
  width?: number;
  height?: number;
  class?: string;
  ref?: (el: HTMLDivElement) => void;
  onClick?: () => void;

  stickerOptions?: Partial<Parameters<typeof wrapSticker>[0]>;
};

export const StickerPreview = (props: StickerPreviewProps) => {
  const {rootScope, wrapSticker} = useHotReloadGuard();

  let container: HTMLDivElement;

  onMount(() => {
    const middleware = createMiddleware().get();

    (async() => {
      const doc = props.doc ?? await rootScope.managers.appDocsManager.getDoc(props.docId);
      if(!middleware()) return;

      wrapSticker({
        div: container,
        doc,
        group: props.animationGroup ?? 'none',
        width: props.width ?? 40,
        height: props.height ?? 40,
        play: true,
        loop: true,
        withThumb: false,
        middleware,
        ...props.stickerOptions
      });
    })();
  });

  return (
    <div
      ref={(el) => {
        container = el;
        props.ref?.(el);
      }}
      class={props.class}
      onClick={props.onClick}
    />
  );
};

export default StickerPreview;
