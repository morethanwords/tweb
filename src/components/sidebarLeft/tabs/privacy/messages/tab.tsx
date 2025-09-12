import {createEffect, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';

import {logger} from '../../../../../lib/logger';
import DEBUG from '../../../../../config/debug';

import {useSuperTab} from '../../../../solidJsTabs/superTabProvider';
import {IconTsx} from '../../../../iconTsx';

import useIsConfirmationNeededOnClose from './useIsConfirmationNeededOnClose';
import AppearZoomTransition from './appearZoomTransition';
import PaidSettingsSection from './paidSettingsSection';
import useSaveSettings from './useSaveSettings';
import OptionsSection from './optionsSection';
import useStateStore from './useStateStore';
import useSettings from './useSettings';
import SaveButton from './saveButton';


const log = logger('MessagesPrivacyTab');


const MessagesTab = () => {
  const [tab] = useSuperTab();

  const {
    isReady,
    globalPrivacy, privacyRules,
    currentOption, currentAllowedUsers, currentAllowedChats
  } = useSettings();

  const [store, setStore, {isPaid, hasChanges, chosenPeersByType}] = useStateStore({
    isReady,
    globalPrivacy,
    currentOption, currentAllowedChats, currentAllowedUsers
  });

  const saveAllSettings = useSaveSettings({
    store,
    globalPrivacy,
    isPaid,
    hasChanges,
    chosenPeersByType
  });

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({hasChanges, saveAllSettings, descriptionLangKey: 'UnsavedChangesDescription.Privacy'});


  const [exitAnimationPromise, setExitAnimationPromise] = createSignal<Promise<any>>();

  if(DEBUG) createEffect(() => {
    log('privacyRules() :>> ', privacyRules());
    log('globalPrivacy() :>> ', globalPrivacy());
  });


  return (
    <Show when={isReady()}>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges()} onClick={() => void saveAllSettings()} />
      </Portal>

      <OptionsSection
        isPaid={isPaid()}
        store={store}
        setStore={setStore}
        onExitAnimationPromise={setExitAnimationPromise}
      />

      <PaidSettingsSection
        isPaid={isPaid()}
        store={store}
        setStore={setStore}
        chosenPeersByType={chosenPeersByType()}
        exitAnimationPromise={exitAnimationPromise()}
      />
    </Show>
  );
};

export default MessagesTab;
