import {getOwner, runWithOwner, Signal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {createPosterFromMedia} from '@helpers/createPoster';
import {MediaSize} from '@helpers/mediaSize';
import noop from '@helpers/noop';
import detectVideoHasSound from '@helpers/video/detectVideoHasSound';
import {logger} from '@lib/logger';
import {adjustmentsConfig, AdjustmentsConfig} from '@components/mediaEditor/adjustments';
import BrushPainter from '@components/mediaEditor/canvas/brushPainter';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {EditingMediaState, useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair} from '@components/mediaEditor/types';
import {checkIfHasAnimatedStickers, cleanupWebGl, fontInfoMap, snapToAvailableQuality} from '@components/mediaEditor/utils';
import {loadEditorFont} from '@components/mediaEditor/fonts';
import '@components/mediaEditor/fonts.scss';
import {draw} from '@components/mediaEditor/webgl/draw';
import {initWebGL} from '@components/mediaEditor/webgl/initWebGL';
import getResultSize from '@components/mediaEditor/finalRender/getResultSize';
import getResultTransform from '@components/mediaEditor/finalRender/getResultTransform';
import getScaledLayersAndLines from '@components/mediaEditor/finalRender/getScaledLayersAndLines';
import renderToActualVideo from '@components/mediaEditor/finalRender/renderToActualVideo';
import renderToImage from '@components/mediaEditor/finalRender/renderToImage';
import renderToVideoGIF from '@components/mediaEditor/finalRender/renderToVideoGIF';
import spawnAnimatedPreview from '@components/mediaEditor/finalRender/spawnAnimatedPreview';
import type {ReadyNativeVideoDecision} from '@components/mediaEditor/finalRender/renderNativeVideo';
import {getDesktopCropExport} from '@components/mediaEditor/native/desktopCropExport';
import {getAndroidPaintExport} from '@components/mediaEditor/native/androidPaintExport';
import {createAndroidPaintRenderer} from '@components/mediaEditor/native/androidPaintRenderer';
import {drawAndroidPainting} from '@components/mediaEditor/native/androidPaintAdapter';
import {classifyEditorDocument, prepareEditorGif} from '@components/mediaEditor/animatedDocument';


export type MediaEditorFinalResultPayload = {
  blob: Blob;
  hasSound: boolean;
  thumb?: {
    blob: Blob;
    size: MediaSize;
  }
};

export type MediaEditorFinalResult = {
  preview: Blob;
  getResult: () => MediaEditorFinalResultPayload | Promise<MediaEditorFinalResultPayload>;
  cancel?: () => void;
  isVideo: boolean;
  width: number;
  height: number;
  originalSize?: NumberPair;
  videoDuration?: number;
  editingMediaState: EditingMediaState;
  animatedPreview?: HTMLImageElement;
  creationProgress?: Signal<number>;
};

const log = logger('MediaEditor.createFinalResult');

export async function createFinalResult(): Promise<MediaEditorFinalResult> {
  const context = useMediaEditorContext();
  const {editorState, mediaState, mediaSrc, mediaType, canImageResultInGIF} = context;
  const owner = getOwner();
  if(context.nativePaint && !context.nativePaint.finishShape()) throw new Error('Android paint shape could not finish');
  const androidPaint = getAndroidPaintExport(context);
  // Validate before video resolution, sizing and the original-blob shortcut.
  const desktopCrop = getDesktopCropExport(context);

  const cropOffset = useCropOffset();
  let nativeVideo: ReadyNativeVideoDecision;

  // Before any layer/font snapshot, including the later video/brush preview paths.
  // Nothing inside the measurement adapter calls back into export.
  const textWork = context.textSessions.finish();
  if(textWork) await textWork;
  // An explicit descriptor owns export, including when edits made it invalid.
  // Never fall through to legacy sizing/bitrate or the original-blob shortcut.
  if(mediaState.nativeVideoQuality) {
    if(!context.nativeVideo) throw new Error('Native video quality unavailable');
    const decision = await context.nativeVideo.resolveForExport();
    if(decision.status !== 'ready') throw new Error('Native video quality unavailable: ' + decision.reason);
    nativeVideo = decision;
  }
  const {resizableLayers, adjustments} = mediaState;

  // A GIF-only document must not silently fall through to still-image export.
  const gifLayers = resizableLayers.filter(layer => layer.sticker?.type === 'gif' && !layer.sticker.sticker);
  if(gifLayers.length) await Promise.all(gifLayers.map(layer => prepareEditorGif(context, layer.sticker, () => true)));
  for(const layer of resizableLayers) {
    if(!layer.sticker) continue;
    const source = classifyEditorDocument(layer.sticker);
    if(source.kind === 'unsupported') throw new Error('Unsupported editor document: ' + source.reason);
  }

  await Promise.all(resizableLayers.filter(layer => layer.type === 'text' && layer.textInfo).map(layer =>
    loadEditorFont(fontInfoMap[layer.textInfo.font], layer.textInfo.size,
      layer.textRenderingInfo?.lines.map(line => line.content).join('\n') || '')
  ));

  const hasAnimatedStickers = checkIfHasAnimatedStickers(resizableLayers) && canImageResultInGIF;

  const willResultInVideo = hasAnimatedStickers || mediaType === 'video';

  const videoType = mediaType === 'video' ? 'video' : hasAnimatedStickers ? 'gif' : undefined;

  const [, maxHeight] = getResultSize({
    imageWidth: editorState.renderingPayload?.media.width,
    newRatio: mediaState.currentImageRatio,
    scale: mediaState.scale,
    videoType,
    imageRatio: editorState.mediaRatio,
    cropOffset: cropOffset(),
    desktopCropSize: desktopCrop?.geometry.size
  });

  const maxQuality = snapToAvailableQuality(maxHeight);

  let [scaledWidth, scaledHeight] = getResultSize({
    imageWidth: editorState.renderingPayload?.media.width,
    newRatio: mediaState.currentImageRatio,
    scale: mediaState.scale,
    videoType,
    imageRatio: editorState.mediaRatio,
    cropOffset: cropOffset(),
    quality: willResultInVideo ? Math.min(maxQuality, mediaState.videoQuality) : undefined,
    desktopCropSize: desktopCrop?.geometry.size
  });
  if(nativeVideo) [scaledWidth, scaledHeight] = nativeVideo.plan.candidate.encoderSize;

  // Profile video avatars must stay small (server profile-video size limits +
  // the avatar is only ever shown tiny). Cap the square output to 800px; the
  // bitrate is separately capped in renderToActualVideo. h.264 needs even dims.
  if(context.isVideoAvatarMode && mediaType === 'video') {
    const AVATAR_VIDEO_MAX = 800;
    const max = Math.max(scaledWidth, scaledHeight);
    if(max > AVATAR_VIDEO_MAX) {
      const k = AVATAR_VIDEO_MAX / max;
      scaledWidth = Math.round(scaledWidth * k / 2) * 2;
      scaledHeight = Math.round(scaledHeight * k / 2) * 2;
    }
  }

  // Static profile photos: the server only ever stores/serves profile photos up
  // to 640px (sizes a/b/c = 160/320/640), so uploading the editor's default
  // up-to-2560px square is pure wasted bandwidth. Cap to 800px (small margin
  // over 640); every avatar source (regular / forum / fallback / contact) is
  // square-cropped here. tdesktop sends source-res, but the server downscales
  // either way — capping just avoids the needless upload, no quality loss.
  if(context.isEditingForAvatar && mediaType === 'image') {
    const AVATAR_PHOTO_MAX = 800;
    const max = Math.max(scaledWidth, scaledHeight);
    if(max > AVATAR_PHOTO_MAX) {
      const k = AVATAR_PHOTO_MAX / max;
      scaledWidth = Math.round(scaledWidth * k);
      scaledHeight = Math.round(scaledHeight * k);
    }
  }

  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = scaledWidth;
  imageCanvas.height = scaledHeight;

  const gl = imageCanvas.getContext('webgl', {
    preserveDrawingBuffer: true
  });

  const payload = await initWebGL({gl, mediaSrc, mediaType, videoTime: mediaState.videoCropStart, waitToSeek: false});

  // No modifications to a video: return the original blob and skip the render pipeline.
  // The animated preview is still produced so the caller can animate it into the target slot.
  // The UI's modification flag is throttled. A numeric quality reduction must
  // already own export if Done follows the choice before that flag catches up.
  const legacyQualityReduced = mediaType === 'video' && mediaState.videoQuality > 0 &&
    mediaState.videoQuality < snapToAvailableQuality(payload.media.height);
  if(mediaType === 'video' && !nativeVideo && !legacyQualityReduced && !context.hasModifications()) {
    const originalBlob = await context.getMediaBlob();
    if(!originalBlob) throw new Error('Failed to get original media blob');

    const videoEl = payload.media.video;
    const poster = await createPosterFromMedia(videoEl);
    const hasSound = await detectVideoHasSound(videoEl);

    const previewWidth = videoEl.videoWidth;
    const previewHeight = videoEl.videoHeight;

    const animatedPreview = await spawnAnimatedPreview({
      context,
      cropOffset,
      scaledWidth: previewWidth,
      scaledHeight: previewHeight,
      previewBlob: poster.blob
    });

    cleanupWebGl(gl);

    return {
      preview: poster.blob,
      getResult: () => ({blob: originalBlob, hasSound, thumb: poster}),
      isVideo: true,
      width: previewWidth,
      height: previewHeight,
      originalSize: [previewWidth, previewHeight],
      editingMediaState: structuredClone(unwrap(mediaState)),
      animatedPreview
    };
  }

  const finalTransform = getResultTransform({
    context,
    scaledWidth,
    scaledHeight,
    imageWidth: payload.media.width,
    imageHeight: payload.media.height,
    cropOffset
  });

  const drawToImageCanvas = () => {
    draw(gl, payload, {
      ...finalTransform,
      processingVersion: adjustments.processingVersion,
      native: adjustments.native,
      imageSize: [payload.media.width, payload.media.height],
      ...(Object.fromEntries(
        adjustmentsConfig.map(({key, to100}) => {
          const value = adjustments[key];
          return [key, value / (to100 ? 100 : 50)];
        })
      ) as Record<AdjustmentsConfig[number]['key'], number>)
    });
  };

  if(mediaType === 'image') drawToImageCanvas();

  const {scaledLayers, scaledLines} = getScaledLayersAndLines(context, finalTransform, scaledWidth, scaledHeight);

  const brushCanvas = document.createElement('canvas');
  brushCanvas.width = scaledWidth;
  brushCanvas.height = scaledHeight;

  if(androidPaint) {
    const paint = await createAndroidPaintRenderer(androidPaint);
    try {
      drawAndroidPainting(brushCanvas.getContext('2d'), paint.canvas, [payload.media.width, payload.media.height], finalTransform);
    } finally {
      paint.dispose();
    }
  } else {
    const brushPainter = new BrushPainter({targetCanvas: brushCanvas, imageCanvas});
    brushPainter.saveLastLine();
    scaledLines.forEach((line) => brushPainter.drawLine(line));
  }

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = scaledWidth;
  resultCanvas.height = scaledHeight;
  const ctx = resultCanvas.getContext('2d', {willReadFrequently: true});

  const renderPromise = (() => {
    if(mediaType === 'video')
      return runWithOwner(owner, () => renderToActualVideo({
        renderingPayload: payload,
        nativeVideo,
        hasAnimatedStickers,
        scaledWidth,
        scaledHeight,
        scaledLayers,
        imageCanvasGL: gl,
        imageCanvas,
        drawToImageCanvas,
        resultCanvas,
        brushCanvas,
        ctx
      }));

    if(hasAnimatedStickers)
      return runWithOwner(owner, () => renderToVideoGIF({
        scaledWidth,
        scaledHeight,
        scaledLayers,
        imageCanvas,
        resultCanvas,
        brushCanvas,
        ctx
      }));

    return renderToImage({
      context,
      scaledLayers,
      imageCanvas,
      resultCanvas,
      brushCanvas,
      ctx
    });
  })();

  let renderResult: Awaited<typeof renderPromise>;
  try {
    renderResult = await renderPromise;
  } catch(error) {
    // Decoding/preview can reject before handing back getResult(), so
    // the normal completion cleanup below has not yet been installed.
    try { cleanupWebGl(gl); } catch{}
    throw error;
  }

  const animatedPreview = renderResult.preview ? await spawnAnimatedPreview({
    context,
    cropOffset,
    scaledWidth,
    scaledHeight,
    previewBlob: renderResult.preview
  }) : undefined;

  Promise.resolve(renderResult.getResult())?.catch(noop)?.finally(() => {
    cleanupWebGl(gl);
    log('cleaning up webgl')
  });

  return {
    ...renderResult,
    animatedPreview,
    width: scaledWidth,
    height: scaledHeight,
    originalSize: [payload.media.width, payload.media.height],
    editingMediaState: structuredClone(unwrap(mediaState))
  };
}
