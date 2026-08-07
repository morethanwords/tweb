import noop from '@helpers/noop';
import type {
  AppDialogsManager,
  DialogElement
} from '@lib/appDialogsManager';

type AddListDialogOptions = Parameters<
  AppDialogsManager['addListDialog']
>[0];

export default function createCommunityDialogElement(
  manager: Pick<AppDialogsManager, 'addDialogNew' | 'addListDialog'>,
  peerId: PeerId,
  wrapOptions: AddListDialogOptions['wrapOptions'],
  options: Pick<
    AddListDialogOptions,
    | 'avatarSize'
    | 'autoDeletePeriod'
    | 'dialog'
    | 'dontSetActive'
    | 'lastMessage'
    | 'onInitPromise'
  >,
  initialize = true
): DialogElement {
  const loadPromises: Promise<any>[] = [];
  const dialogOptions: AddListDialogOptions = {
    peerId,
    loadPromises,
    isBatch: true,
    isMainList: false,
    controlled: true,
    meAsSaved: true,
    wrapOptions,
    ...options
  };
  const dialogElement = initialize ?
    manager.addListDialog(dialogOptions) :
    manager.addDialogNew({
      ...dialogOptions,
      autonomous: false,
      withStories: true
    });
  if(initialize) {
    void Promise.all(loadPromises).catch(noop);
  }
  dialogElement.dom.listEl.dataset.communityDialog = 'true';
  return dialogElement;
}
