import pause from '@helpers/schedulers/pause';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {Message} from '@layer';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {AppAdminRecentActionsTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';


export const getPhoto = (message: Message) => {
  if(message?._ !== 'message' || message?.media?._ !== 'messageMediaPhoto' || message?.media?.photo?._ !== 'photo') return;
  return message.media.photo;
};

export function diffFlags<T extends Record<string, true>>(
  prev: T | undefined,
  next: T | undefined
) {
  const prevNorm = (prev ?? {}) as Required<T>;
  const nextNorm = (next ?? {}) as Required<T>;

  const newFlags: (keyof T)[] = [];
  const oldFlags: (keyof T)[] = [];

  const allKeys = new Set<keyof T>([
    ...Object.keys(prevNorm) as (keyof T)[],
    ...Object.keys(nextNorm) as (keyof T)[]
  ]);

  for(const key of allKeys) {
    const was = prevNorm[key];
    const isNow = nextNorm[key];

    if(!was && isNow) {
      newFlags.push(key);
    } else if(was && !isNow) {
      oldFlags.push(key);
    }
  }

  return {new: newFlags, old: oldFlags};
}

export function useParticipantClickHandler(peerId: PeerId) {
  const {rootScope} = useHotReloadGuard();
  const [tab, allTabs] = useSuperTab<typeof AppAdminRecentActionsTab>();

  return wrapAsyncClickHandler(async() => {
    try {
      const participant = await rootScope.managers.appProfileManager.getParticipant(tab.payload.channelId, peerId);

      allTabs.AppUserPermissionsTab.openTab(
        tab.slider,
        tab.payload.channelId, participant, isParticipantAdmin(participant)
      );

      await pause(200); // wait the open animation too
    } catch{
      toastNew({
        langPackKey: 'AdminRecentActions.UserNotMemberAnymore'
      });
    }
  });
}
