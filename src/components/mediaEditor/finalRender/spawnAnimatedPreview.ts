import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import deferredPromise from '../../../helpers/cancellablePromise';

import {MediaEditorContextValue} from '../context';
import {useCropOffset} from '../canvas/useCropOffset';
import {delay, snapToViewport} from '../utils';


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
  const [currentTab] = context.currentTab;

  const isCroping = currentTab() === 'crop';

  const [positionCanvas] = context.imageCanvas;
  const bcr = positionCanvas().getBoundingClientRect();
  const animatedImg = new Image();
  animatedImg.src = await apiManagerProxy.invoke('createObjectURL', previewBlob);
  animatedImg.style.position = 'fixed';
  const left = bcr.left + (isCroping ? cropOffset().left + cropOffset().width / 2 : bcr.width / 2),
    top = bcr.top + (isCroping ? cropOffset().top + cropOffset().height / 2 : bcr.height / 2);

  const [width, height] = snapToViewport(
    scaledWidth / scaledHeight,
    isCroping ? cropOffset().width : bcr.width,
    isCroping ? cropOffset().height : bcr.height
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

  animatedImg.addEventListener('load', () => deferred.resolve())

  await Promise.race([delay(500), deferred]);

  return animatedImg;
}
