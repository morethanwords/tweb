/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../helpers/dom/clickEvent';
import {MissingInvitee} from '../layer';
import {FormatterArguments, LangPackKey, i18n, join} from '../lib/langPack';
import rootScope from '../lib/rootScope';
import Button from './button';
import {DelimiterWithText} from './chat/giveaway';
import PopupElement from './popups';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerCheckboxOptions} from './popups/peer';
import PopupPickUser from './popups/pickUser';
import PopupPremium from './popups/premium';
import AppAddMembersTab from './sidebarLeft/tabs/addMembers';
import SidebarSlider from './slider';
import {toastNew} from './toast';
import wrapPeerTitle from './wrappers/peerTitle';

export default async function addChatUsers({
  peerId,
  slider
}: {
  peerId: PeerId,
  slider: SidebarSlider
}) {
  const id = peerId.toChatId();
  const isChannel = await rootScope.managers.appChatsManager.isChannel(id);
  const isBroadcast = await rootScope.managers.appChatsManager.isBroadcast(id);

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

    PopupElement.createPopup(PopupPeer, 'popup-add-members', {
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
    }).show();
  };

  const onError = (err: ApiError) => {
    if(err.type === 'USER_PRIVACY_RESTRICTED') {
      toastNew({langPackKey: 'InviteToGroupError'});
    }/*  else if(err.type === 'USER_NOT_MUTUAL_CONTACT') {
      toastNew({langPackKey: 'InviteToGroupError'});
    }  */else {
      throw err;
    }
  };

  const onMissingInvitee = async(missingInvitee: MissingInvitee[]) => {
    if(!missingInvitee.length) {
      return;
    }

    const inviteLink = await rootScope.managers.appProfileManager.getChatInviteLink(id);
    const premiumRequireIds: Set<PeerId> = new Set();
    const canInviteAsPremiumIds: Set<PeerId> = new Set();
    const missingInviteeIds = missingInvitee.map((invitee) => {
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
      PopupPremium.show();
      popup.hide();
    };

    let footerButton: HTMLElement;
    const onCountUpdate = (count: number) => {
      footerButton.replaceChildren(i18n(cantSendMessages ? 'InviteViaLink.Premium.Subscribe' : (count ? 'InviteViaLink.Send' : 'InviteViaLink.Skip')));
    };
    const initial = missingInviteeIds.filter((peerId) => !premiumRequireIds.has(peerId));
    const popup = PopupElement.createPopup(
      PopupPickUser,
      {
        peerType: ['custom'],
        getMoreCustom: async() => ({result: missingInviteeIds, isEnd: true}),
        onMultiSelect: async(peerIds) => {
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
        titleLangKey: hasPremiumSection ? 'InviteViaLink.Premium' : 'InviteViaLink.Title',
        initial,
        headerSearch: false,
        noSearch: true,
        footerButton: /* cantSendMessages ? undefined :  */(element) => footerButton = element,
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
  };

  const tab = slider.createTab(AppAddMembersTab);
  tab.open({
    type: 'channel',
    skippable: false,
    takeOut: (peerIds) => {
      showConfirmation(peerIds, (e, checked) => {
        const promise = isChannel ?
          rootScope.managers.appChatsManager.inviteToChannel(id, peerIds) :
          rootScope.managers.appChatsManager.addChatUser(id, peerIds, checked.size ? undefined : 0);
        promise.then(onMissingInvitee, onError);
        tab.attachToPromise(promise);
      });

      return false;
    },
    title: isBroadcast ? 'ChannelAddSubscribers' : 'GroupAddMembers',
    placeholder: 'SendMessageTo'
  });
}
