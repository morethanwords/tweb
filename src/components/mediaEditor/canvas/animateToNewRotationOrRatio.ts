import {batch, useContext} from 'solid-js';

import MediaEditorContext from '../context';
import {animateValue, lerp, lerpArray, snapToViewport} from '../utils';

import {useCropOffset} from './useCropOffset';

export function animateToNewRotationOrRatio(newRotation: number) {
  const context = useContext(MediaEditorContext);
  const [translation, setTranslation] = context.translation;
  const [scale, setScale] = context.scale;
  const [rotation, setRotation] = context.rotation;
  const [, setCurrentImageRatio] = context.currentImageRatio;
  const [fixedImageRatioKey] = context.fixedImageRatioKey;
  const [imageSize] = context.imageSize;
  const [, setIsMoving] = context.isMoving;

  const cropOffset = useCropOffset();

  const [w, h] = imageSize();
  if(!w || !h) return;

  const snappedRotation90 = Math.round((newRotation / Math.PI) * 2);
  const isReversedRatio = Math.abs(snappedRotation90) & 1;
  const snappedRotation = (snappedRotation90 * Math.PI) / 2;

  let ratio: number;

  if(fixedImageRatioKey()?.includes('x')) {
    const parts = fixedImageRatioKey().split('x');
    ratio = parseInt(parts[0]) / parseInt(parts[1]);
  } else {
    ratio = isReversedRatio ? h / w : w / h;
  }

  const originalRatio = w / h;

  const [w1, h1] = snapToViewport(originalRatio, cropOffset().width, cropOffset().height);
  const [w2, h2] = snapToViewport(ratio, cropOffset().width, cropOffset().height);

  const initialScale = scale();
  const initialTranslation = translation();
  const initialRotation = rotation();
  const targetScale = isReversedRatio ? Math.max(w2 / h1, h2 / w1) : Math.max(w2 / w1, h2 / h1);
  const targetTranslation = [0, 0];
  const targetRotation = snappedRotation;

  setCurrentImageRatio(ratio);

  setIsMoving(true);
  animateValue(
    0,
    1,
    200,
    (progress) => {
      batch(() => {
        setScale(lerp(initialScale, targetScale, progress));
        setTranslation(lerpArray(initialTranslation, targetTranslation, progress) as [number, number]);
        setRotation(lerp(initialRotation, targetRotation, progress));
      });
    },
    {
      onEnd: () => setIsMoving(false)
    }
  );
}
