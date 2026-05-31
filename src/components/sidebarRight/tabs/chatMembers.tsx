import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createParticipantContextMenu from '@helpers/dom/createParticipantContextMenu';
import {Chat, ChatFull} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {i18n} from '@lib/langPack';
import addChatUsers from '@components/addChatUsers';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonCorner from '@components/buttonCorner';
import CheckboxField from '@components/checkboxField';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {createSelectorForParticipants} from './participantsSelector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatMembersTab} from '@components/solidJsTabs/tabs';

const ChatMembers: Component = () => {
  const [tab] = useSuperTab<typeof AppChatMembersTab>();
  const promiseCollector = usePromiseCollector();
  const chatId = tab.payload;

  let selector: AppSelectPeers;

  promiseCollector.collect((async() => {
    const chat = await tab.managers.appChatsManager.getChat(chatId) as Chat.channel | Chat.chat;
    const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
    const channelFull = await tab.managers.appProfileManager.getChannelFull(chatId).catch(() => undefined as ChatFull.channelFull);
    tab.container.classList.add('edit-peer-container', 'chat-members-container');
    tab.title.replaceChildren(i18n(isBroadcast ? 'PeerInfo.Subscribers' : 'GroupMembers'));

    const canAddMembers = hasRights(chat, 'invite_users');
    const addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    if(canAddMembers) tab.content.append(addBtn);

    attachClickEvent(addBtn, () => {
      addChatUsers({
        peerId: chatId.toPeerId(true),
        slider: tab.slider
      });
    }, {listenerSetter: tab.listenerSetter});

    const participantsCount = (chat as Chat.chat).participants_count;
    const canHideMembers = !isBroadcast &&
      participantsCount >= ((await tab.managers.apiManager.getAppConfig()).hidden_members_group_size_min || 0) &&
      hasRights(chat, 'just_admin');

    const {selector: _selector, loadPromise} = createSelectorForParticipants({
      appendTo: tab.content,
      managers: tab.managers,
      middleware: tab.middlewareHelper.get(),
      peerId: chatId.toPeerId(true),
      channelParticipantsUpdateFilter: (participant) => !!participant
    });

    selector = _selector;

    if(canHideMembers) {
      const section = new SettingSection({
        noDelimiter: true,
        caption: 'ChannelHideMembersInfo'
      });

      const checked = !!channelFull?.pFlags?.participants_hidden;
      const row = new Row({
        titleLangKey: 'ChannelHideMembers',
        icon: 'hide',
        checkboxField: new CheckboxField({
          name: 'hide-members',
          toggle: true,
          listenerSetter: tab.listenerSetter,
          checked
        }),
        listenerSetter: tab.listenerSetter
      });

      tab.listenerSetter.add(row.checkboxField.input)('change', () => {
        const _checked = row.checkboxField.checked;
        if(_checked === checked) {
          return;
        }

        const promise = handleChannelsTooMuch(() => tab.managers.appChatsManager.toggleParticipantsHidden(chatId, _checked))
        .catch((err) => {
          console.error('toggleParticipantsHidden error', err);
          row.checkboxField.setValueSilently(!_checked);
        });
        row.disableWithPromise(promise);
      });

      section.content.append(row.container);

      selector.scrollable.append(section.container, selector.scrollable.container.lastElementChild);
    }

    createParticipantContextMenu({
      chatId,
      listenTo: selector.scrollable.container,
      participants: selector.participants,
      slider: tab.slider,
      middleware: tab.middlewareHelper.get()
    });

    await loadPromise;
  })());

  return null;
};

export default ChatMembers;
