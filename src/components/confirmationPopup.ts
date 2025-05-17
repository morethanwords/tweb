/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import classNames from '../helpers/string/classNames';
import PopupElement, {addCancelButton} from './popups';
import PopupPeer, {PopupPeerCheckboxOptions, PopupPeerOptions} from './popups/peer';

export type ConfirmationPopupRejectReason = 'canceled' | 'closed';

// type PopupConfirmationOptions = Pick<PopupPeerOptions, 'titleLangKey'>;
export type PopupConfirmationOptions = PopupPeerOptions & {
  button: PopupPeerOptions['buttons'][0],
  checkbox?: PopupPeerOptions['checkboxes'][0],
  inputField?: PopupPeerOptions['inputField'],
  rejectWithReason?: boolean,
  className?: string;
};

export default function confirmationPopup<T extends PopupConfirmationOptions>(
  options: T
): Promise<T['checkboxes'] extends PopupPeerCheckboxOptions[] ? Array<boolean> : (T['checkbox'] extends PopupPeerCheckboxOptions ? boolean : void)> {
  return new Promise<any>((resolve, reject: (reason?: ConfirmationPopupRejectReason) => void) => {
    const {button, checkbox, rejectWithReason} = options;
    button.callback = (e, set) => {
      if(checkbox || !set) {
        resolve(set ? !!set.size : undefined);
      } else {
        resolve(options.checkboxes.map((checkbox) => set.has(checkbox.text)));
      }
    };

    const buttons = addCancelButton(options.buttons || [button]);
    const cancelButton = buttons.find((button) => button.isCancel);
    cancelButton.callback = () => {
      reject(rejectWithReason ? 'canceled' : undefined);
    };

    options.buttons = buttons;
    options.checkboxes ??= checkbox && [checkbox];

    const popup = PopupElement.createPopup(PopupPeer, classNames('popup-confirmation', options.className), options);
    popup.addEventListener('closeAfterTimeout', () => {
      reject(rejectWithReason ? 'closed' : undefined);
    });

    popup.show();
  });
}
