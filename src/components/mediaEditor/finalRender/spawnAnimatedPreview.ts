import deferredPromise from '@helpers/cancellablePromise';
import {ObjectURLScope} from '@helpers/objectUrl';

import {MediaEditorContextValue} from '@components/mediaEditor/context';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {delay, snapToViewport} from '@components/mediaEditor/utils';


type SpawnAnimatedPreviewOptions = {
  context: MediaEditorContextValue;
  cropOffset: ReturnType<typeof useCropOffset>;
  scaledWidth: number;
  scaledHeight: number;
  previewBlob: Blob;
}

export default async function spawnAnimatedPreview({
  context,
  cropOffset,
  scaledWidth,
  scaledHeight,
  previewBlob
}: SpawnAnimatedPreviewOptions) {
  const {editorState: {currentTab, imageCanvas}} = context;

  const isCropping = currentTab === 'crop';

  const bcr = imageCanvas.getBoundingClientRect();
  const animatedImg = new Image();
  const objectURLs = new ObjectURLScope();
  const url = objectURLs.create(previewBlob);
  animatedImg.src = url;
  animatedImg.style.position = 'fixed';
  const left = bcr.left + (isCropping ? cropOffset().left + cropOffset().width / 2 : bcr.width / 2),
    top = bcr.top + (isCropping ? cropOffset().top + cropOffset().height / 2 : bcr.height / 2);

  const [width, height] = snapToViewport(
    scaledWidth / scaledHeight,
    isCropping ? cropOffset().width : bcr.width,
    isCropping ? cropOffset().height : bcr.height
  );
  animatedImg.style.left = left + 'px';
  animatedImg.style.top = top + 'px';
  animatedImg.style.width = width + 'px';
  animatedImg.style.height = height + 'px';
  animatedImg.style.transform = 'translate(-50%, -50%)';
  animatedImg.style.objectFit = 'cover';
  animatedImg.style.zIndex = '1000';

  document.body.append(animatedImg);

  const deferred = deferredPromise<void>();

  const onLoadEnd = () => {
    animatedImg.removeEventListener('load', onLoadEnd);
    animatedImg.removeEventListener('error', onLoadEnd);
    objectURLs.release(url);
    deferred.resolve();
  };

  animatedImg.addEventListener('load', onLoadEnd, {once: true});
  animatedImg.addEventListener('error', onLoadEnd, {once: true});

  await Promise.race([delay(500), deferred]);

  return animatedImg;
}
