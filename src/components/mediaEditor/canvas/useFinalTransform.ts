import {batch, createEffect, createMemo, createSignal, on, onCleanup, useContext} from 'solid-js';

import MediaEditorContext from '../context';
import {animateValue, getSnappedViewportsScale, lerp, lerpArray, snapToViewport} from '../utils';

import {useCropOffset} from './useCropOffset';

export type FinalTransform = {
  flip: [number, number];
  translation: [number, number];
  rotation: number;
  scale: number;
};

export default function useFinalTransform() {
  const context = useContext(MediaEditorContext);
  const [canvasSize] = context.canvasSize;
  const [currentTab] = context.currentTab;
  const [currentImageRatio] = context.currentImageRatio;
  const [translation, setTranslation] = context.translation;
  const [scale, setScale] = context.scale;
  const [rotation] = context.rotation;
  const [flip] = context.flip;
  const [renderingPayload] = context.renderingPayload;
  const [, setFinalTransform] = context.finalTransform;
  const [, setIsMoving] = context.isMoving;

  const cropOffset = useCropOffset();

  const isCroping = createMemo(() => currentTab() === 'crop');

  const [cropTabAnimationProgress, setCropTabAnimationProgress] = createSignal(0);

  let isFirstEffect = true;
  createEffect(
    on(isCroping, () => {
      if(isFirstEffect) {
        isFirstEffect = false;
        return;
      }

      setIsMoving(true);
      const cancel = animateValue(cropTabAnimationProgress(), isCroping() ? 1 : 0, 200, setCropTabAnimationProgress, {
        onEnd: () => setIsMoving(false)
      });

      onCleanup(cancel);
    })
  );

  const [prevCanvasSize, setPrevCanvasSize] = createSignal<[number, number]>();
  const [prevCropTranslation, setPrevCropTranslation] = createSignal<[number, number]>();
  const [prevAdditionalScale, setPrevAdditionalScale] = createSignal<number>();

  const additionalImageScales = createMemo(() => {
    const payload = renderingPayload();
    if(!payload) return;

    const [w, h] = canvasSize();

    const imageRatio = payload.image.width / payload.image.height;

    const toCropScale = getSnappedViewportsScale(imageRatio, cropOffset().width, cropOffset().height, w, h);
    const fromCroppedScale =
      1 / getSnappedViewportsScale(currentImageRatio(), cropOffset().width, cropOffset().height, w, h);

    const snappedImageScale = Math.min(w / payload.image.width, h / payload.image.height);

    return {
      toCropScale,
      fromCroppedScale,
      snappedImageScale
    };
  });

  const cropTrnsl = createMemo(() => {
    if(!canvasSize() || !additionalImageScales()) return;
    const {fromCroppedScale} = additionalImageScales();

    return translation().map((x) => x * fromCroppedScale - x) as [number, number];
  });

  const cropTranslation = createMemo(() => {
    if(!canvasSize() || !additionalImageScales()) return;
    const [, h] = canvasSize();
    const {fromCroppedScale} = additionalImageScales();

    return lerpArray(
      translation().map((x) => x * fromCroppedScale - x),
      [0, cropOffset().left + cropOffset().height / 2 - h / 2],
      cropTabAnimationProgress()
    ) as [number, number];
  });

  let prevScale: number;
  let prevTranslation: [number, number];

  function updatePrevValues() {
    if(!additionalImageScales() || !cropTrnsl()) return;
    const {toCropScale, fromCroppedScale, snappedImageScale} = additionalImageScales();
    prevScale = toCropScale * snappedImageScale * fromCroppedScale;
    prevTranslation = cropTrnsl();
  }

  createEffect(
    on(cropTabAnimationProgress, () => {
      if([0, 1].includes(cropTabAnimationProgress())) updatePrevValues();
    })
  );
  createEffect(
    on(currentImageRatio, () => {
      updatePrevValues();
    })
  );

  createEffect(
    on(canvasSize, () => {
      if(!canvasSize() || !additionalImageScales()) return;
      const prevSize = canvasSize();
      const {toCropScale, fromCroppedScale, snappedImageScale} = additionalImageScales();
      prevScale = toCropScale * snappedImageScale * fromCroppedScale;
      prevTranslation = cropTrnsl();

      onCleanup(() => {
        batch(() => {
          setPrevCanvasSize(prevSize);
          setPrevAdditionalScale(prevScale);
          setPrevCropTranslation(prevTranslation);
        });
      });
    })
  );

  createEffect(
    on(prevCanvasSize, () => {
      if(!prevCanvasSize || !prevAdditionalScale()) return;
      const currentSize = canvasSize();
      const {toCropScale, fromCroppedScale, snappedImageScale} = additionalImageScales();
      const currentAdditionalScale = toCropScale * snappedImageScale * fromCroppedScale;

      const scaleToChange = getSnappedViewportsScale(
        currentImageRatio(),
        currentSize[0],
        currentSize[1],
        prevCanvasSize()[0],
        prevCanvasSize()[1]
      );
      const counterScale = prevAdditionalScale() / currentAdditionalScale;

      const totalScale = scaleToChange * counterScale;

      // const translationDiff = [
      //   prevCropTranslation()[0] - cropTrnsl()[0],
      //   prevCropTranslation()[1] - cropTrnsl()[1]
      // ];
      // console.log('translationDiff', translationDiff)

      batch(() => {
        setScale((prev) => prev * totalScale);
        setTranslation((prev) => {
          prev = prev.map((v) => v * totalScale) as [number, number];
          // return [prev[0] + translationDiff[0]/*  * 0 */, prev[1] + translationDiff[1]/*  * 0 */];
          return prev;
        });
      });
    })
  );
  (window as any).setScale = setScale;
  (window as any).canvasSize = canvasSize;

  createEffect(() => {
    const payload = renderingPayload();
    if(!payload) return;

    let {fromCroppedScale, toCropScale, snappedImageScale} = additionalImageScales();

    toCropScale *= lerp(fromCroppedScale, 1, cropTabAnimationProgress());

    // const cropTranslation = lerpArray(
    //   translation().map((x) => x * fromCroppedScale - x),
    //   [0, cropOffset().left + cropOffset().height / 2 - h / 2],
    //   cropTabAnimationProgress()
    // );
    // console.log('cropTranslation', cropTranslation)

    setFinalTransform({
      flip: flip(),
      rotation: rotation(),
      scale: scale() * context.pixelRatio * snappedImageScale * toCropScale,
      translation: [cropTranslation()[0] + translation()[0], cropTranslation()[1] + translation()[1]].map(
        (v) => v * context.pixelRatio
      ) as [number, number]
    });
  });
}
