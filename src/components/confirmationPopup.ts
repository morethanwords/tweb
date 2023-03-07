/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from './popups';
import PopupPeer, {PopupPeerCheckboxOptions, PopupPeerOptions} from './popups/peer';

// type PopupConfirmationOptions = Pick<PopupPeerOptions, 'titleLangKey'>;
export type PopupConfirmationOptions = PopupPeerOptions & {
  button: PopupPeerOptions['buttons'][0],
  checkbox?: PopupPeerOptions['checkboxes'][0]
};

export default function confirmationPopup<T extends PopupConfirmationOptions>(
  options: T
): Promise<T['checkboxes'] extends PopupPeerCheckboxOptions[] ? Array<boolean> : (T['checkbox'] extends PopupPeerCheckboxOptions ? boolean : void)> {
  return new Promise<any>((resolve, reject) => {
    const {button, checkbox} = options;
    button.callback = (set) => {
      if(checkbox || !set) {
        resolve(set ? !!set.size : undefined);
      } else {
        resolve(options.checkboxes.map((checkbox) => set.has(checkbox.text)));
      }
    };

    const buttons = addCancelButton(options.buttons || [button]);
    const cancelButton = buttons.find((button) => button.isCancel);
    cancelButton.callback = () => {
      reject();
    };

    options.buttons = buttons;
    options.checkboxes ??= checkbox && [checkbox];

    PopupElement.createPopup(PopupPeer, 'popup-confirmation', options).show();
  });
}
