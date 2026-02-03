import {MediaEditorProps, openMediaEditor} from '@components/mediaEditor/mediaEditor';
import {NumberPair} from '@components/mediaEditor/types';
import {snapToViewport} from '@components/mediaEditor/utils';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';


type SpawnImageCanvasArgs = {
  source: CanvasImageSource;
  rect: DOMRect;
  size: NumberPair;
};

type OpenMediaEditorFromMediaArgs = Omit<MediaEditorProps, 'onCanvasReady' | 'onImageRendered'> & SpawnImageCanvasArgs;

export function openMediaEditorFromMedia({
  source,
  rect,
  size,
  ...rest
}: OpenMediaEditorFromMediaArgs) {
  const spawnedAnimatedImage = spawnAnimatedImage({
    size,
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
      await spawnedAnimatedImage.removeWithFade();
    }
  }, SolidJSHotReloadGuardProvider);
}

export function openMediaEditorFromMediaNoAnimation({
  source,
  // TODO: Remove this 'rect'
  rect,
  size,
  ...rest
}: OpenMediaEditorFromMediaArgs) {
  let spawnedImageCanvas: SpanImageCanvasResult;

  openMediaEditor({
    ...rest,
    onCanvasReady: async(canvas) => {
      const canvasBcr = canvas.getBoundingClientRect();

      spawnedImageCanvas = spawnImageCanvas({
        rect: canvasBcr,
        source,
        size
      });
    },
    onImageRendered: async() => {
      await spawnedImageCanvas?.removeWithFade();
    }
  }, SolidJSHotReloadGuardProvider);
}

function spawnAnimatedImage({rect, source, size}: SpawnImageCanvasArgs) {
  const {imageCanvas: animatedCanvas, centerLeft, centerTop, removeWithFade} = spawnImageCanvas({
    rect,
    source,
    size
  });

  const [sourceWidth, sourceHeight] = size;

  async function animateToNewCenter(rect: DOMRect) {
    const canvasCenterLeft = rect.left + rect.width / 2;
    const canvasCenterTop = rect.top + rect.height / 2;

    const leftDiff = canvasCenterLeft - centerLeft;
    const topDiff = canvasCenterTop - centerTop;
    const [scaledWidth, scaledHeight] = snapToViewport(sourceWidth / sourceHeight, rect.width, rect.height);

    await animatedCanvas.animate({
      transform: `translate(calc(-50% + ${leftDiff}px), calc(-50% + ${topDiff}px))`,
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`
    }, {
      duration: 200,
      fill: 'forwards',
      easing: 'ease-in-out'
    }).finished;
  }

  return {
    animateToNewCenter,
    removeWithFade
  };
}

type SpanImageCanvasResult = ReturnType<typeof spawnImageCanvas>;

function spawnImageCanvas({
  source,
  rect,
  size
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

  async function removeWithFade() {
    await imageCanvas.animate({
      opacity: [1, 0]
    }, {
      duration: 120,
      fill: 'forwards',
      easing: 'ease-in-out'
    }).finished;
    imageCanvas.remove();
  }

  return {
    centerLeft,
    centerTop,
    imageCanvas,
    removeWithFade
  };
}
