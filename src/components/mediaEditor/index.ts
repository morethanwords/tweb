import deferredPromise from '../../helpers/cancellablePromise';
import {doubleRaf} from '../../helpers/schedulers';
import type {AppManagers} from '../../lib/appManagers/managers';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import {EditingMediaState} from './context';
import {MediaEditorFinalResult} from './finalRender/createFinalResult';
import {openMediaEditor} from './mediaEditor';
import {MediaType, NumberPair} from './types';
import {animateValue, delay, lerp, snapToViewport} from './utils';


type Args = {
  source: CanvasImageSource;
  element: HTMLElement;
  managers: AppManagers;

  mediaType: MediaType;
  mediaSrc: string;
  mediaBlob: Blob;
  mediaSize: NumberPair;

  size: NumberPair;

  editingMediaState: EditingMediaState;
  onEditFinish: (result: MediaEditorFinalResult) => void;
  onClose: (hasGif: boolean) => void;
};

export function openMediaEditorFromMedia({
  source,
  element,
  managers,
  mediaType,
  mediaSrc,
  mediaBlob,
  mediaSize,
  size,
  editingMediaState,
  onEditFinish,
  onClose
}: Args) {
  const animatedCanvas = document.createElement('canvas');
  const [sourceWidth, sourceHeight] = [animatedCanvas.width, animatedCanvas.height] = size;

  const ctx = animatedCanvas.getContext('2d');
  ctx.drawImage(source, 0, 0, animatedCanvas.width, animatedCanvas.height);

  const bcr = element.getBoundingClientRect();
  animatedCanvas.style.position = 'fixed';

  const left = bcr.left + bcr.width / 2, top = bcr.top + bcr.height / 2, width = bcr.width, height = bcr.height;

  animatedCanvas.style.left = left + 'px';
  animatedCanvas.style.top = top + 'px';
  animatedCanvas.style.width = width + 'px';
  animatedCanvas.style.height = height + 'px';
  animatedCanvas.style.transform = 'translate(-50%, -50%)';
  animatedCanvas.style.objectFit = 'cover';
  animatedCanvas.style.zIndex = '1000';

  document.body.append(animatedCanvas);

  openMediaEditor({
    mediaType,
    mediaSrc,
    mediaBlob,
    managers,
    mediaSize,
    onEditFinish,

    onCanvasReady: (canvas) => {
      const canvasBcr = canvas.getBoundingClientRect();
      const leftDiff = (canvasBcr.left + canvasBcr.width / 2) - left;
      const topDiff = (canvasBcr.top + canvasBcr.height / 2) - top;
      const [scaledWidth, scaledHeight] = snapToViewport(sourceWidth / sourceHeight, canvasBcr.width, canvasBcr.height);

      const deferred = deferredPromise<void>();

      animateValue(
        0, 1, 200,
        (progress) => {
          animatedCanvas.style.transform = `translate(calc(${
            progress * leftDiff
          }px - 50%), calc(${
            progress * topDiff
          }px - 50%))`;
          animatedCanvas.style.width = lerp(width, scaledWidth, progress) + 'px';
          animatedCanvas.style.height = lerp(height, scaledHeight, progress) + 'px';
        },
        {
          onEnd: () => deferred.resolve()
        }
      );

      return deferred;
    },

    onImageRendered: async() => {
      animatedCanvas.style.opacity = '1';
      animatedCanvas.style.transition = '.12s';
      await doubleRaf();
      animatedCanvas.style.opacity = '0';
      await delay(120);
      animatedCanvas.remove();
    },

    editingMediaState: editingMediaState,
    onClose
  }, SolidJSHotReloadGuardProvider);
}
