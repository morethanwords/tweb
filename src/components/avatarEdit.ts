import type { CancellablePromise } from "../helpers/cancellablePromise";
import type { InputFile } from "../layer";
import PopupAvatar from "./popups/avatar";

export default class AvatarEdit {
  public container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private icon: HTMLSpanElement;

  constructor(onChange: (uploadAvatar: () => CancellablePromise<InputFile>) => void) {
    this.container = document.createElement('div');
    this.container.classList.add('avatar-edit');

    this.canvas = document.createElement('canvas');

    this.icon = document.createElement('span');
    this.icon.classList.add('tgico', 'tgico-cameraadd');

    this.container.append(this.canvas, this.icon);

    this.container.addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, onChange);
    });
  }
}