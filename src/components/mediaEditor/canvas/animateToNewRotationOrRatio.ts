import {modifyMutable, produce} from 'solid-js/store';
import {animateValue} from '@helpers/animateValue';
import liteMode from '@helpers/liteMode';
import {lerp, lerpArray} from '@helpers/lerp';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair} from '@components/mediaEditor/types';
import {snapToViewport} from '@components/mediaEditor/utils';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import desktopCropSession from '@components/mediaEditor/native/desktopCropSession';
import {desktopCropOrientation} from '@components/mediaEditor/native/desktopCropGeometry';
import {desktopCropFromDisplay, desktopCropToIntegerRect, mapDesktopCropRect, selectDesktopCropRatio} from '@components/mediaEditor/native/desktopExpandedCrop';


export function animateToNewRotationOrRatio(newRotation: number) {
  const context = useMediaEditorContext();
  const {editorState, mediaState} = context;
  if(!editorState.mediaSize) return;

  if(context.canUseDesktopExpandedCrop) {
    const {angle, flipped} = desktopCropOrientation(newRotation, mediaState.flip);
    const session = desktopCropSession(context), descriptor = session.descriptor();
    if(newRotation !== mediaState.rotation) session.commit(descriptor, true);
    const [width, height] = descriptor.sourceSize;
    const image = mapDesktopCropRect({x: 0, y: 0, width, height}, descriptor.sourceSize, angle, flipped);
    const key = editorState.fixedImageRatioKey;
    const parts = key?.split('x').map(Number);
    const ratio = key === 'original' ? image.width / image.height : parts?.length === 2 ? parts[0] / parts[1] : 0;
    if(ratio) {
      const crop = mapDesktopCropRect(descriptor.crop, descriptor.sourceSize, angle, flipped);
      const selected = selectDesktopCropRatio(image, crop, ratio);
      session.commit({...descriptor, crop: desktopCropToIntegerRect(desktopCropFromDisplay(selected,
        descriptor.sourceSize, image, angle, flipped))});
    }
    mediaState.rotation = newRotation;
    return;
  }

  const cropOffset = useCropOffset();

  const [w, h] = editorState.mediaSize;

  const snappedRotation90 = Math.round((newRotation / Math.PI) * 2);
  const isReversedRatio = Math.abs(snappedRotation90) & 1;
  const snappedRotation = (snappedRotation90 * Math.PI) / 2;

  let ratio: number;

  if(editorState.fixedImageRatioKey?.includes('x')) {
    const parts = editorState.fixedImageRatioKey.split('x');
    ratio = parseInt(parts[0]) / parseInt(parts[1]);
  } else {
    ratio = isReversedRatio ? h / w : w / h;
  }

  const originalRatio = w / h;

  const [w1, h1] = snapToViewport(originalRatio, cropOffset().width, cropOffset().height);
  const [w2, h2] = snapToViewport(ratio, cropOffset().width, cropOffset().height);

  const initialScale = mediaState.scale;
  const initialTranslation = mediaState.translation;
  const initialRotation = mediaState.rotation;
  const targetScale = isReversedRatio ? Math.max(w2 / h1, h2 / w1) : Math.max(w2 / w1, h2 / h1);
  const targetTranslation = [0, 0];
  const targetRotation = snappedRotation;

  const updateTransform = (progress: number) => {
    modifyMutable(mediaState, produce((state) => {
      state.scale = lerp(initialScale, targetScale, progress);
      state.translation = lerpArray(initialTranslation, targetTranslation, progress) as NumberPair;
      state.rotation = lerp(initialRotation, targetRotation, progress);
    }));
  };
  const finish = () => {
    editorState.isMoving = false;
    mediaState.rotation = mediaState.rotation % (Math.PI * 2);
  };

  mediaState.currentImageRatio = ratio;
  // Rotation and reframing travel across the photograph; reduced motion applies
  // the same final crop without intermediate transforms or a temporary input lock.
  if(!liteMode.isAvailable('motion')) {
    updateTransform(1);
    finish();
    return;
  }
  editorState.isMoving = true;

  animateValue(
    0,
    1,
    200,
    updateTransform,
    {onEnd: finish}
  );
}
