import _getConvenientPositioning from '@components/mediaEditor/canvas/getConvenientPositioning';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {NumberPair} from '@components/mediaEditor/types';
import {snapToViewport, withCurrentOwner} from '@components/mediaEditor/utils';
import SwipeHandler from '@components/swipeHandler';
import {animateValue} from '@helpers/animateValue';
import {lerp, lerpArray} from '@helpers/lerp';
import throttle from '@helpers/schedulers/throttle';
import {batch, createEffect, createMemo, createSignal, on, onCleanup, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';


const MAX_SCALE = 20;

export default function CropHandles() {
  const {editorState, mediaState, isEditingForAvatar, isEditingForumAvatar} = useMediaEditorContext();

  const isCropping = () => editorState.currentTab === 'crop';

  const cropOffset = useCropOffset();

  const [leftTop, setLeftTop] = createSignal([0, 0]);
  const [leftTopDiff, setLeftTopDiff] = createSignal([0, 0]);
  const [size, setSize] = createSignal([0, 0]);
  const [diff, setDiff] = createSignal([0, 0]);

  const getConvenientPositioning = withCurrentOwner(_getConvenientPositioning);

  const getNewLeftTopAndSize = () => {
    const [width, height] = snapToViewport(mediaState.currentImageRatio, cropOffset().width, cropOffset().height);

    return {
      leftTop: [
        cropOffset().left + (cropOffset().width - width) / 2,
        cropOffset().top + (cropOffset().height - height) / 2
      ],
      size: [width, height]
    };
  };

  createEffect(
    on(cropOffset, () => {
      const {leftTop, size} = getNewLeftTopAndSize();
      setLeftTop(leftTop);
      setSize(size);
    })
  );

  let cancelSizeAnimation: () => void;

  function resetSizeWithAnimation() {
    const initialDiff = diff();
    const initialLeftTopDiff = leftTopDiff();
    const initialLeftTop = leftTop();
    const initialSize = size();

    const targetDiff = [0, 0];
    const targetLeftTopDiff = [0, 0];
    const {leftTop: targetLeftTop, size: targetSize} = getNewLeftTopAndSize();

    cancelSizeAnimation?.();

    cancelSizeAnimation = animateValue(0, 1, 200, (progress) => {
      batch(() => {
        setDiff(lerpArray(initialDiff, targetDiff, progress) as NumberPair);
        setLeftTopDiff(lerpArray(initialLeftTopDiff, targetLeftTopDiff, progress) as NumberPair);
        setLeftTop(lerpArray(initialLeftTop, targetLeftTop, progress) as NumberPair);
        setSize(lerpArray(initialSize, targetSize, progress) as NumberPair);
      });
    });
  }

  function resetSize() {
    const {leftTop: targetLeftTop, size: targetSize} = getNewLeftTopAndSize();
    batch(() => {
      setLeftTop(targetLeftTop);
      setSize(targetSize);
    });
  }

  createEffect(
    on(() => mediaState.currentImageRatio, (_, prev) => {
      if(!prev) resetSize();
      else resetSizeWithAnimation();
    }, {
      defer: true
    })
  );

  onMount(() => {
    const multipliers = [
      {el: leftTopHandle, left: -1, top: -1},
      {el: rightTopHandle, left: 1, top: -1},
      {el: leftBottomHandle, left: -1, top: 1},
      {el: rightBottomHandle, left: 1, top: 1},

      {el: leftHandle, left: -1, top: 0},
      {el: topHandle, left: 0, top: -1},
      {el: rightHandle, left: 1, top: 0},
      {el: bottomHandle, left: 0, top: 1}
    ];

    let boundDiff: NumberPair;
    let initialScale: number;
    let initialTranslation: NumberPair;
    let firstTarget: EventTarget;

    const resizeSwipeHandlers = multipliers.map(({el, left, top}) => {
      return new SwipeHandler({
        element: el,
        setCursorTo: document.body,
        onStart() {
          initialScale = mediaState.scale;
          initialTranslation = mediaState.translation;
          editorState.isMoving = true;

          el.classList.add('media-editor__crop-handles-circle--anti-flicker');
        },
        onSwipe(xDiff, yDiff, e) {
          if(!firstTarget) firstTarget = e.target;
          if(firstTarget !== el) return;

          const fixed = editorState.fixedImageRatioKey;
          let ratio = mediaState.currentImageRatio;
          if(left < 0) {
            ratio = -ratio;
          }
          if(top < 0) {
            ratio = -ratio;
          }

          const [w, h] = size();
          const minW = Math.min(w, (cropOffset().width / MAX_SCALE) * Math.min(MAX_SCALE, initialScale));
          const minH = Math.min(h, (cropOffset().height / MAX_SCALE) * Math.min(MAX_SCALE, initialScale));
          xDiff = Math.max(xDiff * left, minW - w) * left;
          yDiff = Math.max(yDiff * top, minH - h) * top;

          if(fixed) {
            if(top === 0) {
              yDiff = xDiff / ratio;
            } else if(left === 0) {
              xDiff = yDiff * ratio;
            } else {
              const xd = xDiff;
              xDiff = (xDiff + yDiff * ratio) / 2;
              yDiff = (xd / ratio + yDiff) / 2;
            }
          }

          if(fixed && top === 0) {
            setDiff([left * xDiff, yDiff]);
          } else if(fixed && left === 0) {
            setDiff([xDiff, top * yDiff]);
          } else {
            setDiff([xDiff * left, yDiff * top]);
          }

          setLeftTopDiff([
            fixed && left === 0 ? -xDiff / 2 : Number(left < 0) * xDiff,
            fixed && top === 0 ? -yDiff / 2 : Number(top < 0) * yDiff
          ]);
          const {cropMinX, cropMaxX, cropMinY, cropMaxY, imageMinX, imageMaxX, imageMinY, imageMaxY} =
            getConvenientPositioning({
              scale: initialScale,
              rotation: mediaState.rotation,
              translation: initialTranslation,
              extendCrop: [
                [
                  fixed && left === 0 ? -xDiff / 2 : left === -1 ? xDiff : 0,
                  fixed && top === 0 ? yDiff / 2 : top === 1 ? yDiff : 0
                ],
                [
                  fixed && left === 0 ? xDiff / 2 : left === 1 ? xDiff : 0,
                  fixed && top === 0 ? -yDiff / 2 : top === -1 ? yDiff : 0
                ]
              ]
            });
          const halfImageWidth = (imageMaxX - imageMinX) / 2,
            halfImageHeight = (imageMaxY - imageMinY) / 2;
          const imageCenter = [imageMinX + halfImageWidth, imageMinY + halfImageHeight];

          let additionalScaleX = 1;
          let additionalScaleY = 1;

          if(imageMinX > cropMinX) additionalScaleX *= 1 + ((imageCenter[0] - cropMinX) / halfImageWidth - 1) / 2;
          if(imageMaxX < cropMaxX) additionalScaleX *= 1 + ((cropMaxX - imageCenter[0]) / halfImageWidth - 1) / 2;
          if(imageMinY > cropMinY) additionalScaleY *= 1 + ((imageCenter[1] - cropMinY) / halfImageHeight - 1) / 2;
          if(imageMaxY < cropMaxY) additionalScaleY *= 1 + ((cropMaxY - imageCenter[1]) / halfImageHeight - 1) / 2;

          const additionalScale = Math.max(additionalScaleX, additionalScaleY);
          if(additionalScale > 1) {
            mediaState.scale = initialScale * additionalScale;
          }

          let boundDiff = [0, 0];

          if(imageMinX > cropMinX) boundDiff[0] += imageMinX - cropMinX;
          if(imageMaxX < cropMaxX) boundDiff[0] += imageMaxX - cropMaxX;
          if(imageMinY > cropMinY) boundDiff[1] += imageMinY - cropMinY;
          if(imageMaxY < cropMaxY) boundDiff[1] += imageMaxY - cropMaxY;

          const r = [Math.sin(mediaState.rotation), Math.cos(mediaState.rotation)];

          boundDiff = [boundDiff[0] * r[1] - boundDiff[1] * r[0], boundDiff[1] * r[1] + boundDiff[0] * r[0]];

          mediaState.translation = [initialTranslation[0] - boundDiff[0] / 2, initialTranslation[1] - boundDiff[1] / 2];
        },
        onReset() {
          if(firstTarget !== el) return (firstTarget = undefined);
          firstTarget = undefined;

          const newWidth = size()[0] + diff()[0],
            newHeight = size()[1] + diff()[1];
          const newRatio = newWidth / newHeight;

          const upScale = Math.min(cropOffset().width / newWidth, cropOffset().height / newHeight);
          mediaState.currentImageRatio = newRatio;
          resetSizeWithAnimation();

          const initialScale = mediaState.scale;
          const initialTranslation = mediaState.translation;

          const targetScale = mediaState.scale * upScale;
          const targetTranslation = [
            upScale * (mediaState.translation[0] + -diff()[0] * left * 0.5),
            upScale * (mediaState.translation[1] + -diff()[1] * top * 0.5)
          ];

          animateValue(
            0,
            1,
            200,
            (progress) => {
              modifyMutable(mediaState, produce((state) => {
                state.scale = lerp(initialScale, targetScale, progress);
                state.translation = lerpArray(initialTranslation, targetTranslation, progress) as NumberPair;
              }));
            },
            {
              onEnd: () => editorState.isMoving = false
            }
          );

          el.classList.remove('media-editor__crop-handles-circle--anti-flicker');
        }
      });
    });

    const translationSwipeHandler = new SwipeHandler({
      element: cropArea,
      onStart() {
        initialTranslation = mediaState.translation;
        editorState.isMoving = true;
      },
      onSwipe(xDiff, yDiff, e) {
        if(!firstTarget) firstTarget = e.target;
        if(firstTarget !== cropArea) return;

        const {cropMinX, cropMaxX, cropMinY, cropMaxY, imageMinX, imageMaxX, imageMinY, imageMaxY} =
          getConvenientPositioning({
            scale: mediaState.scale,
            rotation: mediaState.rotation,
            translation: [initialTranslation[0] + xDiff, initialTranslation[1] + yDiff]
          });

        boundDiff = [0, 0];

        if(imageMinX > cropMinX) boundDiff[0] = imageMinX - cropMinX;
        if(imageMaxX < cropMaxX) boundDiff[0] = imageMaxX - cropMaxX;
        if(imageMinY > cropMinY) boundDiff[1] = imageMinY - cropMinY;
        if(imageMaxY < cropMaxY) boundDiff[1] = imageMaxY - cropMaxY;

        const r = [Math.sin(mediaState.rotation), Math.cos(mediaState.rotation)];

        boundDiff = [boundDiff[0] * r[1] - boundDiff[1] * r[0], boundDiff[1] * r[1] + boundDiff[0] * r[0]];

        const resistance = 4;
        mediaState.translation = [
          initialTranslation[0] + xDiff - (boundDiff[0] - boundDiff[0] / resistance),
          initialTranslation[1] + yDiff - (boundDiff[1] - boundDiff[1] / resistance)
        ]
        boundDiff = [boundDiff[0] / resistance, boundDiff[1] / resistance];
      },
      onReset() {
        if(firstTarget !== cropArea) return (firstTarget = undefined);
        firstTarget = undefined;

        const prevTranslation = mediaState.translation;
        animateValue(
          prevTranslation,
          [prevTranslation[0] - boundDiff[0], prevTranslation[1] - boundDiff[1]] as const,
          120,
          (value) => mediaState.translation = value,
          {
            onEnd: () => editorState.isMoving = false
          }
        );
      }
    });

    const wheelListener = (e: WheelEvent) => {
      if(!isCropping()) return;
      e.preventDefault();

      zoomBy(e.deltaY);
    };

    cropArea.addEventListener('wheel', wheelListener);

    onCleanup(() => {
      resizeSwipeHandlers.forEach((handler) => handler.removeListeners());
      translationSwipeHandler.removeListeners();
    });
  });

  const zoomBy = throttle((delta: number) => {
    let zoomFactor = delta < 0 ? 0.9 : 1.1;

    const {cropMinX, cropMaxX, cropMinY, cropMaxY, imageMinX, imageMaxX, imageMinY, imageMaxY} =
      getConvenientPositioning({
        scale: mediaState.scale * zoomFactor,
        rotation: mediaState.rotation,
        translation: mediaState.translation
      });

    const halfImageWidth = (imageMaxX - imageMinX) / 2,
      halfImageHeight = (imageMaxY - imageMinY) / 2;
    const imageCenter = [imageMinX + halfImageWidth, imageMinY + halfImageHeight];

    let additionalScale = 1;

    if(imageMinX > cropMinX) additionalScale = Math.max(additionalScale, (imageCenter[0] - cropMinX) / halfImageWidth);
    if(imageMaxX < cropMaxX) additionalScale = Math.max(additionalScale, (cropMaxX - imageCenter[0]) / halfImageWidth);
    if(imageMinY > cropMinY) additionalScale = Math.max(additionalScale, (imageCenter[1] - cropMinY) / halfImageHeight);
    if(imageMaxY < cropMaxY) additionalScale = Math.max(additionalScale, (cropMaxY - imageCenter[1]) / halfImageHeight);

    zoomFactor *= additionalScale;
    const targetScale = Math.min(MAX_SCALE, mediaState.scale * zoomFactor);
    zoomFactor = targetScale / mediaState.scale;

    modifyMutable(mediaState, produce((state) => {
      state.scale = targetScale;
      state.translation = [state.translation[0] * zoomFactor, state.translation[1] * zoomFactor];
    }));
  }, 20, true);

  const normalSpotlightPosition = createMemo(() => {
    const [w, h] = editorState.canvasSize ?? [0, 0];
    const [sw, sh] = snapToViewport(mediaState.currentImageRatio, w, h);

    return {
      left: (w - sw) / 2,
      top: (h - sh) / 2,
      width: sw,
      height: sh
    };
  });

  const cropSpotlightPosition = createMemo(() => ({
    left: leftTop()[0] + leftTopDiff()[0],
    top: leftTop()[1] + leftTopDiff()[1],
    width: size()[0] + diff()[0],
    height: size()[1] + diff()[1]
  }));

  const left = createMemo(() => lerp(normalSpotlightPosition().left, cropSpotlightPosition().left, editorState.cropTabAnimationProgress));
  const top = createMemo(() => lerp(normalSpotlightPosition().top, cropSpotlightPosition().top, editorState.cropTabAnimationProgress));
  const width = createMemo(() => lerp(normalSpotlightPosition().width, cropSpotlightPosition().width, editorState.cropTabAnimationProgress));
  const height = createMemo(() => lerp(normalSpotlightPosition().height, cropSpotlightPosition().height, editorState.cropTabAnimationProgress));

  const spotlightId = `spotlight-${Math.random().toString(36).substring(2)}`;

  const cropSpotlightRoundness = createMemo(() => {
    if(isEditingForAvatar) {
      return Math.min(width(), height()) / (isEditingForumAvatar ? 3 : 2);
    }
    return 0;
  });

  let cropArea: HTMLDivElement;

  let leftTopHandle: HTMLDivElement;
  let rightTopHandle: HTMLDivElement;
  let leftBottomHandle: HTMLDivElement;
  let rightBottomHandle: HTMLDivElement;

  let leftHandle: HTMLDivElement;
  let topHandle: HTMLDivElement;
  let rightHandle: HTMLDivElement;
  let bottomHandle: HTMLDivElement;

  return (
    <>
      <SpotlightMask
        id={spotlightId}
        left={left()}
        top={top()}
        width={width()}
        height={height()}
        roundness={cropSpotlightRoundness()}
      />

      <div
        ref={cropArea}
        class="media-editor__crop-handles"
        classList={{
          'media-editor__crop-handles--hidden': !isCropping()
        }}
        style={{
          left: left() + 'px',
          top: top() + 'px',
          width: width() + 'px',
          height: height() + 'px'
        }}
      >
        <div class="media-editor__crop-handles-line-h" style={{top: '33%'}} />
        <div class="media-editor__crop-handles-line-h" style={{top: '66%'}} />
        <div class="media-editor__crop-handles-line-v" style={{left: '33%'}} />
        <div class="media-editor__crop-handles-line-v" style={{left: '66%'}} />

        <div ref={leftHandle} class="media-editor__crop-handles-side media-editor__crop-handles-side--w" />
        <div ref={topHandle} class="media-editor__crop-handles-side media-editor__crop-handles-side--n" />
        <div ref={rightHandle} class="media-editor__crop-handles-side media-editor__crop-handles-side--e" />
        <div ref={bottomHandle} class="media-editor__crop-handles-side media-editor__crop-handles-side--s" />

        <div ref={leftTopHandle} class="media-editor__crop-handles-circle media-editor__crop-handles-circle--nw" />
        <div ref={rightTopHandle} class="media-editor__crop-handles-circle media-editor__crop-handles-circle--ne" />
        <div ref={leftBottomHandle} class="media-editor__crop-handles-circle media-editor__crop-handles-circle--sw" />
        <div
          ref={rightBottomHandle}
          class="media-editor__crop-handles-circle media-editor__crop-handles-circle--se"
        />
      </div>
    </>
  );
}

const SpotlightMask = (props: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  roundness?: number;
}) => {
  const {editorState} = useMediaEditorContext();

  return (
    <>
      <div
        class="media-editor__spotlight-background"
        style={{
          mask: `url(#${props.id})`
        }}
      />
      <svg class="media-editor__spotlight-mask-svg" width="0" height="0">
        <mask id={props.id}>
          <rect x="0" y="0" width={editorState.canvasSize?.[0] + 1} height={editorState.canvasSize?.[1] + 1} fill="white"/>
          <rect
            x={props.left}
            y={props.top}
            width={props.width}
            height={props.height}
            rx={props.roundness}
            fill="black"
          />
        </mask>
      </svg>
    </>
  );
};
