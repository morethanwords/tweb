import type {Accessor} from 'solid-js';
import type {ConfirmationPopupRejectReason} from '@components/confirmationPopup';
import type {PopupPeerOptions} from '@components/popups/peer';
import type {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';


type UseIsConfirmationNeededOnCloseArgs = {
  descriptionLangKey: LangPackKey;
  hasChanges: Accessor<boolean>;
  saveAllSettings: () => Promise<void>;
};

const useIsConfirmationNeededOnClose = ({descriptionLangKey, hasChanges, saveAllSettings}: UseIsConfirmationNeededOnCloseArgs) => {
  const {confirmationPopup} = useHotReloadGuard();

  return async() => {
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

      return true;
    } catch(_reason: any) {
      const reason: ConfirmationPopupRejectReason = _reason;

      if(reason === 'closed') throw new Error();
    }
  };
};

export default useIsConfirmationNeededOnClose;
