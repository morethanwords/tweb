import {Component, createSignal} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createParticipantContextMenu from '@helpers/dom/createParticipantContextMenu';
import {renderComponent} from '@helpers/solid/renderComponent';
import {Chat, ChatFull} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {i18n} from '@lib/langPack';
import addChatUsers from '@components/addChatUsers';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonCorner from '@components/buttonCorner';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
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
      const hiddenSignal = createSignal(checked);
      const [busy, setBusy] = createSignal(false);
      let confirmedHidden = checked;

      const onHiddenChange = (hidden: boolean) => {
        if(hidden === confirmedHidden) {
          return;
        }

        const previous = confirmedHidden;
        setBusy(true);
        handleChannelsTooMuch(() => tab.managers.appChatsManager.toggleParticipantsHidden(chatId, hidden))
        .then(() => {
          confirmedHidden = hidden;
        })
        .catch((err) => {
          console.error('toggleParticipantsHidden error', err);
          hiddenSignal[1](previous);
        })
        .finally(() => setBusy(false));
      };

      renderComponent({
        element: section.content,
        Component: () => (
          <Row disabled={busy()}>
            <Row.Icon icon="hide" />
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                disabled={busy()}
                signal={hiddenSignal}
                toggle
                onChange={onHiddenChange}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('ChannelHideMembers')}</Row.Title>
          </Row>
        ),
        middleware: tab.middlewareHelper.get()
      });

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
