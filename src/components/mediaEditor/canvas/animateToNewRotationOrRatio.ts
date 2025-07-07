import {modifyMutable, produce} from 'solid-js/store'

import {animateValue, lerp, lerpArray, snapToViewport} from '../utils';
import {useMediaEditorContext} from '../context';
import {NumberPair} from '../types';

import {useCropOffset} from './useCropOffset';

export function animateToNewRotationOrRatio(newRotation: number) {
  const {editorState, mediaState} = useMediaEditorContext();
  if(!editorState.imageSize) return;

  const cropOffset = useCropOffset();

  const [w, h] = editorState.imageSize;

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

  mediaState.currentImageRatio = ratio;
  editorState.isMoving = true;

  animateValue(
    0,
    1,
    200,
    (progress) => {
      modifyMutable(mediaState, produce((state) => {
        state.scale = lerp(initialScale, targetScale, progress);
        state.translation = lerpArray(initialTranslation, targetTranslation, progress) as NumberPair;
        state.rotation = lerp(initialRotation, targetRotation, progress);
      }));
    },
    {
      onEnd: () => {
        editorState.isMoving = false;
        mediaState.rotation = mediaState.rotation % (Math.PI * 2);
      }
    }
  );
}
