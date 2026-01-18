import rootScope from '@lib/rootScope';
import {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import {AutonomousDialogListBase, BaseConstructorArgs} from '@components/autonomousDialogList/base';


type ConstructorArgs = BaseConstructorArgs & {
  peerId: PeerId;
};

export class AutonomousMonoforumThreadList extends AutonomousDialogListBase<MonoforumDialog> {
  public onEmpty: () => void;
  private peerId: PeerId

  constructor({peerId, ...args}: ConstructorArgs) {
    super(args);

    this.peerId = peerId;

    this.listenerSetter.add(rootScope)('monoforum_dialogs_update', ({dialogs}) => {
      dialogs.filter(dialog => dialog.parentPeerId === this.peerId).forEach(dialog => this.updateDialog(dialog));
    });

    this.listenerSetter.add(rootScope)('monoforum_draft_update', ({dialog}) => {
      if(dialog.parentPeerId !== this.peerId) return;
      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('monoforum_dialogs_drop', ({parentPeerId, ids}) => {
      if(parentPeerId !== this.peerId) return;
      ids.forEach(id => this.deleteDialogByKey(id));

      if(!this.sortedList.itemsLength()) this.onEmpty?.();
    });
  }

  protected getFilterId() {
    return this.peerId;
  }

  public getDialogKey(dialog: MonoforumDialog) {
    return dialog?.peerId;
  }

  protected dialogsFetcher(offsetIndex: number, limit: number) {
    return this.managers.monoforumDialogsStorage.getDialogs({parentPeerId: this.peerId, limit, offsetIndex});
  }
}
