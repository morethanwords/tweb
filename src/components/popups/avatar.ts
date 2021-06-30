/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import resizeableImage from "../../lib/cropper";
import PopupElement from ".";
import { ripple } from "../ripple";
import { _i18n } from "../../lib/langPack";
import { readBlobAsDataURL } from "../../helpers/blob";

export default class PopupAvatar extends PopupElement {
  private cropContainer: HTMLElement;
  private input: HTMLInputElement;
  private btnSubmit: HTMLElement;
  private h6: HTMLElement;

  private image = new Image();

  private canvas: HTMLCanvasElement;
  private blob: Blob;
  private cropper = {
    crop: () => {},
    removeHandlers: () => {}
  };

  private onCrop: (upload: () => ReturnType<typeof appDownloadManager.upload>) => void;

  constructor() {
    super('popup-avatar', null, {closable: true});

    this.h6 = document.createElement('h6');
    _i18n(this.h6, 'Popup.Avatar.Title');

    this.btnClose.classList.remove('btn-icon');

    this.header.append(this.h6);

    this.cropContainer = document.createElement('div');
    this.cropContainer.classList.add('crop');
    this.cropContainer.append(this.image);

    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.style.display = 'none';
    this.input.addEventListener('change', (e: any) => {
      const file = e.target.files[0];
      if(!file) {
        return;
      }

      readBlobAsDataURL(file).then(contents => {
        this.image = new Image();
        this.cropContainer.append(this.image);
        this.image.src = contents;
  
        this.image.onload = () => {
          /* let {w, h} = calcImageInBox(this.image.naturalWidth, this.image.naturalHeight, 460, 554);
          cropContainer.style.width = w + 'px';
          cropContainer.style.height = h + 'px'; */
          this.show();
  
          this.cropper = resizeableImage(this.image, this.canvas);
          this.input.value = '';
        };
      });
    }, false);

    this.btnSubmit = document.createElement('button');
    this.btnSubmit.className = 'btn-primary btn-color-primary btn-circle btn-crop btn-icon tgico-check z-depth-1';
    ripple(this.btnSubmit);
    this.btnSubmit.addEventListener('click', () => {
      this.cropper.crop();
      this.btnClose.click();

      this.canvas.toBlob(blob => {
        this.blob = blob; // save blob to send after reg
        this.darkenCanvas();
        this.resolve();
      }, 'image/jpeg', 1);
    });

    this.container.append(this.cropContainer, this.btnSubmit, this.input);

    this.onCloseAfterTimeout = () => {
      this.cropper.removeHandlers();
      if(this.image) {
        this.image.remove();
      }
    };
  }

  private resolve() {
    this.onCrop(() => {
      return appDownloadManager.upload(this.blob);
    });
  }

  public open(postCanvas: HTMLCanvasElement, onCrop: PopupAvatar['onCrop']) {
    this.canvas = postCanvas;
    this.onCrop = onCrop;

    this.input.click();
  }

  public darkenCanvas() {
    let ctx = this.canvas.getContext('2d');
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
