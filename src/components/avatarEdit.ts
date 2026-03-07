/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Icon from '@components/icon';
import {animateValue} from '@helpers/animateValue';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import deferredPromise from '@helpers/cancellablePromise';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {lerp} from '@helpers/lerp';
import type {InputFile} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import appDownloadManager from '@lib/appDownloadManager';
import rootScope from '@lib/rootScope';
import {MediaEditorFinalResult} from './mediaEditor/finalRender/createFinalResult';
import {snapToViewport} from './mediaEditor/utils';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';


type Options = {
  isForum?: boolean;
};

export default class AvatarEdit {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private icon: HTMLSpanElement;

  constructor(onChange: (uploadAvatar: () => CancellablePromise<InputFile>) => void, options?: Options) {
    this.container = document.createElement('div');
    this.container.classList.add('avatar-edit');

    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('avatar-edit-canvas');

    this.icon = Icon('cameraadd', 'avatar-edit-icon');

    this.container.append(this.canvas, this.icon);

    attachClickEvent(this.container, () => {
      getFileAndOpenEditor({
        isForum: options?.isForum,
        onFinish: (result) => {
          finishFromResult({
            result,
            onChange,
            canvas: this.canvas
          })
        }
      });
    });
  }

  public clear() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

type GetFileAndOpenEditorArgs = {
  isForum?: boolean;
  dontCreatePreview?: boolean;
  onFinish: (result: MediaEditorFinalResult) => void;
};

export async function getFileAndOpenEditor({isForum, onFinish, dontCreatePreview}: GetFileAndOpenEditorArgs) {
  const input = createHiddenFileInput();
  // this.container.append(input); // Do not append to the container, it will cause an infinite loop as click will propagate to the container
  document.body.append(input);

  const file = await getFileFromInput(input).finally(() => {
    input.remove();
  });

  if(!file) return;


  const imgResult = await createImageAndURLFromBlob(file); // make sure to render the image to know if it's valid
  if(!imgResult.ok) return;

  const {openMediaEditorFromMediaRaw} = await import('./mediaEditor');

  openMediaEditorFromMediaRaw({
    isEditingForAvatar: true,
    isEditingForumAvatar: isForum,
    canImageResultInGIF: false,
    getMediaBlob: async() => file,
    managers: rootScope.managers,
    mediaSrc: imgResult.url,
    mediaType: 'image',
    initialTab: 'crop',
    onEditFinish: onFinish,
    dontCreatePreview,
    onClose: () => { }
  });
}

type FinishFromResultArgs = {
  result: MediaEditorFinalResult;
  canvas: HTMLCanvasElement;
  onChange: (value: () => CancellablePromise<InputFile>) => void;
};

async function finishFromResult({result: editorResult, canvas, onChange}: FinishFromResultArgs) {
  const earlyDispose = () => {
    editorResult.animatedPreview?.remove();
  };

  const resultPayload = await editorResult.getResult();

  if(editorResult.isVideo || !editorResult.animatedPreview) return void earlyDispose();

  const imgResult = await createImageAndURLFromBlob(resultPayload.blob);
  if(!imgResult.ok) return earlyDispose();

  const img = imgResult.img;

  const animatedImg = editorResult.animatedPreview;
  await animateImageToTarget(animatedImg, canvas);

  const [width, height] = snapToViewport(1, editorResult.width, editorResult.height);

  [canvas.width, canvas.height] = [width, height];

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);

  // Doing this now prevents the avatar blinking to the old one
  onChange(() => appDownloadManager.upload(resultPayload.blob));

  await animatedImg.animate({
    opacity: [1, 0]
  }, {
    duration: 200,
    fill: 'forwards'
  }).finished;

  animatedImg.remove();
}

type RenderImageAndURLFromBlobResult = {
  ok: true;
  url: string;
  img: HTMLImageElement;
} | {
  ok: false;
};

async function createImageAndURLFromBlob(blob: Blob): Promise<RenderImageAndURLFromBlobResult> {
  const url = await apiManagerProxy.invoke('createObjectURL', blob);

  const img = new Image();
  img.src = url;

  try {
    await img.decode();
    return {ok: true, url, img};
  } catch{
    return {ok: false};
  }
}

function createHiddenFileInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  input.accept = [...IMAGE_MIME_TYPES_SUPPORTED].join(',');

  return input;
}

function getFileFromInput(input: HTMLInputElement): Promise<File | undefined> {
  const promise = new Promise<File | undefined>((resolve) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file);
    }, false);
  });

  input.click();

  return promise;
}

async function animateImageToTarget(animatedImg: HTMLImageElement, target: HTMLElement): Promise<void> {
  const deferred = deferredPromise<void>();

  const bcr = animatedImg.getBoundingClientRect();
  const left = bcr.left + bcr.width / 2, top = bcr.top + bcr.height / 2, width = bcr.width, height = bcr.height;
  const targetBcr = target.getBoundingClientRect();
  const leftDiff = (targetBcr.left + targetBcr.width / 2) - left;
  const topDiff = (targetBcr.top + targetBcr.height / 2) - top;

  animateValue(
    0, 1, 200,
    (progress) => {
      animatedImg.style.transform = `translate(calc(${progress * leftDiff
      }px - 50%), calc(${progress * topDiff
      }px - 50%))`;
      animatedImg.style.width = lerp(width, targetBcr.width, progress) + 'px';
      animatedImg.style.height = lerp(height, targetBcr.height, progress) + 'px';
      // TODO: Forum shape is different
      animatedImg.style.borderRadius = lerp(0, 50, progress) + '%';
    },
    {
      onEnd: () => {
        deferred.resolve();
      }
    }
  );

  await deferred;
}
