import {createResource} from 'solid-js';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';

import {usePromiseCollector} from '../../../../solidJsTabs/promiseCollector';

import {privacyRulesInputKey, MessagesPrivacyOption} from './config';
import useIsPremium from './useIsPremium';
import {getUserId} from './utils';


const useSettings = () => {
  const {rootScope} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  const isPremium = useIsPremium();


  const [privacyRules] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getPrivacy(privacyRulesInputKey);
    promiseCollector.collect(promise);
    return promise;
  });

  const [globalPrivacy] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getGlobalPrivacySettings();
    promiseCollector.collect(promise);
    return promise;
  });


  const isReady = () => privacyRules.state === 'ready' && globalPrivacy.state === 'ready';

  const currentOption = () => {
    if(!isPremium()) return MessagesPrivacyOption.Everybody;

    if(globalPrivacy().noncontact_peers_paid_stars) return MessagesPrivacyOption.Paid;

    if(globalPrivacy().pFlags.new_noncontact_peers_require_premium) return MessagesPrivacyOption.ContactsAndPremium;

    return MessagesPrivacyOption.Everybody;
  };

  const currentAllowedUsers = () =>
    privacyRules()
    ?.filter((rule) => rule._ === 'privacyValueAllowUsers')
    ?.map(rule => rule?.users).flat()
    ?.map(user => user.toPeerId()) || [];

  const currentAllowedChats = () =>
    privacyRules()
    ?.find((rule) => rule._ === 'privacyValueAllowChatParticipants')?.chats
    ?.map(getUserId)
    ?.filter((v) => v !== undefined) || [];


  return {
    isReady,

    globalPrivacy,
    privacyRules,

    currentOption,
    currentAllowedUsers,
    currentAllowedChats
  };
};

export default useSettings;
