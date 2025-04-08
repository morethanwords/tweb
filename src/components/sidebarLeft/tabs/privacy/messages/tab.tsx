import {createEffect, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';

import {logger} from '../../../../../lib/logger';
import DEBUG from '../../../../../config/debug';

import ripple from '../../../../ripple'; ripple; // keep
import {IconTsx} from '../../../../iconTsx';

import {useSuperTab} from '../../solidJsTabs/superTabProvider';

import useIsConfirmationNeededOnClose from './useIsConfirmationNeededOnClose';
import AppearZoomTransition from './appearZoomTransition';
import PaidSettingsSection from './paidSettingsSection';
import useSaveSettings from './useSaveSettings';
import OptionsSection from './optionsSection';
import useStateStore from './useStateStore';
import useSettings from './useSettings';


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

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({hasChanges, saveAllSettings});


  const [exitAnimationPromise, setExitAnimationPromise] = createSignal<Promise<any>>();

  if(DEBUG) createEffect(() => {
    log('privacyRules() :>> ', privacyRules());
    log('globalPrivacy() :>> ', globalPrivacy());
  });


  return (
    <Show when={isReady()}>
      <Portal mount={tab.header}>
        <AppearZoomTransition>
          <Show when={hasChanges()}>
            <button
              use:ripple
              class="btn-icon blue"
              onClick={() => void saveAllSettings()}
            >
              <IconTsx icon="check" />
            </button>
          </Show>
        </AppearZoomTransition>
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
