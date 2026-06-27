import wrapSticker from '@components/wrappers/sticker';
import noop from '@helpers/noop';
import createMiddleware from '@helpers/solid/createMiddleware';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {Document, DocumentAttribute} from '@layer';
import type {AppManagers} from '@lib/managers';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import {createEffect, createResource, createSignal, untrack} from 'solid-js';


function useStickerRenderer(options: {
  container: HTMLDivElement;
  doc: Document.document;
  color: () => string;
  size: () => number;
  dontAnimate?: () => boolean;
  onFail?: () => void;
}) {
  const {container} = options;
  const [playerToColor, setPlayerToColor] = createSignal<RLottiePlayer>();

  createEffect(() => {
    playerToColor()?.setColor(options.color(), true);
  });

  createEffect(() => {
    const size = options.size();
    const color = untrack(options.color);

    const middleware = createMiddleware().get();
    const isCleaned = useIsCleaned();

    container.replaceChildren();
    setPlayerToColor();

    const animate = !options.dontAnimate?.();

    (async() => {
      try {
        const promise = await wrapSticker({
          doc: options.doc,
          div: container,
          group: 'none',
          width: size,
          height: size,
          play: animate,
          loop: animate,
          withThumb: false,
          middleware,
          textColor: color
        });

        const attribute = options.doc.attributes.find(
          (attribute) => attribute._ === 'documentAttributeCustomEmoji'
        ) as DocumentAttribute.documentAttributeCustomEmoji;

        if(attribute?.pFlags.text_color) {
          const renderResult = await promise.render.catch(noop);
          if(isCleaned()) return;
          if(renderResult instanceof RLottiePlayer) setPlayerToColor(renderResult);
        }
      } catch{
        if(isCleaned()) return;
        options.onFail?.();
      }
    })();
  });
}

export default function EmojiDocumentIcon(props: {
  managers: AppManagers;
  docId: DocId;
  color: string;
  size: number;
  class?: string;
  dontAnimate?: boolean;
  onFail?: () => void;
}) {
  const container = (<div class={props.class} />) as HTMLDivElement;

  const [doc] = createResource(
    () => props.docId,
    (docId) => props.managers.appEmojiManager.getCustomEmojiDocument(docId)
  );

  createEffect(() => {
    if(doc.loading) return;

    const loadedDoc = doc.error ? undefined : doc();
    if(!loadedDoc) {
      props.onFail?.();
      return;
    }

    useStickerRenderer({
      container,
      doc: loadedDoc,
      color: () => props.color,
      size: () => props.size,
      dontAnimate: () => props.dontAnimate,
      onFail: () => props.onFail?.()
    });
  });

  return container;
}
