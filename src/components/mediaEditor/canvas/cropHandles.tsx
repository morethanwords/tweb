import {batch, createEffect, createSignal, on, onCleanup, onMount, useContext} from 'solid-js';

import SwipeHandler from '../../swipeHandler';

import {animateValue, lerp, lerpArray, snapToViewport} from '../utils';
import MediaEditorContext from '../context';
import {withCurrentOwner} from '../utils';

import {useCropOffset} from './useCropOffset';
import _getConvenientPositioning from './getConvenientPositioning';

const MAX_SCALE = 20;

export default function CropHandles() {
  const context = useContext(MediaEditorContext);
  const [canvasSize] = context.canvasSize;
  const [currentTab] = context.currentTab;
  const isCroping = () => currentTab() === 'crop';
  const [currentImageRatio, setCurrentImageRatio] = context.currentImageRatio;
  const [scale, setScale] = context.scale;
  const [rotation] = context.rotation;
  const [translation, setTranslation] = context.translation;
  const [fixedImageRatioKey] = context.fixedImageRatioKey;
  const [, setIsMoving] = context.isMoving;

  const cropOffset = useCropOffset();

  const [leftTop, setLeftTop] = createSignal([0, 0]);
  const [leftTopDiff, setLeftTopDiff] = createSignal([0, 0]);
  const [size, setSize] = createSignal([0, 0]);
  const [diff, setDiff] = createSignal([0, 0]);

  const getConvenientPositioning = withCurrentOwner(_getConvenientPositioning);

  const getNewLeftTopAndSize = () => {
    const [width, height] = snapToViewport(currentImageRatio(), cropOffset().width, cropOffset().height);

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
        setDiff(lerpArray(initialDiff, targetDiff, progress) as [number, number]);
        setLeftTopDiff(lerpArray(initialLeftTopDiff, targetLeftTopDiff, progress) as [number, number]);
        setLeftTop(lerpArray(initialLeftTop, targetLeftTop, progress) as [number, number]);
        setSize(lerpArray(initialSize, targetSize, progress) as [number, number]);
      });
    });
  }

  createEffect(
    on(currentImageRatio, () => {
      resetSizeWithAnimation();
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

    let boundDiff: [number, number];
    let initialScale: number;
    let initialTranslation: [number, number];
    let firstTarget: EventTarget;

    const resizeSwipeHandlers = multipliers.map(({el, left, top}) => {
      return new SwipeHandler({
        element: el,
        setCursorTo: document.body,
        onStart() {
          initialScale = scale();
          initialTranslation = translation();
          setIsMoving(true);
          el.classList.add('media-editor__crop-handles-circle--anti-flicker');
        },
        onSwipe(xDiff, yDiff, e) {
          if(!firstTarget) firstTarget = e.target;
          if(firstTarget !== el) return;

          const fixed = fixedImageRatioKey();
          let ratio = currentImageRatio();
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
              rotation: rotation(),
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
            setScale(initialScale * additionalScale);
          }

          let boundDiff = [0, 0];

          if(imageMinX > cropMinX) boundDiff[0] += imageMinX - cropMinX;
          if(imageMaxX < cropMaxX) boundDiff[0] += imageMaxX - cropMaxX;
          if(imageMinY > cropMinY) boundDiff[1] += imageMinY - cropMinY;
          if(imageMaxY < cropMaxY) boundDiff[1] += imageMaxY - cropMaxY;

          const r = [Math.sin(rotation()), Math.cos(rotation())];

          boundDiff = [boundDiff[0] * r[1] - boundDiff[1] * r[0], boundDiff[1] * r[1] + boundDiff[0] * r[0]];

          setTranslation([initialTranslation[0] - boundDiff[0] / 2, initialTranslation[1] - boundDiff[1] / 2]);
        },
        onReset() {
          if(firstTarget !== el) return (firstTarget = undefined);
          firstTarget = undefined;

          const newWidth = size()[0] + diff()[0],
            newHeight = size()[1] + diff()[1];
          const newRatio = newWidth / newHeight;

          const upScale = Math.min(cropOffset().width / newWidth, cropOffset().height / newHeight);
          setCurrentImageRatio(newRatio);
          resetSizeWithAnimation();

          const initialScale = scale();
          const initialTranslation = translation();

          const targetScale = scale() * upScale;
          const targetTranslation = [
            upScale * (translation()[0] + -diff()[0] * left * 0.5),
            upScale * (translation()[1] + -diff()[1] * top * 0.5)
          ];

          animateValue(
            0,
            1,
            200,
            (progress) => {
              batch(() => {
                setScale(lerp(initialScale, targetScale, progress));
                setTranslation(lerpArray(initialTranslation, targetTranslation, progress) as [number, number]);
              });
            },
            {
              onEnd: () => setIsMoving(false)
            }
          );

          el.classList.remove('media-editor__crop-handles-circle--anti-flicker');
        }
      });
    });

    const translationSwipeHandler = new SwipeHandler({
      element: cropArea,
      onStart() {
        initialTranslation = translation();
        setIsMoving(true);
      },
      onSwipe(xDiff, yDiff, e) {
        if(!firstTarget) firstTarget = e.target;
        if(firstTarget !== cropArea) return;

        const {cropMinX, cropMaxX, cropMinY, cropMaxY, imageMinX, imageMaxX, imageMinY, imageMaxY} =
          getConvenientPositioning({
            scale: scale(),
            rotation: rotation(),
            translation: [initialTranslation[0] + xDiff, initialTranslation[1] + yDiff]
          });

        boundDiff = [0, 0];

        if(imageMinX > cropMinX) boundDiff[0] = imageMinX - cropMinX;
        if(imageMaxX < cropMaxX) boundDiff[0] = imageMaxX - cropMaxX;
        if(imageMinY > cropMinY) boundDiff[1] = imageMinY - cropMinY;
        if(imageMaxY < cropMaxY) boundDiff[1] = imageMaxY - cropMaxY;

        const r = [Math.sin(rotation()), Math.cos(rotation())];

        boundDiff = [boundDiff[0] * r[1] - boundDiff[1] * r[0], boundDiff[1] * r[1] + boundDiff[0] * r[0]];

        const resistance = 4;
        setTranslation([
          initialTranslation[0] + xDiff - (boundDiff[0] - boundDiff[0] / resistance),
          initialTranslation[1] + yDiff - (boundDiff[1] - boundDiff[1] / resistance)
        ]);
        boundDiff = [boundDiff[0] / resistance, boundDiff[1] / resistance];
      },
      onReset() {
        if(firstTarget !== cropArea) return (firstTarget = undefined);
        firstTarget = undefined;

        const prevTranslation = translation();
        animateValue(
          prevTranslation,
          [prevTranslation[0] - boundDiff[0], prevTranslation[1] - boundDiff[1]],
          120,
          setTranslation,
          {
            onEnd: () => setIsMoving(false)
          }
        );
      }
    });

    onCleanup(() => {
      resizeSwipeHandlers.forEach((handler) => handler.removeListeners());
      translationSwipeHandler.removeListeners();
    });
  });

  const left = () => leftTop()[0] + leftTopDiff()[0];
  const top = () => leftTop()[1] + leftTopDiff()[1];
  const width = () => size()[0] + diff()[0];
  const height = () => size()[1] + diff()[1];
  const right = () => left() + width();
  const bottom = () => top() + height();

  const croppedSizeFull = () => {
    const [cw, ch] = canvasSize();
    let [w, h] = [cw, ch];
    const ratio = currentImageRatio();

    if(w / ratio > h) w = h * ratio;
    else h = w / ratio;

    return [(cw - w) / 2, (ch - h) / 2];
  };

  let cropArea: HTMLDivElement;

  let leftTopHandle: HTMLDivElement;
  let rightTopHandle: HTMLDivElement;
  let leftBottomHandle: HTMLDivElement;
  let rightBottomHandle: HTMLDivElement;

  let leftHandle: HTMLDivElement;
  let topHandle: HTMLDivElement;
  let rightHandle: HTMLDivElement;
  let bottomHandle: HTMLDivElement;

  const coverAnimatedStyle = () =>
    ({
      'transition': 'opacity 0.2s',
      'transition-timing-function': isCroping() ? 'ease-in' : 'ease-out',
      'pointer-events': isCroping() ? 'none' : undefined,
      'opacity': isCroping() ? 0 : 1
    }) as const;

  const controlsAnimatedStyle = () =>
    ({
      'transition': 'transform 0.2s, opacity 0.2s',
      'transition-timing-function': isCroping() ? 'ease-out' : 'ease-in',
      'pointer-events': isCroping() ? undefined : 'none',
      'opacity': isCroping() ? 1 : 0,
      'transform': isCroping() ? undefined : 'scale(1.05)'
    }) as const;

  return (
    <>
      <div
        style={{
          background: 'black',
          position: 'absolute',
          left: '0px',
          top: '0px',
          width: '100%',
          height: croppedSizeFull()[1] + 'px',
          ...coverAnimatedStyle()
        }}
      ></div>
      <div
        style={{
          background: 'black',
          position: 'absolute',
          left: '0px',
          bottom: '0px',
          width: '100%',
          height: croppedSizeFull()[1] + 'px',
          ...coverAnimatedStyle()
        }}
      ></div>
      <div
        style={{
          background: 'black',
          position: 'absolute',
          left: '0px',
          top: '0px',
          height: '100%',
          width: croppedSizeFull()[0] + 'px',
          ...coverAnimatedStyle()
        }}
      ></div>
      <div
        style={{
          background: 'black',
          position: 'absolute',
          right: '0px',
          top: '0px',
          height: '100%',
          width: croppedSizeFull()[0] + 'px',
          ...coverAnimatedStyle()
        }}
      ></div>
      <div
        style={{
          position: 'absolute',
          right: '0px',
          top: '0px',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
          ...controlsAnimatedStyle()
        }}
      >
        <div
          class="media-editor__crop-handles-backdrop"
          style={{
            ['clip-path']: `polygon(
              0 0, 0 100%,
              ${left()}px 100%, ${left()}px ${top()}px, ${right()}px ${top()}px,
              ${right()}px ${bottom()}px, ${left()}px ${bottom()}px, ${left()}px 100%,
              100% 100%, 100% 0%
            )`
          }}
        />
        <div
          ref={cropArea}
          class="media-editor__crop-handles"
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
      </div>
    </>
  );
}
