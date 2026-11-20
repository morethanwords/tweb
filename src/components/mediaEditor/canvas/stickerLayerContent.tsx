import {onCleanup, onMount} from 'solid-js';

import createMiddleware from '@helpers/solid/createMiddleware';
import wrapSticker from '@components/wrappers/sticker';
import wrapVideo from '@components/wrappers/video';
import {classifyEditorDocument, prepareEditorGif} from '@components/mediaEditor/animatedDocument';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import {pinObjectURL} from '@helpers/objectUrl';

import {useMediaEditorContext} from '@components/mediaEditor/context';
import {ResizableLayerProps} from '@components/mediaEditor/types';

import {ResizableContainer} from '@components/mediaEditor/canvas/resizableLayers';

export default function StickerLayerContent(props: ResizableLayerProps) {
  const context = useMediaEditorContext();
  const {editorState, canImageResultInGIF} = context;
  const managers = bindManagersToSession(context.managers);
  const session = getManagersSession(managers);

  let container: HTMLDivElement;

  onMount(() => {
    const middleware = createMiddleware();

    const doc = props.layer.sticker;
    const lifetime = middleware.get();
    const alive = () => lifetime() && !isSessionLeaving(session) && props.layer.sticker === doc;
    const mount = async() => {
      if(doc?.type === 'gif' && !doc.sticker) await prepareEditorGif(context, doc, alive);
      if(!alive()) return;
      const source = classifyEditorDocument(doc);
      if(source.kind === 'unsupported') throw new Error(source.reason);
      if(source.kind === 'mp4-gif') {
        const wrapped = await wrapVideo({doc, container, managers, middleware: lifetime, boxWidth: 500, boxHeight: 500,
          noInfo: true, noPreview: true, noPlayButton: true, withoutPreloader: true,
          ignoreStreaming: true, canAutoplay: true, group: 'none', onLoad: () => {
            if(!alive()) return;
            const video = container.querySelector('video');
            if(video?.src) lifetime.onClean(pinObjectURL(video.src));
          }});
        await wrapped.loadPromise;
        if(!alive()) middleware.destroy();
        return;
      }
      await wrapSticker({
        div: container,
        doc: props.layer.sticker,
        managers,
        group: 'none',
        width: 500,
        height: 500,
        play: canImageResultInGIF,
        loop: canImageResultInGIF,
        withThumb: false,
        middleware: lifetime
      });
    };
    mount().catch(error => {
      const report = alive();
      middleware.destroy();
      if(report) {
        container.dataset.unsupportedDocument = String(error);
        console.error('Failed to load media editor document', error);
      }
    });

    editorState.stickersLayersInfo[props.layer.id] = {container};
    onCleanup(() => {
      if(editorState.stickersLayersInfo[props.layer.id]?.container === container) delete editorState.stickersLayersInfo[props.layer.id];
    });
  });

  const children = (
    <div
      ref={container}
      class="media-editor__sticker-layer-content"
      aria-hidden={true}
      style={{transform: props.layer.stickerFlip ? 'scaleX(-1)' : undefined}}
    />
  ); // Needs to be rendered here for hot reload to work properly

  return (
    <ResizableContainer layer={props.layer}>
      {children}
    </ResizableContainer>
  );
}
