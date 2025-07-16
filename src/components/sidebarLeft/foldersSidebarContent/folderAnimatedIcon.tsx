import {createEffect, createSignal, onCleanup} from 'solid-js';
import ListenerSetter from '../../../helpers/listenerSetter';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import type {AppManagers} from '../../../lib/appManagers/managers';
import wrapSticker from '../../wrappers/sticker';


export default function FolderAnimatedIcon(props: {
  managers: AppManagers;
  docId: DocId;
  color: string;
  size: number;
  class?: string;
  onFail?: () => void;
  dontAnimate?: boolean;
}) {
  const [iconContainer, setIconContainer] = createSignal<HTMLDivElement>();

  createEffect(() => {
    if(!iconContainer()) return;

    [props.color, props.size];
    const docId = props.docId;
    const animate = !props.dontAnimate;

    const middleware = createMiddleware().get();

    const listenerSetter = new ListenerSetter;

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    (async() => {
      try {
        const doc = await props.managers.appEmojiManager.getCustomEmojiDocument(props.docId);

        if(!doc) {
          props.onFail?.();
          return;
        }

        if(!middleware() || !iconContainer() || docId !== props.docId) return;

        wrapSticker({
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
      } catch{
        props.onFail?.();
      }
    })();
  });

  return (
    <div ref={setIconContainer} class={props.class}></div>
  );
}
