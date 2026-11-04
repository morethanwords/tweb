import tsNow from '@helpers/tsNow';
import lastItem from '@helpers/array/lastItem';
import {ChatInviteImporter, ExportedChatInvite, MessagesExportedChatInvites} from '@layer';
import {AppManagers} from '@lib/managers';
import {i18n, LangPackKey} from '@lib/langPack';
import lottieLoader from '@lib/lottie/lottieLoader';
import rootScope from '@lib/rootScope';
import hasRights from '@lib/appManagers/utils/chats/hasRights';
import apiManagerProxy from '@lib/apiManagerProxy';
import AppSelectPeers from '@components/appSelectPeers';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';

export type ChatInvite = ExportedChatInvite.chatInviteExported;

export type ChatInviteActions = {
  revokeLink: () => void,
  deleteLink: () => void,
  editLink: () => void
};

export function isActiveInvite(invite: ChatInvite) {
  if(invite.pFlags.revoked) {
    return false;
  }

  if(invite.expire_date && invite.expire_date <= tsNow(true)) {
    return false;
  }

  if(invite.usage_limit && invite.usage_limit <= (invite.usage || 0)) {
    return false;
  }

  return true;
}

export class ChatInviteLink extends InviteLink {
  public subtitle: HTMLElement;

  constructor(public options: ConstructorParameters<typeof InviteLink>[0] & {
    actions: ChatInviteActions,
    withSubtitle?: boolean
  }) {
    super({
      ...options
    });

    if(options.withSubtitle) {
      this.subtitle = document.createElement('div');
      this.subtitle.classList.add('invite-link-subtitle', 'hide');
      this.container.append(this.subtitle);
    }
  }

  public setChatInvite(chatInvite: ChatInvite | string) {
    const isUsername = typeof(chatInvite) === 'string';
    const username = typeof(chatInvite) === 'string' ? chatInvite : undefined;
    this.setUrl(isUsername ? 't.me/' + username : chatInvite.link);

    if(this.subtitle) {
      if(!isUsername && chatInvite?.usage) {
        this.subtitle.replaceChildren(i18n('InviteLink.JoinedNew', [chatInvite.usage]));
      }

      this.subtitle.classList.toggle('hide', isUsername || !chatInvite?.usage);
    }

    let hasSomething: LangPackKey;
    if(!isUsername) {
      if(chatInvite.pFlags.revoked) {
        this.onButtonClick = () => this.options.actions.deleteLink();
        hasSomething = 'DeleteLink';
      } else if(!isActiveInvite(chatInvite)) {
        this.onButtonClick = () => this.options.actions.editLink();
        hasSomething = 'InviteLinks.Reactivate';
      }
    }

    if(!hasSomething) {
      hasSomething = 'ShareLink';
      this.onButtonClick = undefined;
    }

    this.buttonText.replaceChildren(i18n(hasSomething));
  }
}

export function getImportersLoader({
  chatId,
  managers,
  link,
  requested,
  onCount
}: {
  chatId: ChatId,
  managers: AppManagers,
  link?: string,
  requested?: boolean,
  /** the server's total, from each page loaded without a search query */
  onCount?: (count: number) => void
}) {
  const importers: ChatInviteImporter[] = [];
  const importersMap: Map<PeerId, ChatInviteImporter> = new Map();
  let lastQuery = '';
  // * what changes while a page is on its way puts it behind: one request answered, the server's count in
  // * it; all of them answered at once (`reset`) or another query, the whole page
  let revision = 0, resetRevision = 0;
  const reset = () => {
    resetRevision = ++revision;
    importers.length = 0;
    importersMap.clear();
  };

  const load: AppSelectPeers['getMoreCustom'] = async(q) => {
    if(lastQuery !== q) {
      reset();
      lastQuery = q;
    }

    const limit = 50;
    const lastImporter = importers[importers.length - 1];
    const startRevision = revision;
    const result = await managers.appChatInvitesManager.getChatInviteImporters({
      chatId,
      limit,
      link,
      requested,
      offsetDate: lastImporter?.date,
      offsetUserId: lastImporter?.user_id,
      q
    });

    if(resetRevision > startRevision) {
      // * not the end: the next page is asked for anew, from the start
      return {result: [], isEnd: false};
    }

    importers.push(...result.importers);
    if(!q && revision === startRevision) {
      onCount?.(result.count);
    }

    return {
      result: result.importers.map((importer) => {
        const peerId = importer.user_id.toPeerId(false);
        importersMap.set(peerId, importer);
        return peerId;
      }),
      isEnd: result.importers.length < limit
    };
  };

  const deleteImporter = (peerId: PeerId) => {
    ++revision;
    const index = importers.findIndex((importer) => importer.user_id.toPeerId(false) === peerId);
    if(index !== -1) {
      importers.splice(index, 1);
    }

    importersMap.delete(peerId);
  };

  return {
    importers,
    importersMap,
    load,
    deleteImporter,
    reset
  };
}

