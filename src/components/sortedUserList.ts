import type LazyLoadQueue from '@components/lazyLoadQueue';
import {AppDialogsManager} from '@lib/appDialogsManager';
import {DialogDom, DialogElement, DialogElementSize} from '@components/dialogElement';
import {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import isInDOM from '@helpers/dom/isInDOM';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import replaceContent from '@helpers/dom/replaceContent';
import {fastRaf} from '@helpers/schedulers';
import SortedList, {SortedElementBase} from '@helpers/sortedList';
import safeAssign from '@helpers/object/safeAssign';
import {ReadingManagers} from '@lib/managers';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import getChatMembersString from '@components/wrappers/getChatMembersString';
import {MemberTagBadge, makeMemberTagPressable, wrapMemberTag} from '@components/wrappers/participantRank';
import {i18n} from '@lib/langPack';
import {Middleware, MiddlewareHelper} from '@helpers/middleware';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

// * a row's tag; an `editable` one opens its editor on a click, and one with no `rank` is
// * my own missing tag, offered as "Add tag"
export type SortedUserListRank = Partial<MemberTagBadge> & {editable?: boolean};

interface SortedUser extends SortedElementBase<PeerId> {
  dom: DialogDom,
  dialogElement: DialogElement
}

export default class SortedUserList extends SortedList<SortedUser> {
  protected static SORT_INTERVAL = 30e3;
  public list: HTMLUListElement;
  public ranks: Map<PeerId, SortedUserListRank> = new Map();

  protected lazyLoadQueue: LazyLoadQueue;
  protected avatarSize: DialogElementSize = 'abitbigger';
  protected rippleEnabled = true;
  protected autonomous = true;
  protected createChatListOptions: Parameters<AppDialogsManager['createChatList']>[0];
  protected onListLengthChange: () => void;
  protected managers: ReadingManagers;

  constructor(options: Partial<{
    lazyLoadQueue: SortedUserList['lazyLoadQueue'],
    avatarSize: SortedUserList['avatarSize'],
    rippleEnabled: SortedUserList['rippleEnabled'],
    createChatListOptions: SortedUserList['createChatListOptions'],
    autonomous: SortedUserList['autonomous'],
    onListLengthChange: SortedUserList['onListLengthChange'],
    getIndex: SortedUserList['getIndex'],
    onUpdate: SortedUserList['onUpdate']
  }> & {
    managers: SortedUserList['managers'],
    middleware: Middleware
  }) {
    super({
      getIndex: options.getIndex || ((element) => element.id.isAnyChat() ? 0 : this.managers.appUsersManager.getUserStatusForSort(element.id)),
      onDelete: (element) => {
        element.dialogElement.remove();
        this.onListLengthChange?.();
      },
      onUpdate: options.onUpdate || (async(element) => {
        const managers = bindManagersToSession(this.managers);
        if(element.id.isAnyChat()) {
          const status = await getChatMembersString(element.id.toChatId(), managers);
          replaceContent(element.dom.lastMessageSpan, status);
        } else {
          const status = getUserStatusString(await managers.appUsersManager.getUser(element.id));
          replaceContent(element.dom.lastMessageSpan, status);

          this.renderRank(element.id, element.dialogElement);
        }
      }),
      onSort: (element, idx) => {
        const willChangeLength = element.dom.listEl.parentElement !== this.list;
        positionElementByIndex(element.dom.listEl, this.list, idx);

        if(willChangeLength && this.onListLengthChange) {
          this.onListLengthChange();
        }
      },
      onElementCreate: (base) => {
        const dialogElement = hotReloadGuard.appDialogsManager.addDialogNew({
          peerId: base.id,
          container: false,
          avatarSize: this.avatarSize,
          autonomous: this.autonomous,
          meAsSaved: false,
          rippleEnabled: this.rippleEnabled,
          wrapOptions: {
            lazyLoadQueue: this.lazyLoadQueue,
            middleware: this.middlewareHelper.get()
          },
          withStories: true
        });

        this.renderRank(base.id, dialogElement);

        (base as SortedUser).dom = dialogElement.dom;
        (base as SortedUser).dialogElement = dialogElement;
        return base as SortedUser;
      },
      updateElementWith: fastRaf,
      updateListWith: async(callback) => {
        if(!Array.from(this.elements.values()).some((element) => element.id.isUser())) {
          return callback(false);
        }

        if(!isInDOM(this.list)) {
          return callback(false);
        }

        await getHeavyAnimationPromise();

        if(!isInDOM(this.list)) {
          return callback(false);
        }

        callback(true);
      },
      middleware: options.middleware
    });

    safeAssign(this, options);

    this.list = hotReloadGuard.appDialogsManager.createChatList(this.createChatListOptions);

    let timeout: number;
    const doTimeout = () => {
      timeout = window.setTimeout(() => {
        this.updateList((good) => {
          if(good) {
            doTimeout();
          }
        });
      }, SortedUserList.SORT_INTERVAL);
    };

    doTimeout();
    // * otherwise the loop ends only at its next tick, once the list is out of the DOM - holding a closed
    // * list and every row of it for up to SORT_INTERVAL
    this.middlewareHelper.onDestroy(() => window.clearTimeout(timeout));
  }

  protected renderRank(peerId: PeerId, dialogElement: DialogElement) {
    const rank = this.ranks.get(peerId);
    let element: HTMLElement;
    if(rank?.rank !== undefined) {
      element = wrapMemberTag(rank as MemberTagBadge);
    } else if(rank?.editable) {
      element = document.createElement('span');
      element.classList.add('member-tag-add');
      element.append(i18n('MemberTag.AddMine'));
    }

    if(element && rank.editable) {
      element.classList.add('member-tag-editable');
      makeMemberTagPressable(element);
      // * the row opens its chat on a press anywhere but here (setListClickListener)
      element.dataset.dialogListAction = 'true';
    }

    dialogElement.titleRight.replaceChildren(...(element ? [element] : []));
  }
}
