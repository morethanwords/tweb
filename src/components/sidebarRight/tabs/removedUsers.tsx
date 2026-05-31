import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createParticipantContextMenu from '@helpers/dom/createParticipantContextMenu';
import {ChannelParticipant, Chat} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {i18n} from '@lib/langPack';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonCorner from '@components/buttonCorner';
import showPickUserPopup from '@components/popups/pickUser';
import SettingSection from '@components/settingSection';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {createSelectorForParticipants} from '@components/sidebarRight/tabs/participantsSelector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppRemovedUsersTab} from '@components/solidJsTabs/tabs';

const RemovedUsers: Component = () => {
  const [tab] = useSuperTab<typeof AppRemovedUsersTab>();
  const promiseCollector = usePromiseCollector();
  const chatId = tab.payload;

  let selector: AppSelectPeers;

  promiseCollector.collect((async() => {
    const chat = await tab.managers.appChatsManager.getChat(chatId) as Chat.channel | Chat.chat;
    const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
    tab.container.classList.add('edit-peer-container', 'removed-users-container');

    const canChangePermissions = hasRights(chat, 'change_permissions');
    const addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    if(canChangePermissions) tab.content.append(addBtn);

    attachClickEvent(addBtn, () => {
      const popup = showPickUserPopup({
        titleLangKey: 'RemovedUsers',
        peerType: ['channelParticipants'],
        peerId: chatId.toPeerId(true),
        onSelect: (chosen) => {
          const participant = popup.selector.participants.get(chosen[0].peerId);
          tab.managers.appChatsManager.kickFromChat(chatId, participant);
        },
        placeholder: 'SearchPlaceholder'
      });
    }, {listenerSetter: tab.listenerSetter});

    const {selector: _selector, loadPromise} = createSelectorForParticipants({
      appendTo: tab.content,
      managers: tab.managers,
      middleware: tab.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      channelParticipantsFilter: (q) => ({_: 'channelParticipantsKicked', q}),
      channelParticipantsUpdateFilter: (participant) => participant?._ === 'channelParticipantBanned' && participant.pFlags.left,
      getSubtitleForElement: async(peerId) => {
        const participant = selector.participants.get(peerId);
        const kickedBy = (participant as ChannelParticipant.channelParticipantBanned).kicked_by.toPeerId(false);
        return i18n('UserRemovedBy', [await wrapPeerTitle({peerId: kickedBy})]);
      }
    });

    selector = _selector;

    const section = new SettingSection({
      noDelimiter: true,
      caption: isBroadcast ? 'NoBlockedChannel2' : 'NoBlockedGroup2'
    });

    section.container.firstElementChild.remove();
    const hr = selector.scrollable.container.querySelector('.gradient-delimiter');
    hr?.remove();
    selector.scrollable.append(section.container, selector.scrollable.container.lastElementChild);

    createParticipantContextMenu({
      listenTo: selector.scrollable.container,
      slider: tab.slider,
      chatId,
      participants: selector.participants,
      middleware: tab.middlewareHelper.get()
    });

    await loadPromise;
  })());

  return null;
};

export default RemovedUsers;
