import {DialogFilter} from '@layer';
import rootScope from '@lib/rootScope';
import lottieLoader from '@lib/lottie/lottieLoader';
import confirmationPopup from '@components/confirmationPopup';
import showSharedFolderInvitePopup from '@components/popups/sharedFolderInvite';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function getEditFolderInitArgs() {
  return {
    animationData: lottieLoader.loadAnimationFromURLManually('Folders_2')
  };
}

export async function deleteFolder(filterId: number) {
  const managers = bindManagersToSession(rootScope.managers);
  const filter = await managers.filtersStorage.getFilter(filterId);
  if(filter?._ === 'dialogFilterChatlist' && !filter.pFlags.has_my_invites) {
    showSharedFolderInvitePopup({
      filter,
      deleting: true
    });

    return;
  }

  await confirmationPopup({
    titleLangKey: 'ChatList.Filter.Confirm.Remove.Header',
    descriptionLangKey: (filter as DialogFilter.dialogFilterChatlist).pFlags.has_my_invites ? 'RemoveSharedFolder' : 'ChatList.Filter.Confirm.Remove.Text',
    button: {
      langKey: 'Delete',
      isDanger: true
    }
  });

  return managers.filtersStorage.updateDialogFilter(
    {
      _: 'dialogFilter',
      id: filterId
    } as DialogFilter.dialogFilter,
    true
  );
}
