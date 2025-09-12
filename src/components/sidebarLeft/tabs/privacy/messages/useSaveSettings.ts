import {Accessor} from 'solid-js';

import {GlobalPrivacySettings, InputPrivacyRule} from '../../../../../layer';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import setBooleanFlag from '../../../../../helpers/object/setBooleanFlag';
import {logger} from '../../../../../lib/logger';

import {useSuperTab} from '../../../../solidJsTabs/superTabProvider';
import type {AppPrivacyMessagesTab} from '../../../../solidJsTabs';

import {MessagesTabStateStore, MessagesPrivacyOption, defaultPrivacyRules, privacyRulesInputKey} from './config';
import {ChosenPeersByType} from './useStateStore';


const log = logger('useSaveSettings');

type AppPrivacyMessagesTabType = typeof AppPrivacyMessagesTab;

type UseSaveSettingsArgs = {
  store: MessagesTabStateStore;
  globalPrivacy: Accessor<GlobalPrivacySettings>;
  isPaid: Accessor<boolean>;
  hasChanges: Accessor<boolean>;
  chosenPeersByType: Accessor<ChosenPeersByType>;
};

const useSaveSettings = ({store, globalPrivacy, isPaid, hasChanges, chosenPeersByType}: UseSaveSettingsArgs) => {
  const {rootScope} = useHotReloadGuard();
  const [tab] = useSuperTab<AppPrivacyMessagesTabType>();

  const saveGlobalSettings = () => {
    const settings = structuredClone(globalPrivacy());

    settings.noncontact_peers_paid_stars = isPaid() ? store.stars : 0;

    settings.pFlags ??= {};
    setBooleanFlag(settings.pFlags, 'new_noncontact_peers_require_premium', store.option === MessagesPrivacyOption.ContactsAndPremium);


    log('saving settings :>> ', settings);

    const promise = rootScope.managers.appPrivacyManager.setGlobalPrivacySettings(settings);

    tab.payload.onSaved(promise);

    return promise;
  };

  const savePrivacyRules = async() => {
    const rules: InputPrivacyRule[] = [];

    const {chats, users} = chosenPeersByType();

    rules.push(...defaultPrivacyRules);

    if(chats.length) rules.push({
      _: 'inputPrivacyValueAllowChatParticipants',
      chats
    });
    if(users.length) rules.push({
      _: 'inputPrivacyValueAllowUsers',
      users: await Promise.all(users.map((id) => rootScope.managers.appUsersManager.getUserInput(id)))
    });


    log('saving rules :>> ', rules);

    return rootScope.managers.appPrivacyManager.setPrivacy(privacyRulesInputKey, rules);
  };


  let isSaving = false;

  const saveAllSettings = async() => {
    if(isSaving || !hasChanges()) return;
    isSaving = true;

    try {
      await Promise.all([
        saveGlobalSettings(),
        isPaid() ? savePrivacyRules() : undefined
      ]);
      tab.close();
    } finally {
      isSaving = false; // Idk let the user retry if it somewhy fails)
    }
  };

  return saveAllSettings;
};

export default useSaveSettings;
