import Icon from '@components/icon';
import {animateImageToTarget} from '@helpers/animateImageToTarget';
import type {CancellablePromise} from '@helpers/cancellablePromise';
import {createImageAndURLFromBlob} from '@helpers/createImageAndURLFromBlob';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {getFileAndOpenEditor} from '@helpers/getFileAndOpenEditor';
import type {InputFile} from '@layer';
import appDownloadManager from '@lib/appDownloadManager';
import {MediaEditorFinalResult} from './mediaEditor/finalRender/createFinalResult';
import {snapToViewport} from './mediaEditor/utils';


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
        isEditingForAvatar: true,
        isEditingForumAvatar: options?.isForum,
        onFinish: ({editorResult: result}) => {
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
  await animateImageToTarget({animatedImg, target: canvas, targetIsRound: true}).promise;

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
