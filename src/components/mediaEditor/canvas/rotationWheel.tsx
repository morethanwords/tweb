import {batch, createEffect, createSignal, on, onCleanup, onMount} from 'solid-js';
import {modifyMutable, produce} from 'solid-js/store';

import clamp from '../../../helpers/number/clamp';

import {ButtonIconTsx} from '../../buttonIconTsx';
import SwipeHandler from '../../swipeHandler';

import {animateValue, lerp, withCurrentOwner} from '../utils';
import {useMediaEditorContext} from '../context';
import {NumberPair} from '../types';

import {animateToNewRotationOrRatio} from './animateToNewRotationOrRatio';
import getConvenientPositioning from './getConvenientPositioning';

const DEGREE_DIST_PX = 42;
const DEGREE_STEP = 15;
const TOTAL_DEGREES_SIDE = 90;
const MAX_DEGREES_DIST_PX = (TOTAL_DEGREES_SIDE / DEGREE_STEP) * DEGREE_DIST_PX;
const SNAP_DIST_PX = 40;

function rotationFromMove(amount: number) {
  return ((amount / DEGREE_DIST_PX) * DEGREE_STEP * Math.PI) / 180;
}

export default function RotationWheel() {
  const {editorState, mediaState, actions} = useMediaEditorContext();

  const isCropping = () => editorState.currentTab === 'crop';

  const [moved, setMoved] = createSignal(0);
  const [movedDiff, setMovedDiff] = createSignal(0);

  let swiperEl: HTMLDivElement;

  onMount(() => {
    const snappedRotation = (Math.round((mediaState.rotation / Math.PI) * 2) * Math.PI) / 2;
    setMoved((((snappedRotation - mediaState.rotation) * 180) / Math.PI / DEGREE_STEP) * DEGREE_DIST_PX);
    prevRotation = rotationFromMove(moved());

    let currentDiff: number;
    let targetDiff: number;
    let prevShouldSnap = getShouldSnap();
    let isAnimating = false;
    let isSnapped = false;
    let cancelAnimation: () => void;
    let timeoutId: number;

    function getShouldSnap() {
      return Math.abs(moved() + currentDiff || 0) < SNAP_DIST_PX
    }

    function handleDiffChange(diff: number) {
      setMovedDiff(diff);
      onSwipe();
    }

    function removeSnapAfterTimeout() {
      timeoutId = window.setTimeout(() => {
        isSnapped = false;
        isAnimating = true;

        const initialDiff = movedDiff();
        cancelAnimation?.();
        cancelAnimation = animateValue(0, 1, 200, (progress) => {
          handleDiffChange(lerp(initialDiff, currentDiff, progress));
        }, {
          onEnd: () => {
            isAnimating = false
          }
        });
      }, 750);
    }

    const swipeHandler = new SwipeHandler({
      element: swiperEl,
      onStart() {
        initialScale = mediaState.scale;
        currentDiff = movedDiff();
        targetDiff = currentDiff;
        isAnimating = false;
        isSnapped = false;
        prevShouldSnap = getShouldSnap();
        editorState.isMoving = true;
      },
      onSwipe(xDiff) {
        targetDiff = currentDiff = clamp(moved() + xDiff, -MAX_DEGREES_DIST_PX, MAX_DEGREES_DIST_PX) - moved();
        const shouldSnap = getShouldSnap();
        if(shouldSnap) targetDiff = -moved();

        if(prevShouldSnap !== shouldSnap) {
          window.clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            const shouldSnapAfterTimeout = getShouldSnap();
            if(shouldSnapAfterTimeout !== shouldSnap) return;
            isAnimating = true;
            const initialDiff = movedDiff();
            cancelAnimation?.();
            cancelAnimation = animateValue(0, 1, 200, (progress) => {
              handleDiffChange(lerp(initialDiff, targetDiff, progress));
            }, {
              onEnd: () => {
                isAnimating = false;
                isSnapped = getShouldSnap();

                if(!isSnapped) return;
                removeSnapAfterTimeout();
              }
            });
          }, 200);
        }

        prevShouldSnap = shouldSnap;

        if(isAnimating || isSnapped) return;
        handleDiffChange(currentDiff);
      },
      onReset() {
        let newMoved = moved() + movedDiff();
        if(Math.abs(newMoved) === MAX_DEGREES_DIST_PX) {
          newMoved = 0;
          prevRotation = 0;
          prevShouldSnap = false;
          isAnimating = false;
        }
        cancelAnimation?.();
        window.clearTimeout(timeoutId);
        batch(() => {
          setMoved(newMoved);
          setMovedDiff(0);
          editorState.isMoving = false;
          mediaState.rotation = mediaState.rotation % (Math.PI * 2)
        });
      }
    });

    onCleanup(() => {
      swipeHandler.removeListeners();
    });
  });

  let prevRotation = 0;
  let initialScale = 0;

  const onSwipe = withCurrentOwner(() => {
    const rotationFromSwiper = rotationFromMove(moved() + movedDiff());
    const rotationDiff = rotationFromSwiper - prevRotation;

    const targetRotation = mediaState.rotation - rotationDiff;

    const r = [Math.cos(rotationDiff), Math.sin(rotationDiff)];

    const targetTranslation: NumberPair = [
      mediaState.translation[0] * r[0] + mediaState.translation[1] * r[1],
      mediaState.translation[1] * r[0] - mediaState.translation[0] * r[1]
    ];

    prevRotation = rotationFromSwiper;

    if(!initialScale) return;
    const {cropMinX, cropMaxX, cropMinY, cropMaxY, imageMinX, imageMaxX, imageMinY, imageMaxY} =
      getConvenientPositioning({
        scale: initialScale,
        rotation: targetRotation,
        translation: targetTranslation
      });

    const halfImageWidth = (imageMaxX - imageMinX) / 2,
      halfImageHeight = (imageMaxY - imageMinY) / 2;
    const imageCenter = [imageMinX + halfImageWidth, imageMinY + halfImageHeight];

    let additionalScale = 1;

    if(imageMinX > cropMinX) additionalScale = Math.max((imageCenter[0] - cropMinX) / halfImageWidth, additionalScale);
    if(imageMaxX < cropMaxX) additionalScale = Math.max((cropMaxX - imageCenter[0]) / halfImageWidth, additionalScale);
    if(imageMinY > cropMinY)
      additionalScale = Math.max((imageCenter[1] - cropMinY) / halfImageHeight, additionalScale);
    if(imageMaxY < cropMaxY)
      additionalScale = Math.max((cropMaxY - imageCenter[1]) / halfImageHeight, additionalScale);


    modifyMutable(mediaState, produce(s => {
      s.rotation = targetRotation;
      s.translation = targetTranslation;
      if(additionalScale > 1) {
        s.scale = initialScale * additionalScale;
      }
    }));
  });

  function resetWheelWithAnimation() {
    prevRotation = 0;
    animateValue([moved(), movedDiff()], [0, 0], 200, (values) => {
      batch(() => {
        setMoved(values[0]);
        setMovedDiff(values[1]);
      });
    });
  }

  actions.resetRotationWheel = () => resetWheelWithAnimation();
  onCleanup(() => {
    actions.resetRotationWheel = () => {}
  });

  let isFirstEffect = true;
  createEffect(
    on(() => editorState.fixedImageRatioKey, () => {
      if(isFirstEffect) {
        isFirstEffect = false;
        return;
      }
      resetWheelWithAnimation();
    })
  );

  function rotateLeft() {
    const newRotation = (Math.round((mediaState.rotation / Math.PI) * 2) * Math.PI) / 2 - Math.PI / 2;

    animateToNewRotationOrRatio(newRotation);

    resetWheelWithAnimation();
  }

  function flipImage() {
    editorState.isMoving = true;
    const isReversedRatio = Math.abs(Math.round((mediaState.rotation / Math.PI) * 2)) & 1;
    const snapTo1 = (value: number) => value < 0 ? -1 : 1;
    const targetFlip: NumberPair = [
      snapTo1(mediaState.flip[0]) * (isReversedRatio ? 1 : -1),
      snapTo1(mediaState.flip[1]) * (isReversedRatio ? -1 : 1)
    ];
    animateValue(mediaState.flip, targetFlip, 200, (value) => void (mediaState.flip = value), {
      onEnd: () => void (editorState.isMoving = false)
    });
  }

  const value = () =>
    ((-(moved() + movedDiff()) / DEGREE_DIST_PX) * DEGREE_STEP)
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/^-0$/, '0');

  return (
    <div class="media-editor__rotation-wheel" style={{display: isCropping() ? undefined : 'none'}}>
      <ButtonIconTsx onClick={withCurrentOwner(rotateLeft)} class="media-editor__rotation-wheel-button" icon="rotate" />
      <div class="media-editor__rotation-wheel-swiper-wrapper">
        <div
          ref={swiperEl}
          style={{['--moved']: moved() + movedDiff() + 'px'}}
          class="media-editor__rotation-wheel-swiper"
        >
          <div class="media-editor__rotation-wheel-labels">
            {new Array(13).fill(null).map((_, i) => (
              <div class="media-editor__rotation-wheel-label">
                <div class="media-editor__rotation-wheel-label-number">{i * 15 - 90}</div>
              </div>
            ))}
          </div>
          <div class="media-editor__rotation-wheel-dots">
            {new Array(97).fill(null).map(() => (
              <div class="media-editor__rotation-wheel-dot" />
            ))}
          </div>
        </div>
      </div>
      <div class="media-editor__rotation-wheel-value">
        <div class="media-editor__rotation-wheel-value-number">{value()}</div>
      </div>
      <ArrowUp />
      <ButtonIconTsx onClick={flipImage} class="media-editor__rotation-wheel-button" icon="flip_image_horizontal" />
    </div>
  );
}

function ArrowUp() {
  return (
    <svg
      class="media-editor__rotation-wheel-arrow"
      width="6"
      height="4"
      viewBox="0 0 6 4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.29289 0.707106L0.28033 2.71967C-0.192143 3.19214 0.142482 4 0.81066 4H5.18934C5.85752 4 6.19214 3.19214 5.71967 2.71967L3.70711 0.707107C3.31658 0.316583 2.68342 0.316582 2.29289 0.707106Z"
        fill="white"
      />
    </svg>
  );
}
