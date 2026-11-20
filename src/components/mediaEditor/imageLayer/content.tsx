import {createEffect, onCleanup} from 'solid-js';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {ResizableContainer} from '@components/mediaEditor/canvas/resizableLayers';
import type {ResizableLayer} from '@components/mediaEditor/types';
import {imageLayerSession} from '@components/mediaEditor/imageLayer/session';
import {imageLayerFlipped} from '@components/mediaEditor/imageLayer/reflection';
import Modes from '@config/modes';
import I18n from '@lib/langPack';

export default function ImageLayerContent(props: {layer: Extract<ResizableLayer, {type: 'image'}>}) {
  const context = useMediaEditorContext();
  let canvas: HTMLCanvasElement;
  createEffect(() => {
    const payload = props.layer.image;
    let canceled = false;
    imageLayerSession(context).resources.resolve(payload).then(({bitmap}) => {
      if(canceled) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
    }).catch(error => {
      if(canceled) return;
      canvas.setAttribute('role', 'alert');
      canvas.setAttribute('aria-label', I18n.format('Error.AnError', true));
      canvas.title = String(error);
    });
    onCleanup(() => { canceled = true; });
  });
  return <ResizableContainer layer={props.layer}>
    <canvas ref={canvas} data-image-layer={props.layer.id} aria-hidden="true" style={{
      display: 'block',
      transform: imageLayerFlipped(context, props.layer) ? 'scaleX(-1)' : undefined,
      width: props.layer.displayWidth / context.editorState.pixelRatio + 'px',
      height: props.layer.displayHeight / context.editorState.pixelRatio + 'px'
    }} />
    {Modes.a11y && <button type="button" class="media-editor__resizable-container-select"
      aria-label={I18n.format('MediaEditor.LayerActions', true)}
      onClick={() => { context.editorState.selectedResizableLayer = props.layer.id; }} />}
  </ResizableContainer>;
}
