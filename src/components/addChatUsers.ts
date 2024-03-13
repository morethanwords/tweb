/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FormatterArguments, LangPackKey, i18n, join} from '../lib/langPack';
import rootScope from '../lib/rootScope';
import PopupElement from './popups';
import PopupPeer, {PopupPeerButtonCallbackCheckboxes, PopupPeerCheckboxOptions} from './popups/peer';
import PopupPickUser from './popups/pickUser';
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
          text: 'AddOneMemberForwardMessages',
          textArgs: [await wrapPeerTitle({peerId: peerIds[0]})],
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
    }
  };

  if(isChannel) {
    const tab = slider.createTab(AppAddMembersTab);
    tab.open({
      type: 'channel',
      skippable: false,
      takeOut: (peerIds) => {
        showConfirmation(peerIds, () => {
          const promise = rootScope.managers.appChatsManager.inviteToChannel(id, peerIds);
          promise.catch(onError);
          tab.attachToPromise(promise);
        });

        return false;
      },
      title: isBroadcast ? 'ChannelAddSubscribers' : 'GroupAddMembers',
      placeholder: 'SendMessageTo'
    });
  } else {
    PopupElement.createPopup(PopupPickUser, {
      peerType: ['contacts'],
      placeholder: 'Search',
      onSelect: (peerId) => {
        setTimeout(() => {
          showConfirmation([peerId], (e, checked) => {
            rootScope.managers.appChatsManager.addChatUser(id, peerId, checked.size ? undefined : 0)
            .catch(onError);
          });
        }, 0);
      }
    });
  }
}
