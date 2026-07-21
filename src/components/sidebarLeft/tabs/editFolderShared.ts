import {DialogFilter} from '@layer';
import rootScope from '@lib/rootScope';
import lottieLoader from '@lib/lottie/lottieLoader';
import confirmationPopup from '@components/confirmationPopup';
import PopupElement from '@components/popups';
import PopupSharedFolderInvite from '@components/popups/sharedFolderInvite';

export function getEditFolderInitArgs() {
  return {
    animationData: lottieLoader.loadAnimationFromURLManually('Folders_2')
  };
}

export async function deleteFolder(filterId: number) {
  const filter = await rootScope.managers.filtersStorage.getFilter(filterId);
  if(filter?._ === 'dialogFilterChatlist' && !filter.pFlags.has_my_invites) {
    PopupElement.createPopup(PopupSharedFolderInvite, {
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

  return rootScope.managers.filtersStorage.updateDialogFilter(
    {
      _: 'dialogFilter',
      id: filterId
    } as DialogFilter.dialogFilter,
    true
  );
}
