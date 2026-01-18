import {ForumTopic} from '@appManagers/appMessagesManager';
import {isDialog, isForumTopic} from '@appManagers/utils/dialogs/isDialog';
import {CAN_HIDE_TOPIC} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {AutonomousDialogListBase, BaseConstructorArgs} from '@components/autonomousDialogList/base';


type ConstructorArgs = BaseConstructorArgs & {
  peerId: PeerId;
};

export class AutonomousForumTopicList extends AutonomousDialogListBase<ForumTopic> {
  public peerId: PeerId;

  constructor({peerId, ...args}: ConstructorArgs) {
    super(args);

    this.peerId = peerId;

    this.skipMigrated = !!CAN_HIDE_TOPIC;

    this.placeholderOptions = {
      avatarSize: 0,
      marginVertical: 5,
      totalHeight: 64
    };

    this.listenerSetter.add(rootScope)('peer_typings', async({peerId, threadId, typings}) => {
      if(!threadId || this.peerId !== peerId) {
        return;
      }

      const dialog = await this.managers.dialogsStorage.getForumTopic(peerId, threadId);

      if(!dialog) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      for(const [peerId, {topics}] of dialogs) {
        if(peerId !== this.peerId || !topics?.size) {
          continue;
        }

        topics.forEach((forumTopic) => {
          this.updateDialog(forumTopic);
        });
      }
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      this.appDialogsManager.setUnreadMessagesN({dialog, dialogElement: this.getDialogElement(this.getDialogKey(dialog))});
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', async(dialog) => {
      if(dialog.peerId !== this.peerId) {
        return;
      }

      if(isDialog(dialog)) {
        const all = this.sortedList.getAll();
        const entries = [...all.entries()];
        const promises = entries.map(([id]) => this.managers.dialogsStorage.getForumTopic(this.peerId, id));
        const topics = await Promise.all(promises);
        entries.forEach(([id, element], idx) => {
          this.appDialogsManager.setUnreadMessagesN({dialog: topics[idx], dialogElement: element}); // возможно это не нужно, но нужно менять is-muted
        });

        return;
      }

      this.appDialogsManager.setUnreadMessagesN({dialog, dialogElement: this.getDialogElement(this.getDialogKey(dialog))}); // возможно это не нужно, но нужно менять is-muted
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop}) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      if(drop) {
        this.deleteDialog(dialog);
      } else {
        this.updateDialog(dialog);
      }
    });
  }

  public getDialogKey(dialog: ForumTopic) {
    return dialog.id;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.threadId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return this.managers.dialogsStorage.getForumTopic(+element.dataset.peerId, +element.dataset.threadId);
  }

  protected getFilterId() {
    return this.peerId;
  }

  protected canUpdateDialog(dialog: ForumTopic): boolean {
    if(dialog.pFlags.hidden) return false;
    return super.canUpdateDialog(dialog);
  }
}
