import {attachClickEvent} from '@helpers/dom/clickEvent';
import {Chat, MissingInvitee, User} from '@layer';
import {FormatterArguments, LangPackKey, i18n, join} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import {DelimiterWithText} from '@components/chat/giveaway';
import showPeerPopup, {PopupPeerButtonCallbackCheckboxes, PopupPeerCheckboxOptions} from '@components/popups/peer';
import showPickUserPopup from '@components/popups/pickUser';
import SidebarSlider from '@components/slider';
import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import apiManagerProxy from '@lib/apiManagerProxy';
import hasRights from '@appManagers/utils/chats/hasRights';
import getBotAdminRightsForChat from '@appManagers/utils/bots/getBotAdminRightsForChat';
import confirmationPopup from '@components/confirmationPopup';
import {openBotAdminEditor} from '@components/popups/addBotToChat';

export async function handleMissingInvitees(chatId: ChatId, missingInvitees: MissingInvitee[]) {
  if(!missingInvitees.length) {
    return;
  }

  const inviteLink = await rootScope.managers.appProfileManager.getChatInviteLink(chatId);
  const premiumRequireIds: Set<PeerId> = new Set();
  const canInviteAsPremiumIds: Set<PeerId> = new Set();
  const missingInviteeIds = missingInvitees.map((invitee) => {
    const peerId = invitee.user_id.toPeerId(false);
    if(invitee.pFlags.premium_required_for_pm) {
      premiumRequireIds.add(peerId);
    }

    if(invitee.pFlags.premium_would_allow_invite) {
      canInviteAsPremiumIds.add(peerId);
    }

    return peerId;
  });

  const hasPremiumSection = canInviteAsPremiumIds.size > 0;

  const getTitle = (peerId: PeerId) => wrapPeerTitle({peerId, onlyFirstName: true});
  const length = missingInviteeIds.length;
  const title = length > 1 ? undefined : await getTitle(hasPremiumSection ? [...canInviteAsPremiumIds][0] : missingInviteeIds[0]);

  const cantSendMessages = premiumRequireIds.size === missingInviteeIds.length;

  const onPremiumClick = () => {
    hotReloadGuard.showPremiumPopup();
    popup.hide();
  };

  let footerButton: HTMLElement;
  const onCountUpdate = (count: number) => {
    footerButton.replaceChildren(i18n(cantSendMessages ? 'InviteViaLink.Premium.Subscribe' : (count ? 'InviteViaLink.Send' : 'InviteViaLink.Skip')));
  };
  const initial = missingInviteeIds.filter((peerId) => !premiumRequireIds.has(peerId));
  const popup = showPickUserPopup(
    {
      peerType: ['custom'],
      getMoreCustom: async() => ({result: missingInviteeIds, isEnd: true}),
      onSelect: async(chosen) => {
        const peerIds = chosen.map((c) => c.peerId);
        if(cantSendMessages) {
          onPremiumClick();
          return;
        }

        const length = peerIds.length;
        if(!length) {
          return;
        }

        peerIds.forEach((peerId) => {
          rootScope.managers.appMessagesManager.sendText({
            peerId,
            text: inviteLink
          });
        });

        toastNew({
          langPackKey: 'InviteViaLink.LinkShared',
          langPackArguments: [length, length > 1 ? undefined : await getTitle(peerIds[0])]
        });
      },
      onChange: onCountUpdate,
      multiSelect: true,
      titleLangKey: hasPremiumSection ? 'InviteViaLink.Premium' : 'InviteViaLink.Title',
      initial,
      headerSearch: false,
      noSearch: true,
      footerButtonProps: /* cantSendMessages ? undefined :  */{ref: (element) => footerButton = element},
      chatRightsActions: ['send_messages'],
      autoHeight: cantSendMessages
    }
  );

  onCountUpdate(initial.length);
  if(hasPremiumSection) {
    const container = document.createElement('div');
    container.classList.add('popup-add-members-premium-container');

    const subtitle = i18n('InviteViaLink.Premium.Subtitle', [length, title || length]);
    subtitle.classList.add('popup-add-members-premium-subtitle');

    container.append(
      subtitle
    );

    if(!cantSendMessages) {
      const header = i18n('InviteViaLink.Title');
      header.classList.add('popup-add-members-premium-header');

      const subtitle2 = i18n('InviteViaLink.Premium.Subtitle2');
      subtitle2.classList.add('popup-add-members-premium-subtitle');

      const premiumButton = Button(`btn-primary popup-gift-premium-confirm action-button shimmer`, {text: 'InviteViaLink.Premium.Subscribe'});
      attachClickEvent(premiumButton, onPremiumClick);

      container.append(
        premiumButton,
        DelimiterWithText({langKey: 'PremiumOr'}) as HTMLElement,
        header,
        subtitle2
      );
    } else {
      popup.selector.list.remove();

      footerButton.classList.add('popup-gift-premium-confirm', 'action-button', 'shimmer');
    }

    popup.selector.section.content.prepend(container);
  } else {
    const subtitle = i18n('InviteViaLink.Subtitle', [length, title || length]);
    subtitle.classList.add('popup-add-members-subtitle');
    popup.selector.section.content.prepend(subtitle);
  }
}

