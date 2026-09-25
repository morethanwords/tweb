import {ObjectURLScope} from '@helpers/objectUrlScope';
import {createPosterFromMedia} from '@helpers/createPoster';
import blur from '@helpers/blur';
import {setRichMediaPreviewPoster, setRichMediaPreviewSideFill, setRichMediaPreviewSource} from '@components/chat/inputEditor/mediaPreviewUrl';
import {createImageSource, createVideoSource, getSourceSize} from '@components/chat/editMessageMedia';
import type {RichMediaUploadTaskItem} from '@components/richMessageInput/media';

async function createRichMediaPreviewFrame(
  source: HTMLImageElement | HTMLVideoElement,
  mimeType?: 'image/png'
) {
  const {blob} = await createPosterFromMedia(source, mimeType);
  const objectURLs = new ObjectURLScope();
  const posterUrl = objectURLs.create(blob);
  try {
    const blurred = blur(posterUrl, 10, 2, 48);
    const [poster, sideFill] = await Promise.all([
      createImageSource(posterUrl),
      blurred.promise.then(() => createImageSource(blurred.canvas.toDataURL()))
    ]);
    return {poster, posterUrl, sideFill, releasePoster: () => objectURLs.dispose()};
  } catch(error) {
    objectURLs.dispose();
    throw error;
  }
}

export async function loadRichMediaPreview(item: RichMediaUploadTaskItem) {
  if(item.type === 'audio') return;

  let duration: number | undefined;
  let height: number;
  let source: HTMLImageElement | HTMLVideoElement;
  let width: number;
  if(item.type === 'photo') {
    source = await createImageSource(item.previewUrl);
    [width, height] = getSourceSize(source);
  } else {
    source = await createVideoSource(item.previewUrl);
    [width, height] = getSourceSize(source);
    if(Number.isFinite(source.duration)) {
      duration = Math.max(0, Math.floor(source.duration));
    }
  }

  const {poster, posterUrl, sideFill, releasePoster} = await createRichMediaPreviewFrame(
    source,
    item.type === 'photo' && item.mimeType === 'image/png' ? 'image/png' : undefined
  );
  setRichMediaPreviewPoster(item.previewUrl, poster, posterUrl, releasePoster);
  setRichMediaPreviewSource(item.previewUrl, source);
  setRichMediaPreviewSideFill(item.previewUrl, sideFill);
  if(!(width > 0) || !(height > 0)) {
    throw new Error('RICH_MESSAGE_MEDIA_PREVIEW_INVALID');
  }
  item.duration = duration ?? item.duration;
  item.height = height;
  item.width = width;
}
