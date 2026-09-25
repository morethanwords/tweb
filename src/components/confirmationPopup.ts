import classNames from '@helpers/string/classNames';
import {addCancelButton} from '@components/popups/indexTsx';
import showPeerPopup, {PopupPeerButton, PopupPeerCheckboxOptions, PopupPeerHandle, PopupPeerOptions} from '@components/popups/peer';

export type ConfirmationPopupRejectReason = 'canceled' | 'closed';

// type PopupConfirmationOptions = Pick<PopupPeerOptions, 'titleLangKey'>;
export type PopupConfirmationOptions = PopupPeerOptions & {
  button: PopupPeerOptions['buttons'][0],
  checkbox?: PopupPeerOptions['checkboxes'][0],
  inputField?: PopupPeerOptions['inputField'],
  rejectWithReason?: boolean,
  className?: string;
  cancelButton?: PopupPeerButton;
  onPopup?: (popup: PopupPeerHandle) => void;
};

export default function confirmationPopup<T extends PopupConfirmationOptions>(
  options: T
): Promise<T['checkboxes'] extends PopupPeerCheckboxOptions[] ? Array<boolean> : (T['checkbox'] extends PopupPeerCheckboxOptions ? boolean : void)> {
  return new Promise<any>((resolve, reject: (reason?: ConfirmationPopupRejectReason) => void) => {
    const {button, cancelButton: customCancelButton, checkbox, rejectWithReason} = options;
    button.callback = (e, set) => {
      if(checkbox || !set) {
        resolve(set ? !!set.size : undefined);
      } else {
        resolve(options.checkboxes.map((checkbox) => set.has(checkbox.text)));
      }
    };

    const buttons = options.buttons || [button];
    if(customCancelButton && !buttons.some((button) => button.isCancel)) {
      customCancelButton.isCancel = true;
      buttons.push(customCancelButton);
    }
    addCancelButton(buttons);
    const cancelButton = buttons.find((button) => button.isCancel);
    const cancelCallback = cancelButton.callback;
    cancelButton.callback = (event, checkboxes) => {
      cancelCallback?.(event, checkboxes);
      reject(rejectWithReason ? 'canceled' : undefined);
    };

    options.buttons = buttons;
    options.checkboxes ??= checkbox && [checkbox];

    options.onCloseAfterTimeout = () => {
      reject(rejectWithReason ? 'closed' : undefined);
    };

    const popup = showPeerPopup(classNames('popup-confirmation', options.className), options);
    options.onPopup?.(popup);
  });
}
