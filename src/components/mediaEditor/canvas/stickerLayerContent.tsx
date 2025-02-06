import {onCleanup, onMount, useContext} from 'solid-js';

import createMiddleware from '../../../helpers/solid/createMiddleware';
import wrapSticker from '../../wrappers/sticker';

import MediaEditorContext from '../context';
import {ResizableLayerProps} from '../types';

import {ResizableContainer} from './resizableLayers';

export default function StickerLayerContent(props: ResizableLayerProps) {
  const context = useContext(MediaEditorContext);
  const [, setStickersLayersInfo] = context.stickersLayersInfo;

  let container: HTMLDivElement;
  const [layer] = props.layerSignal;

  onMount(() => {
    const middleware = createMiddleware();

    wrapSticker({
      div: container,
      doc: layer().sticker,
      group: 'none',
      width: 500,
      height: 500,
      play: true,
      loop: true,
      withThumb: false,
      middleware: middleware.get()
    });

    setStickersLayersInfo((prev) => ({
      ...prev,
      [layer().id]: {container}
    }));

    onCleanup(() => {
      middleware.destroy();
    });
  });

  return (
    <ResizableContainer layerSignal={props.layerSignal}>
      <div ref={container} class="media-editor__sticker-layer-content"></div>
    </ResizableContainer>
  );
}
