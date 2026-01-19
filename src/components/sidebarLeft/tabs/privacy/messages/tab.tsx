import {createEffect, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import DEBUG from '@config/debug';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {logger} from '@lib/logger';
import SaveButton from '@components/saveButton';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import OptionsSection from '@components/sidebarLeft/tabs/privacy/messages/optionsSection';
import PaidSettingsSection from '@components/sidebarLeft/tabs/privacy/messages/paidSettingsSection';
import useSaveSettings from '@components/sidebarLeft/tabs/privacy/messages/useSaveSettings';
import useSettings from '@components/sidebarLeft/tabs/privacy/messages/useSettings';
import useStateStore from '@components/sidebarLeft/tabs/privacy/messages/useStateStore';


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
