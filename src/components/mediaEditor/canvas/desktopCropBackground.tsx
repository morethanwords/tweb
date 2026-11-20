import {createEffect} from 'solid-js';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {drawDesktopCropBackground, sampleDesktopCropBackground} from '@components/mediaEditor/native/desktopCropBackground';
import {desktopCropToDisplay} from '@components/mediaEditor/native/desktopExpandedCrop';

export default function DesktopCropBackground() {
  const context = useMediaEditorContext();
  const {editorState} = context;
  const session = desktopCropSession(context);
  const canvas = <canvas aria-hidden="true" /> as HTMLCanvasElement;
  createEffect(() => {
    const view = session.view(), descriptor = session.descriptor();
    const original = editorState.renderingPayload?.media.image;
    const size = editorState.canvasSize;
    if(!view || !descriptor || !original || !size) return;
    const ratio = editorState.pixelRatio;
    canvas.width = size[0] * ratio;
    canvas.height = size[1] * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const {angle, flipped} = view.geometry.orientation;
    const crop = desktopCropToDisplay(descriptor.crop, descriptor.sourceSize, view.image, angle, flipped);
    drawDesktopCropBackground(ctx, crop, view.image, sampleDesktopCropBackground(original));
  });
  return canvas;
}
