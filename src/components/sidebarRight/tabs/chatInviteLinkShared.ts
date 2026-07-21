import tsNow from '@helpers/tsNow';
import {ChatInviteImporter, ExportedChatInvite} from '@layer';
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
  requested
}: {
  chatId: ChatId,
  managers: AppManagers,
  link?: string,
  requested?: boolean
}) {
  const importers: ChatInviteImporter[] = [];
  const importersMap: Map<PeerId, ChatInviteImporter> = new Map();
  let lastQuery = '';
  const load: AppSelectPeers['getMoreCustom'] = async(q) => {
    if(lastQuery !== q) {
      importers.length = 0;
      importersMap.clear();
      lastQuery = q;
    }

    const limit = 50;
    const lastImporter = importers[importers.length - 1];
    const result = await managers.appChatInvitesManager.getChatInviteImporters({
      chatId,
      limit,
      link,
      requested,
      offsetDate: lastImporter?.date,
      offsetUserId: lastImporter?.user_id,
      q
    });

    importers.push(...result.importers);

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
    importers.splice(importers.findIndex((importer) => importer.user_id.toPeerId(false) === peerId), 1);
    importersMap.delete(peerId);
  };

  return {
    importers,
    importersMap,
    load,
    deleteImporter
  };
}

export function getChatInviteLinksInitArgs(chatId: ChatId, adminId?: UserId) {
  return {
    animationData: !adminId && lottieLoader.loadAnimationFromURLManually('UtyanLinks'),
    invites: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId}),
    invitesRevoked: rootScope.managers.appChatInvitesManager.getExportedChatInvites({chatId, adminId, revoked: true}),
    adminsInvites: !adminId && hasRights(apiManagerProxy.getChat(chatId), 'change_type') && rootScope.managers.appChatInvitesManager.getAdminsWithInvites(chatId),
    chatFull: rootScope.managers.appProfileManager.getChatFull(chatId)
  };
}
