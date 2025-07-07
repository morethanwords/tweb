import {batch, createEffect, createMemo, createSignal, on, onCleanup} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';

import {animateValue, getSnappedViewportsScale, lerp, lerpArray} from '../utils';
import {useMediaEditorContext} from '../context';
import {NumberPair} from '../types';

import {useCropOffset} from './useCropOffset';

export type FinalTransform = {
  flip: NumberPair;
  translation: NumberPair;
  rotation: number;
  scale: number;
};

export default function useFinalTransform() {
  const {editorState, mediaState} = useMediaEditorContext();

  const cropOffset = useCropOffset();

  const isCropping = createMemo(() => editorState.currentTab === 'crop');

  const [cropTabAnimationProgress, setCropTabAnimationProgress] = createSignal(0);

  let isFirstEffect = true;
  createEffect(
    on(isCropping, () => {
      if(isFirstEffect) {
        isFirstEffect = false;
        return;
      }

      editorState.isMoving = true;

      const cancel = animateValue(cropTabAnimationProgress(), isCropping() ? 1 : 0, 200, setCropTabAnimationProgress, {
        onEnd: () => editorState.isMoving = false
      });

      onCleanup(cancel);
    })
  );

  const [prevCanvasSize, setPrevCanvasSize] = createSignal<NumberPair>();
  const [prevCropTranslation, setPrevCropTranslation] = createSignal<NumberPair>();
  const [prevAdditionalScale, setPrevAdditionalScale] = createSignal<number>();

  const additionalImageScales = createMemo(() => {
    const payload = editorState.renderingPayload;
    if(!payload || !editorState.canvasSize) return;

    const [w, h] = editorState.canvasSize;

    const imageRatio = payload.media.width / payload.media.height;

    const toCropScale = getSnappedViewportsScale(imageRatio, cropOffset().width, cropOffset().height, w, h);
    const fromCroppedScale =
      1 / getSnappedViewportsScale(mediaState.currentImageRatio, cropOffset().width, cropOffset().height, w, h);

    const snappedImageScale = Math.min(w / payload.media.width, h / payload.media.height);

    return {
      toCropScale,
      fromCroppedScale,
      snappedImageScale
    };
  });

  const cropTrnsl = createMemo(() => {
    if(!editorState.canvasSize || !additionalImageScales()) return;
    const {fromCroppedScale} = additionalImageScales();

    return mediaState.translation.map((x) => x * fromCroppedScale - x) as NumberPair;
  });

  const cropTranslation = createMemo(() => {
    if(!editorState.canvasSize || !additionalImageScales()) return;
    const [, h] = editorState.canvasSize;
    const {fromCroppedScale} = additionalImageScales();

    return lerpArray(
      mediaState.translation.map((x) => x * fromCroppedScale - x),
      [0, cropOffset().left + cropOffset().height / 2 - h / 2],
      cropTabAnimationProgress()
    ) as NumberPair;
  });

  let prevScale: number;
  let prevTranslation: NumberPair;

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
    on(() => mediaState.currentImageRatio, () => {
      updatePrevValues();
    })
  );

  createEffect(
    on(() => editorState.canvasSize, () => {
      if(!editorState.canvasSize || !additionalImageScales()) return;
      const prevSize = editorState.canvasSize;
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
      const currentSize = editorState.canvasSize;
      const {toCropScale, fromCroppedScale, snappedImageScale} = additionalImageScales();
      const currentAdditionalScale = toCropScale * snappedImageScale * fromCroppedScale;

      const scaleToChange = getSnappedViewportsScale(
        mediaState.currentImageRatio,
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

      modifyMutable(mediaState, produce((state) => {
        state.scale = state.scale * totalScale,
        state.translation = state.translation.map((v) => v * totalScale) as NumberPair
      }));
    })
  );

  createEffect(() => {
    const payload = editorState.renderingPayload;
    if(!payload) return;

    let {fromCroppedScale, toCropScale, snappedImageScale} = additionalImageScales();

    toCropScale *= lerp(fromCroppedScale, 1, cropTabAnimationProgress());

    // const cropTranslation = lerpArray(
    //   translation().map((x) => x * fromCroppedScale - x),
    //   [0, cropOffset().left + cropOffset().height / 2 - h / 2],
    //   cropTabAnimationProgress()
    // );
    // console.log('cropTranslation', cropTranslation)

    modifyMutable(editorState.finalTransform, produce(t => {
      t.flip = mediaState.flip,
      t.rotation = mediaState.rotation,
      t.scale = mediaState.scale * editorState.pixelRatio * snappedImageScale * toCropScale;
      t.translation = [cropTranslation()[0] + mediaState.translation[0], cropTranslation()[1] + mediaState.translation[1]].map(
        (v) => v * editorState.pixelRatio
      ) as NumberPair
    }));
  });
}
