import {MediaEditorProps, openMediaEditor} from '@components/mediaEditor/mediaEditor';
import {NumberPair} from '@components/mediaEditor/types';
import {snapToViewport} from '@components/mediaEditor/utils';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';


type SpawnImageCanvasArgs = {
  source: CanvasImageSource;
  rect: LocalDOMRect;
  animatedCanvasSize: NumberPair;
};

type LocalDOMRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type OpenMediaEditorFromMediaArgs = Omit<MediaEditorProps, 'onCanvasReady' | 'onImageRendered'> & SpawnImageCanvasArgs;
type OpenMediaEditorFromMediaNoAnimationArgs = Omit<MediaEditorProps, 'onCanvasReady' | 'onImageRendered'> & Omit<SpawnImageCanvasArgs, 'rect'>;

export function openMediaEditorFromMedia({
  source,
  rect,
  animatedCanvasSize: size,
  ...rest
}: OpenMediaEditorFromMediaArgs) {
  const spawnedAnimatedImage = spawnAnimatedImage({
    animatedCanvasSize: size,
    rect,
    source
  });

  openMediaEditor({
    ...rest,
    onCanvasReady: async(canvas) => {
      const canvasBcr = canvas.getBoundingClientRect();

      await spawnedAnimatedImage.animateToNewCenter(canvasBcr);
    },
    onImageRendered: async() => {
      await removeWithFade(spawnedAnimatedImage.imageCanvas);
    }
  }, SolidJSHotReloadGuardProvider);
}

export function openMediaEditorFromMediaNoAnimation({
  source,
  animatedCanvasSize: size,
  ...rest
}: OpenMediaEditorFromMediaNoAnimationArgs) {
  let spawnedImageCanvas: SpanImageCanvasResult;

  openMediaEditor({
    ...rest,
    onCanvasReady: async(canvas) => {
      const canvasBcr = canvas.getBoundingClientRect();

      spawnedImageCanvas = spawnImageCanvas({
        rect: snapToRect(size, canvasBcr),
        source,
        animatedCanvasSize: size
      });

      await fadeIn(spawnedImageCanvas.imageCanvas);
    },
    onImageRendered: async() => {
      if(spawnedImageCanvas) {
        await removeWithFade(spawnedImageCanvas.imageCanvas);
      }
    }
  }, SolidJSHotReloadGuardProvider);
}

function spawnAnimatedImage({rect, source, animatedCanvasSize: size}: SpawnImageCanvasArgs) {
  const {imageCanvas, centerLeft, centerTop} = spawnImageCanvas({
    rect,
    source,
    animatedCanvasSize: size
  });

  const [sourceWidth, sourceHeight] = size;

  async function animateToNewCenter(rect: DOMRect) {
    const canvasCenterLeft = rect.left + rect.width / 2;
    const canvasCenterTop = rect.top + rect.height / 2;

    const leftDiff = canvasCenterLeft - centerLeft;
    const topDiff = canvasCenterTop - centerTop;
    const [newWidth, newHeight] = snapToViewport(sourceWidth / sourceHeight, rect.width, rect.height);

    await imageCanvas.animate({
      transform: `translate(calc(-50% + ${leftDiff}px), calc(-50% + ${topDiff}px))`,
      width: `${newWidth}px`,
      height: `${newHeight}px`
    }, {
      duration: 200,
      fill: 'forwards',
      easing: 'ease-in-out'
    }).finished;
  }

  return {
    imageCanvas,
    animateToNewCenter
  };
}

type SpanImageCanvasResult = ReturnType<typeof spawnImageCanvas>;

function spawnImageCanvas({
  source,
  rect,
  animatedCanvasSize: size
}: SpawnImageCanvasArgs) {
  const imageCanvas = document.createElement('canvas');
  [imageCanvas.width, imageCanvas.height] = size;

  const ctx = imageCanvas.getContext('2d');
  ctx.drawImage(source, 0, 0, imageCanvas.width, imageCanvas.height);

  imageCanvas.style.position = 'fixed';

  const centerLeft = rect.left + rect.width / 2, centerTop = rect.top + rect.height / 2, width = rect.width, height = rect.height;

  imageCanvas.style.left = centerLeft + 'px';
  imageCanvas.style.top = centerTop + 'px';
  imageCanvas.style.width = width + 'px';
  imageCanvas.style.height = height + 'px';
  imageCanvas.style.transform = 'translate(-50%, -50%)';
  imageCanvas.style.objectFit = 'cover';
  imageCanvas.style.zIndex = '1000';

  document.body.append(imageCanvas);

  return {
    centerLeft,
    centerTop,
    imageCanvas
  };
}

async function fadeIn(imageCanvas: HTMLCanvasElement) {
  await imageCanvas.animate({
    opacity: [0, 1]
  }, {
    duration: 200,
    fill: 'forwards',
    easing: 'ease-in-out'
  }).finished;
}

async function removeWithFade(imageCanvas: HTMLCanvasElement) {
  await imageCanvas.animate({
    opacity: [1, 0]
  }, {
    duration: 400,
    fill: 'forwards',
    easing: 'ease-in'
  }).finished;
  imageCanvas.remove();
}

function snapToRect(size: NumberPair, rect: LocalDOMRect): LocalDOMRect {
  const [sourceWidth, sourceHeight] = size;
  const [snappedWidth, snappedHeight] = snapToViewport(sourceWidth / sourceHeight, rect.width, rect.height);

  const left = rect.left + rect.width / 2 - snappedWidth / 2;
  const top = rect.top + rect.height / 2 - snappedHeight / 2;

  return {
    left,
    top,
    width: snappedWidth,
    height: snappedHeight
  };
}
