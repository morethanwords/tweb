import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import {Chat} from '@layer';
import {AppDialogsManager, DialogDom} from '@lib/appDialogsManager';
import {Dialog} from '@appManagers/appMessagesManager';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import getDialogIndexKey from '@appManagers/utils/dialogs/getDialogIndexKey';
import {isDialog, isForumTopic} from '@appManagers/utils/dialogs/isDialog';
import {FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import groupCallActiveIcon from '@components/groupCallActiveIcon';
import Scrollable from '@components/scrollable';
import SetTransition from '@components/singleTransition';
import SortedDialogList from '@components/sortedDialogList';
import {AutonomousDialogListBase, BaseConstructorArgs} from '@components/autonomousDialogList/base';
import {BADGE_TRANSITION_TIME} from '@components/autonomousDialogList/constants';


type ConstructorArgs = BaseConstructorArgs & {
  filterId: number;
};

export class AutonomousDialogList extends AutonomousDialogListBase<Dialog> {
  protected filterId: number;

  constructor({filterId, ...args}: ConstructorArgs) {
    super(args);

    this.filterId = filterId;

    this.needPlaceholderAtFirstTime = true;

    this.listenerSetter.add(rootScope)('peer_typings', async({peerId, typings}) => {
      const [dialog, isForum] = await Promise.all([
        this.managers.appMessagesManager.getDialogOnly(peerId),
        this.managers.appPeersManager.isForum(peerId)
      ]);

      if(!dialog || isForum) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('user_update', async(userId) => {
      if(!this.isActive) {
        return;
      }

      const peerId = userId.toPeerId();
      const dom = this.getDialogDom(peerId);
      if(!dom) {
        return;
      }

      const status = await this.managers.appUsersManager.getUserStatus(userId);
      const online = status?._ === 'userStatusOnline';
      this.setOnlineStatus(dom.avatarEl.node, online);
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const peerId = chatId.toPeerId(true);
      this.processDialogForCallStatus(peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
      if(!this.isActive || !dialog) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      if(!this.isActive) {
        return;
      }

      for(const [peerId, {dialog, topics}] of dialogs) {
        if(!isDialog(dialog)) {
          continue;
        }

        this.updateDialog(dialog);
        this.appDialogsManager.processContact?.(peerId.toPeerId());
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
      this.appDialogsManager.processContact?.(dialog.peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop, peerId}) => {
      if(!this.isActive || isForumTopic(dialog)) {
        return;
      }

      if(drop) {
        this.deleteDialog(dialog);
      } else {
        this.updateDialog(dialog);
      }

      this.appDialogsManager.processContact?.(peerId);
    });

    this.listenerSetter.add(rootScope)('filter_update', async(filter) => {
      if(this.isActive && filter.id === this.filterId && !REAL_FOLDERS.has(filter.id)) {
        const dialogs = await this.managers.dialogsStorage.getCachedDialogs(true);
        await this.validateListForFilter();
        for(let i = 0, length = dialogs.length; i < length; ++i) {
          const dialog = dialogs[i];
          this.updateDialog(dialog);
        }

        if(this.appDialogsManager.filterId === this.filterId) {
          this.appDialogsManager.fetchChatlistUpdates?.();
        }
      }
    });

    this.listenerSetter.add(rootScope)('auto_delete_period_update', ({peerId, period}) => {
      this.getDialogElement(peerId)?.dom?.avatarEl?.setAutoDeletePeriod(period);
    });
  }

  private get isActive() {
    return this.appDialogsManager.xd === this;
  }

  public getRectFromForPlaceholder() {
    return this.filterId === FOLDER_ID_ARCHIVE ? this.appDialogsManager.chatsContainer : this.appDialogsManager.folders.container;
  }

  protected getFilterId() {
    return this.filterId;
  }

  public setOnlineStatus(element: HTMLElement, online: boolean) {
    const className = 'is-online';
    const hasClassName = element.classList.contains(className);
    !hasClassName && online && element.classList.add(className);
    SetTransition({
      element: element,
      className: 'is-visible',
      forwards: online,
      duration: 250,
      onTransitionEnd: online ? undefined : () => {
        element.classList.remove(className);
      },
      useRafs: online && !hasClassName ? 2 : 0
    });
  }

  public generateScrollable(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const filterId = filter.id;
    const scrollable = new Scrollable(null, 'CL', 500);
    scrollable.container.dataset.filterId = '' + filterId;

    const indexKey = getDialogIndexKey(filter.localId);
    const sortedDialogList = new SortedDialogList({
      appDialogsManager: this.appDialogsManager,
      managers: rootScope.managers,
      log: this.log,
      scrollable: scrollable,
      indexKey,
      requestItemForIdx: this.requestItemForIdx,
      onListShrinked: this.onListShrinked,
      itemSize: 72,
      onListLengthChange: () => {
        scrollable.onSizeChange();
        this.appDialogsManager.onListLengthChange?.();
      }
    });

    this.scrollable = scrollable;
    this.sortedList = sortedDialogList;
    this.setIndexKey(indexKey);
    this.bindScrollable();

    // list.classList.add('hide');
    // scrollable.container.style.backgroundColor = '#' + (Math.random() * (16 ** 6 - 1) | 0).toString(16);

    return {scrollable, list: sortedDialogList.list};
  }

  public testDialogForFilter(dialog: Dialog) {
    if(!REAL_FOLDERS.has(this.filterId) ? getDialogIndex(dialog, this.indexKey) === undefined : this.filterId !== dialog.folder_id) {
      return false;
    }

    return true;
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  public async validateListForFilter() {
    this.sortedList.getAll().forEach(async(_, key) => {
      const dialog = await rootScope.managers.appMessagesManager.getDialogOnly(key);
      if(!this.testDialogForFilter(dialog)) {
        this.deleteDialog(dialog);
      }
    });
  }

  public updateDialog(dialog: Dialog) {
    if(!this.testDialogForFilter(dialog)) {
      if(this.getDialogElement(dialog.peerId)) {
        this.deleteDialog(dialog);
      }

      return;
    }

    return super.updateDialog(dialog);
  }

  public setCallStatus(dom: DialogDom, visible: boolean) {
    let {callIcon, listEl} = dom;
    if(!callIcon && visible) {
      const {canvas, startAnimation} = dom.callIcon = callIcon = groupCallActiveIcon(listEl.classList.contains('active'));
      canvas.classList.add('dialog-group-call-icon');
      listEl.append(canvas);
      startAnimation();
    }

    if(!callIcon) {
      return;
    }

    SetTransition({
      element: dom.callIcon.canvas,
      className: 'is-visible',
      forwards: visible,
      duration: BADGE_TRANSITION_TIME,
      onTransitionEnd: visible ? undefined : () => {
        dom.callIcon.canvas.remove();
        dom.callIcon = undefined;
      },
      useRafs: visible ? 2 : 0
    });
  }

  public processDialogForCallStatus(peerId: PeerId, dom?: DialogDom) {
    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    if(!dom) dom = this.getDialogDom(peerId);
    if(!dom) return;

    const chat = apiManagerProxy.getChat(peerId.toChatId()) as Chat.chat | Chat.channel;
    this.setCallStatus(dom, !!(chat.pFlags.call_active && chat.pFlags.call_not_empty));
  }

  protected onScrolledBottom() {
    super.onScrolledBottom();

    if(this.hasReachedTheEnd) {
      this.appDialogsManager.loadContacts?.();
    }
  }

  public toggleAvatarUnreadBadges(value: boolean, useRafs: number) {
    if(!value) {
      this.sortedList.getAll().forEach((dialogElement) => {
        const {dom} = dialogElement;
        if(!dom.unreadAvatarBadge) {
          return;
        }

        dialogElement.toggleBadgeByKey('unreadAvatarBadge', false, false, false);
      });

      return;
    }

    const reuseClassNames = ['unread', 'mention'];
    this.sortedList.getAll().forEach((dialogElement) => {
      const {dom} = dialogElement;
      const unreadContent = dom.unreadBadge?.textContent;
      if(
        !unreadContent ||
        dom.unreadBadge.classList.contains('backwards') ||
        dom.unreadBadge.classList.contains('dialog-pinned-icon')
      ) {
        return;
      }

      const isUnreadAvatarBadgeMounted = !!dom.unreadAvatarBadge;
      dialogElement.createUnreadAvatarBadge();
      dialogElement.toggleBadgeByKey('unreadAvatarBadge', true, isUnreadAvatarBadgeMounted);
      dom.unreadAvatarBadge.textContent = unreadContent;
      const unreadAvatarBadgeClassList = dom.unreadAvatarBadge.classList;
      const unreadBadgeClassList = dom.unreadBadge.classList;
      reuseClassNames.forEach((className) => {
        unreadAvatarBadgeClassList.toggle(className, unreadBadgeClassList.contains(className));
      });
    });
  }

  public getDialogKey(dialog: Dialog) {
    return dialog.peerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return rootScope.managers.appMessagesManager.getDialogOnly(element.dataset.peerId.toPeerId());
  }

  protected canUpdateDialog(dialog: Dialog): boolean {
    if(dialog.migratedTo !== undefined || !this.testDialogForFilter(dialog)) return false;
    return super.canUpdateDialog(dialog);
  }
}