/** how many of an admin's links, active or revoked, a page holds */
const INVITES_PAGE_LIMIT = 50;

/**
 * Pages through an admin's invite links past the first page of each list, active and revoked, as the server orders
 * them: each page from the last link of the one before. A link the tab has shown (`remember`) - the main one, one
 * created, edited, revoked or deleted meanwhile - is never drawn twice.
 */
export function getChatInvitesLoader({
  chatId,
  adminId,
  managers
}: {
  chatId: ChatId,
  adminId?: UserId,
  managers: AppManagers
}) {
  // * the active links, then the revoked ones
  type List = {offset?: ChatInvite, isEnd: boolean, revision: number};
  const lists: List[] = [{isEnd: false, revision: 0}, {isEnd: false, revision: 0}];
  const knownLinks: Set<string> = new Set();

  const remember = (link: string) => {
    if(link) {
      knownLinks.add(link);
    }
  };

  /** moves a list past a page the server gave, the first one included, and returns its links not shown yet */
  const takePage = (revoked: boolean, page: MessagesExportedChatInvites) => {
    const list = lists[+revoked];
    const invites = page.invites.filter((invite): invite is ChatInvite => invite._ === 'chatInviteExported');
    const last = lastItem(invites);
    // * a short page is the end, and so is one that does not move past the one before
    list.isEnd = page.invites.length < INVITES_PAGE_LIMIT || !last || last.link === list.offset?.link;
    list.offset = last ?? list.offset;
    return invites.filter((invite) => {
      if(knownLinks.has(invite.link)) {
        return false;
      }

      knownLinks.add(invite.link);
      return true;
    });
  };

  /** the next page of a list, asked for one at a time: its links not shown yet - none once the list has ended */
  const loadMore = async(revoked: boolean): Promise<ChatInvite[]> => {
    const list = lists[+revoked];
    if(list.isEnd) {
      return;
    }

    const {offset, revision} = list;
    const page = await managers.appChatInvitesManager.getExportedChatInvites({
      chatId,
      adminId,
      revoked,
      limit: INVITES_PAGE_LIMIT,
      offsetDate: offset?.date,
      offsetLink: offset?.link
    });

    // * the list was ended while the page was on its way
    if(list.revision !== revision) {
      return;
    }

    return takePage(revoked, page);
  };

  /** every revoked link is deleted: none is left to ask for, and a page on its way is dropped */
  const endRevoked = () => {
    const list = lists[1];
    ++list.revision;
    list.isEnd = true;
  };

  return {
    remember,
    takePage,
    loadMore,
    endRevoked,
    isEnd: (revoked: boolean) => lists[+revoked].isEnd
  };
}

export function getChatInviteLinksInitArgs(chatId: ChatId, adminId?: UserId) {
  return {
    animationData: !adminId && lottieLoader.loadAnimationFromURLManually('UtyanLinks'),
    invites: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId, limit: INVITES_PAGE_LIMIT}),
    invitesRevoked: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId, revoked: true, limit: INVITES_PAGE_LIMIT}),
    adminsInvites: !adminId && hasRights(apiManagerProxy.getChat(chatId), 'change_type') && rootScope.managers.appChatInvitesManager.getAdminsWithInvites(chatId),
    chatFull: rootScope.managers.appProfileManager.getChatFull(chatId)
  };
}
