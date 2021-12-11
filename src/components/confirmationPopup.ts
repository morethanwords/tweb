/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { addCancelButton } from "./popups";
import PopupPeer, { PopupPeerOptions } from "./popups/peer";

// type PopupConfirmationOptions = Pick<PopupPeerOptions, 'titleLangKey'>;
type PopupConfirmationOptions = PopupPeerOptions & {
  button: PopupPeerOptions['buttons'][0],
  checkbox?: PopupPeerOptions['checkboxes'][0]
};

export default function confirmationPopup(options: PopupConfirmationOptions) {
  return new Promise<boolean | void>((resolve, reject) => {
    const {button, checkbox} = options;
    button.callback = (set) => {
      resolve(set ? !!set.size : undefined);
    };

    const buttons = addCancelButton([]);
    const cancelButton = buttons[0];
    cancelButton.callback = () => {
      reject();
    };

    buttons.unshift(button);
    options.buttons = buttons;
    options.checkboxes = checkbox && [checkbox];

    new PopupPeer('popup-confirmation', options).show();
  });
}
