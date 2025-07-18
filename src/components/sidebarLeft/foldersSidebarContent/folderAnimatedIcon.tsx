import {createEffect, createSignal, onCleanup} from 'solid-js';
import noop from '../../../helpers/noop';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import track from '../../../helpers/solid/track';
import {DocumentAttribute} from '../../../layer';
import type {AppManagers} from '../../../lib/appManagers/managers';
import wrapSingleEmoji from '../../../lib/richTextProcessor/wrapSingleEmoji';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import wrapSticker from '../../wrappers/sticker';


export default function FolderAnimatedIcon(props: {
  managers: AppManagers;
  docId?: DocId;
  emoji?: string;
  color: string;
  size: number;
  class?: string;
  onFail?: () => void;
  dontAnimate?: boolean;
}) {
  const [iconContainer, setIconContainer] = createSignal<HTMLDivElement>();

  createEffect(() => {
    if(!iconContainer()) return;

    const [playerToColor, setPlayerToColor] = createSignal<RLottiePlayer>();

    const docId = props.docId;
    const emoji = props.emoji;
    const animate = !props.dontAnimate;

    track(() => props.size);

    const middleware = createMiddleware().get();

    createEffect(() => {
      playerToColor()?.setColor(props.color, true);
    });

    onCleanup(() => {
      iconContainer()?.replaceChildren();
    });

    if(docId) (async() => {
      try {
        const doc = await props.managers.appEmojiManager.getCustomEmojiDocument(docId);

        if(!doc) {
          props.onFail?.();
          return;
        }

        if(!middleware() || !iconContainer() || docId !== props.docId) return;

        const promise = await wrapSticker({
          doc,
          div: iconContainer(),
          group: 'none',
          width: props.size,
          height: props.size,
          play: animate,
          loop: animate,
          withThumb: false,
          middleware,
          textColor: props.color
        });

        const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
        if(attribute && attribute.pFlags.text_color) promise.render.then(renderResult => {
          if(!middleware()) return;
          renderResult instanceof RLottiePlayer && setPlayerToColor(renderResult);
        }).catch(noop);
      } catch{
        props.onFail?.();
      }
    })();

    else if(emoji) {
      const fragment = wrapSingleEmoji(emoji);
      iconContainer()?.append(fragment);
    }

    else props.onFail?.();
  });

  return (
    <div ref={setIconContainer} class={props.class}></div>
  );
}
