import {MediaEditorContextValue} from '../context';
import {getSnappedViewportsScale} from '../utils';
import {useCropOffset} from '../canvas/useCropOffset';
import {FinalTransform} from '../canvas/useFinalTransform';

export type GetResultTransformArgs = {
  context: MediaEditorContextValue;
  scaledWidth: number;
  scaledHeight: number;
  imageWidth: number;
  imageHeight: number;
  cropOffset: ReturnType<typeof useCropOffset>;
};

export default function getResultTransform({
  context,
  scaledWidth,
  scaledHeight,
  imageWidth,
  imageHeight,
  cropOffset
}: GetResultTransformArgs): FinalTransform {
  const [canvasSize] = context.canvasSize;
  const [currentImageRatio] = context.currentImageRatio;
  const [translation] = context.translation;
  const [scale] = context.scale;
  const [rotation] = context.rotation;
  const [flip] = context.flip;

  const initialCanvasWidth = canvasSize()[0];
  const initialCanvasHeight = canvasSize()[1];

  const imageRatio = imageWidth / imageHeight;

  const canvasRatio = initialCanvasWidth / initialCanvasHeight;
  let snappedCanvasWidth = scaledWidth,
    snappedCanvasHeight = scaledHeight;
  if(scaledWidth / canvasRatio < scaledHeight) snappedCanvasWidth = scaledHeight * canvasRatio;
  else snappedCanvasHeight = scaledWidth / canvasRatio;

  let toCropScale = getSnappedViewportsScale(
    imageRatio,
    cropOffset().width,
    cropOffset().height,
    snappedCanvasWidth,
    snappedCanvasHeight
  );
  const fromCroppedScale =
    1 /
    getSnappedViewportsScale(
      currentImageRatio(),
      cropOffset().width,
      cropOffset().height,
      snappedCanvasWidth,
      snappedCanvasHeight
    );

  toCropScale *= fromCroppedScale;

  const snappedImageScale = Math.min(snappedCanvasWidth / imageWidth, snappedCanvasHeight / imageHeight);

  const cropTranslation = translation().map((x) => x * fromCroppedScale - x);

  return {
    flip: flip(),
    rotation: rotation(),
    scale: scale() * snappedImageScale * toCropScale,
    translation: [cropTranslation[0] + translation()[0], cropTranslation[1] + translation()[1]]
  };
}
