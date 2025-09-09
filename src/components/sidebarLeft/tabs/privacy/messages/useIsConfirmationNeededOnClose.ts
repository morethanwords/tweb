import {Accessor} from 'solid-js';
import type {LangPackKey} from '../../../../../lib/langPack';
import confirmationPopup, {ConfirmationPopupRejectReason} from '../../../../confirmationPopup';
import {PopupPeerOptions} from '../../../../popups/peer';


type UseIsConfirmationNeededOnCloseArgs = {
  descriptionLangKey: LangPackKey;
  hasChanges: Accessor<boolean>;
  saveAllSettings: () => Promise<void>;
};

const useIsConfirmationNeededOnClose = ({descriptionLangKey, hasChanges, saveAllSettings}: UseIsConfirmationNeededOnCloseArgs) => async() => {
  if(!hasChanges()) return;

  const saveButton: PopupPeerOptions['buttons'][number] = {
    langKey: 'Save'
  };

  try {
    await confirmationPopup({
      titleLangKey: 'UnsavedChanges',
      descriptionLangKey,
      button: saveButton,
      buttons: [
        saveButton,
        {isCancel: true, langKey: 'Discard'}
      ],
      rejectWithReason: true
    });
    saveAllSettings();
  } catch(_reason: any) {
    const reason: ConfirmationPopupRejectReason = _reason;

    if(reason === 'closed') throw new Error();
  }
};

export default useIsConfirmationNeededOnClose;
