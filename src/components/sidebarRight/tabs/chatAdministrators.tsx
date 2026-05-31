import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createParticipantContextMenu from '@helpers/dom/createParticipantContextMenu';
import {ChannelParticipant, Chat, ChatFull, ChatParticipant} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {i18n} from '@lib/langPack';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonCorner from '@components/buttonCorner';
import CheckboxField from '@components/checkboxField';
import showPickUserPopup from '@components/popups/pickUser';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {openUserPermissionsTab} from '@components/solidJsTabs/tabs';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import {isParticipantAdmin} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {createSelectorForParticipants} from './participantsSelector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatAdministratorsTab} from '@components/solidJsTabs/tabs';

const ChatAdministrators: Component = () => {
  const [tab] = useSuperTab<typeof AppChatAdministratorsTab>();
  const promiseCollector = usePromiseCollector();
  const {chatId} = tab.payload;

  let selector: AppSelectPeers;

  promiseCollector.collect((async() => {
    const peerId = chatId.toPeerId(true);
    tab.container.classList.add('edit-peer-container', 'chat-administrators-container');

    const [chat, isBroadcast, chatFull, appConfig] = await Promise.all([
      tab.managers.appChatsManager.getChat(chatId),
      tab.managers.appChatsManager.isBroadcast(chatId),
      tab.managers.appProfileManager.getChatFull(chatId),
      tab.managers.apiManager.getAppConfig()
    ]);

    const canAddAdmins = hasRights(chat, 'add_admins');
    const addBtn = ButtonCorner({icon: 'addmember_filled', className: 'is-visible'});
    if(canAddAdmins) tab.content.append(addBtn);

    const openPermissions = async(participant: ChatParticipant | ChannelParticipant) => {
      openUserPermissionsTab(tab.slider, chatId, participant, true);
    };

    attachClickEvent(addBtn, () => {
      const popup = showPickUserPopup({
        titleLangKey: 'Administrators',
        peerType: ['channelParticipants'],
        peerId,
        onSelect: (chosen) => {
          const participant = popup.selector.participants.get(chosen[0].peerId);
          openPermissions(participant);
        },
        placeholder: 'SearchPlaceholder'
      });
    }, {listenerSetter: tab.listenerSetter});

    const canSeeAntiSpam = !isBroadcast &&
      (chat as Chat.chat | Chat.channel).participants_count >= appConfig.telegram_antispam_group_size_min;

    const {selector: _selector, loadPromise} = createSelectorForParticipants({
      appendTo: tab.content,
      managers: tab.managers,
      middleware: tab.middlewareHelper.get(),
      peerId,
      channelParticipantsFilter: (q) => {
        return {_: 'channelParticipantsAdmins', q};
      },
      getSubtitleForElement: async(peerId) => {
        const participant = selector.participants.get(peerId);
        if(participant._ === 'channelParticipantCreator' || participant._ === 'chatParticipantCreator') {
          return i18n('ChannelCreator');
        }

        const promotedBy = (
          (participant as ChannelParticipant.channelParticipantAdmin).promoted_by ||
          (participant as ChatParticipant.chatParticipantAdmin).inviter_id
        ).toPeerId(false);
        return i18n('EditAdminPromotedBy', [await wrapPeerTitle({peerId: promotedBy})]);
      },
      onSelect: (peerId) => {
        const participant = selector.participants.get(peerId);
        openPermissions(participant);
      },
      channelParticipantsUpdateFilter: isParticipantAdmin
    });

    selector = _selector;

    if(canSeeAntiSpam) {
      const section = new SettingSection({
        noDelimiter: true,
        caption: 'ChannelAntiSpamInfo'
      });

      const canToggleAntiSpam = hasRights(chat, 'delete_messages');

      const checked = !!(chatFull as ChatFull.channelFull)?.pFlags?.antispam;
      const row = new Row({
        titleLangKey: 'ChannelAntiSpam',
        checkboxField: new CheckboxField({
          name: 'agg',
          toggle: true,
          listenerSetter: tab.listenerSetter,
          checked,
          disabled: !canToggleAntiSpam
        }),
        listenerSetter: tab.listenerSetter
      });

      if(!canToggleAntiSpam) row.toggleDisability(canToggleAntiSpam);

      tab.listenerSetter.add(row.checkboxField.input)('change', () => {
        const _checked = row.checkboxField.checked;
        if(_checked === checked) {
          return;
        }

        const promise = handleChannelsTooMuch(() => tab.managers.appChatsManager.toggleAntiSpam(chatId, _checked))
        .catch((err) => {
          console.error('toggleAntiSpam error', err);
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

export default ChatAdministrators;
