/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {CancellablePromise} from '@helpers/cancellablePromise';
import type {InputFile} from '@layer';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import PopupAvatar from '@components/popups/avatar';
import Icon from '@components/icon';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';

export default class AvatarEdit {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private icon: HTMLSpanElement;

  constructor(onChange: (uploadAvatar: () => CancellablePromise<InputFile>) => void, options?: ConstructorParameters<typeof PopupAvatar>[0]) {
    this.container = document.createElement('div');
    this.container.classList.add('avatar-edit');

    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('avatar-edit-canvas');

    this.icon = Icon('cameraadd', 'avatar-edit-icon');

    this.container.append(this.canvas, this.icon);

    attachClickEvent(this.container, () => {
      getFileAndOpenEditor();
    });
  }

  public clear() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

async function getFileAndOpenEditor() {
  const input = createHiddenFileInput();
  // this.container.append(input); // Do not append to the container, it will cause an infinite loop as click will propagate to the container
  document.body.append(input);

  const file = await getFileFromInput(input).finally(() => {
    input.remove();
  });

  if(!file) return;

  const result = await createImageAndURLFromBlob(file);
  if(!result.ok) return;

  const {openMediaEditorFromMediaNoAnimation} = await import('./mediaEditor');

  openMediaEditorFromMediaNoAnimation({
    source: result.img,
    canImageResultInGIF: false,
    animatedCanvasSize: [result.img.naturalWidth, result.img.naturalHeight],
    getMediaBlob: async() => file,
    managers: rootScope.managers,
    mediaSrc: result.url,
    mediaType: 'image',
    onEditFinish: () => {

    },
    onClose: () => { }
  });
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
