import {AutonomousDialogListBase} from '../lib/appManagers/appDialogsManager';
import {isMonoforumDialog} from '../lib/appManagers/utils/dialogs/isDialog';
import getPeerId from '../lib/appManagers/utils/peers/getPeerId';
import rootScope from '../lib/rootScope';
import {MonoforumDialog} from '../lib/storages/monoforumDialogs';
import appSidebarLeft from './sidebarLeft';


export class AutonomousMonoforumThreadList extends AutonomousDialogListBase<MonoforumDialog> {
  public onAnyUpdate: () => void;

  constructor(private peerId: PeerId) {
    super();

    // this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
    //   if(!dialog) {
    //     return;
    //   }

    //   this.updateDialog(dialog);
    // });

    // this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
    //   let hasAnyUpdate = false;
    //   for(const [peerId, {saved}] of dialogs) {
    //     saved?.forEach((dialog) => {
    //       hasAnyUpdate = true;
    //       // this.updateDialog(dialog as SavedDialog);
    //     });
    //   }

    //   if(hasAnyUpdate) {
    //     this.onAnyUpdate?.();
    //   }
    // });

    // this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
    //   if(!isMonoforumDialog(dialog)) {
    //     return;
    //   }

    //   this.deleteDialogByKey(this.getDialogKey(dialog));
    //   this.onAnyUpdate?.();
    // });
  }

  public getRectFromForPlaceholder() {
    return (): DOMRectEditable => {
      const sidebarRect = appSidebarLeft.rect;
      const paddingY = 56;
      const paddingX = 80;
      const width = sidebarRect.width - paddingX;

      return {
        top: paddingY,
        right: sidebarRect.right,
        bottom: 0,
        left: paddingX,
        width,
        height: sidebarRect.height - paddingY
      };
    };
  }

  protected getFilterId() {
    return this.peerId;
  }

  public getDialogKey(dialog: MonoforumDialog) {
    return getPeerId(dialog?.peer);
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    // return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    // TODO: first we need a monoforum threads storage
    return rootScope.managers.dialogsStorage.getAnyDialog(element.dataset.peerId.toPeerId(), element.dataset.threadId.toPeerId()) as any as Promise<MonoforumDialog>;
  }

  protected dialogsFetcher(offsetIndex: number, limit: number) {
    return this.managers.monoforumDialogsStorage.getDialogs({parentPeerId: this.peerId, limit});
  }
}
