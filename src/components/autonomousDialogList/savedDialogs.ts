import appDialogsManager from '@lib/appDialogsManager';
import {SavedDialog} from '@appManagers/appMessagesManager';
import {isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import rootScope from '@lib/rootScope';
import {AutonomousDialogListBase, BaseConstructorArgs} from '@components/autonomousDialogList/base';


export class AutonomousSavedDialogList extends AutonomousDialogListBase<SavedDialog> {
  public onAnyUpdate: () => void;

  constructor({appDialogsManager}: BaseConstructorArgs) {
    super({appDialogsManager});

    // this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
    //   if(!dialog) {
    //     return;
    //   }

    //   this.updateDialog(dialog);
    // });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      let hasAnyUpdate = false;
      for(const [peerId, {saved}] of dialogs) {
        saved?.forEach((dialog) => {
          hasAnyUpdate = true;
          this.updateDialog(dialog as SavedDialog);
        });
      }

      if(hasAnyUpdate) {
        this.onAnyUpdate?.();
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!isSavedDialog(dialog)) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
      this.onAnyUpdate?.();
    });
  }

  public getRectFromForPlaceholder() {
    return appDialogsManager.chatsContainer;
  }

  protected getFilterId() {
    return rootScope.myId;
  }

  public getDialogKey(dialog: SavedDialog) {
    return dialog.savedPeerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return rootScope.managers.dialogsStorage.getAnyDialog(element.dataset.peerId.toPeerId(), element.dataset.threadId.toPeerId()) as Promise<SavedDialog>;
  }
}