/** what to tell of a refusal to add members: the reason where it is known, as tdesktop and Android do */
export function getAddMembersErrorLangKey(err: ApiError, isBroadcast: boolean): LangPackKey {
  switch(err?.type) {
    case 'USER_PRIVACY_RESTRICTED': return isBroadcast ? 'InviteToChannelError' : 'InviteToGroupError';
    case 'USER_BOT': return 'CantAddBotAsAdmin';
    case 'BOTS_TOO_MUCH': return isBroadcast ? 'ChannelUserCantBot' : 'GroupUserCantBot';
    case 'YOU_BLOCKED_USER': return 'YouBlockedUser';
    case 'USER_KICKED': return 'AddUserErrorBlacklisted';
    default: return 'Error.AnError';
  }
}

export default async function addChatUsers({
  peerId,
  slider,
  skippable = false
}: {
  peerId: PeerId,
  slider: SidebarSlider,
  skippable?: boolean
}) {
  const managers = bindManagersToSession(rootScope.managers);
  const id = peerId.toChatId();
  const isChannel = await managers.appChatsManager.isChannel(id);
  const isBroadcast = await managers.appChatsManager.isBroadcast(id);

  const showConfirmation = async(peerIds: PeerId[], callback: (e: MouseEvent, checked: PopupPeerButtonCallbackCheckboxes) => void) => {
    let titleLangKey: LangPackKey, titleLangArgs: FormatterArguments,
      descriptionLangKey: LangPackKey, descriptionLangArgs: FormatterArguments,
      checkboxes: PopupPeerCheckboxOptions[];

    if(peerIds.length > 1) {
      const titles = await Promise.all(peerIds.map(async(peerId) => {
        const b = document.createElement('b');
        b.append(await wrapPeerTitle({peerId}));
        return b;
      }));
      titleLangKey = 'AddMembersAlertTitle';
      titleLangArgs = [i18n(isBroadcast ? 'Subscribers' : 'Members', [peerIds.length])];
      descriptionLangKey = 'AddMembersAlertCountText';
      descriptionLangArgs = [
        join(titles)
      ];

      if(!isChannel) {
        checkboxes = [{
          text: 'AddMembersForwardMessages',
          checked: true
        }];
      }
    } else {
      titleLangKey = 'AddOneMemberAlertTitle';
      descriptionLangKey = 'AddMembersAlertNamesText';
      const b = document.createElement('b');
      b.append(await wrapPeerTitle({peerId: peerIds[0]}));
      descriptionLangArgs = [b];

      if(!isChannel) {
        checkboxes = [{
          text: peerIds.length > 1 ? 'AddMembersForwardMessages' : 'AddOneMemberForwardMessages',
          textArgs: peerIds.length > 1 ? undefined : [await wrapPeerTitle({peerId: peerIds[0]})],
          checked: true
        }];
      }
    }

    descriptionLangArgs.push(await wrapPeerTitle({peerId}));

    showPeerPopup('popup-add-members', {
      peerId,
      titleLangKey,
      titleLangArgs,
      descriptionLangKey,
      descriptionLangArgs,
      buttons: [{
        langKey: 'Add',
        callback
      }],
      checkboxes
    });
  };

  // * every refusal is said, as tdesktop and Android do: a member nobody was told about was never added -
  // * but not what an account switch dropped (MIDDLEWARE), which is no refusal and is not this account's
  const onError = (err: ApiError) => {
    if(err?.type === 'MIDDLEWARE') {
      return;
    }

    toastNew({langPackKey: getAddMembersErrorLangKey(err, isBroadcast)});
  };

  // * a channel takes a bot as an admin only (the server would answer USER_BOT): nothing is sent, as in
  // * tdesktop, and one bot is offered to be made an admin where admins can be added
  const offerBotsAsAdmins = async(peerIds: PeerId[]) => {
    const chat = apiManagerProxy.getChat(id) as Chat.channel;
    if(peerIds.length !== 1 || !hasRights(chat, 'add_admins')) {
      toastNew({langPackKey: 'CantAddBotAsAdmin'});
      return;
    }

    try {
      await confirmationPopup({
        descriptionLangKey: 'CantAddBotAsAdmin',
        button: {langKey: 'SetAsAdmin'}
      });
    } catch{
      return;
    }

    const botId = peerIds[0].toUserId();
    const userFull = await managers.appProfileManager.getProfile(botId);
    await openBotAdminEditor({
      managers,
      chat,
      botId,
      rights: getBotAdminRightsForChat({chat, userFull, scope: 'channelAdmin'})
    });
  };

  const tab = slider.createTab(hotReloadGuard.tabs.AppAddMembersTab);
  tab.open({
    type: 'channel',
    skippable,
    takeOut: (peerIds) => {
      if(isBroadcast && peerIds.some((peerId) => (apiManagerProxy.getUser(peerId.toUserId()) as User.user)?.pFlags?.bot)) {
        // * the button waits while it goes, so that a second press does not offer the bot again; the tab stays
        tab.payload.attachToPromise(offerBotsAsAdmins(peerIds).catch(onError).then(() => false));
        return false;
      }

      showConfirmation(peerIds, (e, checked) => {
        const promise = isChannel ?
          rootScope.managers.appChatsManager.inviteToChannel(id, peerIds) :
          rootScope.managers.appChatsManager.addChatUser(id, peerIds, checked.size ? undefined : 0);
        promise.then((missingInvitees) => handleMissingInvitees(id, missingInvitees), onError);
        tab.payload.attachToPromise(promise);
      });

      return false;
    },
    title: isBroadcast ? 'ChannelAddSubscribers' : 'GroupAddMembers',
    placeholder: 'SendMessageTo'
  });
}
