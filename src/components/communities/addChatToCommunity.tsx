import {onCleanup, onMount} from 'solid-js';
import {i18n} from '@lib/langPack';
import AppSelectPeers from '@components/appSelectPeers';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppAddChatToCommunityTab,
  AppCommunityChatSettingsTab,
  AppNewChannelTab,
  AppNewGroupTab
} from '@components/solidJsTabs/tabs';
import useCommunityTabGuard from '@components/communities/useCommunityTabGuard';
import styles from '@components/communities/addChatToCommunity.module.scss';

export default function AddChatToCommunity() {
  const [tab] = useSuperTab<typeof AppAddChatToCommunityTab>();
  useCommunityTabGuard(tab, tab.payload.communityId);
  const chatsPromise = tab.managers.appCommunitiesManager.getChatsToAdd();
  const botsPromise = tab.managers.appCommunitiesManager.getBotsToAdd();
  const candidatesPromise = Promise.all([chatsPromise, botsPromise]);

  const openChatSettings = async(peerId: PeerId) => {
    const settingsTab = tab.slider.createTab(AppCommunityChatSettingsTab);
    await settingsTab.open({
      communityId: tab.payload.communityId,
      peerId,
      mode: 'add',
      initialVisibility: 'visible',
      returnToEditCommunity: true
    });
    tab.slider.removeTabFromHistory(tab);
  };
  const createGroup = () => {
    tab.slider.createTab(AppNewGroupTab).open({
      peerIds: [],
      asChannel: true,
      openAfter: false,
      onCreate: (chatId) => openChatSettings(chatId.toPeerId(true))
    });
  };
  const createChannel = () => {
    tab.slider.createTab(AppNewChannelTab).open({
      openAfter: false,
      onCreate: (chatId) => openChatSettings(chatId.toPeerId(true))
    });
  };

  tab.scrollable.container.remove();

  const selector = new AppSelectPeers({
    appendTo: tab.content,
    managers: tab.managers,
    middleware: tab.middlewareHelper.get(),
    peerType: ['custom'],
    multiSelect: false,
    meAsSaved: false,
    placeholder: 'SearchPlaceholder',
    sectionNameLangPackKey: 'FilterChats',
    getMoreCustom: async(query, middleware) => {
      const [chats, bots] = await candidatesPromise;
      if(!middleware()) {
        return;
      }

      const normalizedQuery = query.trim().toLocaleLowerCase();
      const matchesQuery = (parts: Array<string | undefined>) => {
        return !normalizedQuery || parts
        .filter((part): part is string => !!part)
        .some((part) => part.toLocaleLowerCase().includes(normalizedQuery));
      };
      const chatPeerIds = chats
      .filter((chat) => matchesQuery([chat.title]))
      .map((chat) => chat.id.toPeerId(true));
      const botPeerIds = bots
      .filter((bot) => bot._ === 'user' && matchesQuery([
        bot.first_name,
        bot.last_name,
        bot.username
      ]))
      .map((bot) => bot.id.toPeerId(false));

      return {
        result: [...chatPeerIds, ...botPeerIds],
        isEnd: true
      };
    },
    onSelect: (peerId) => {
      openChatSettings(peerId);
      return false;
    }
  });
  selector.section.container.classList.add(styles.listSection);

  let actionsSection: HTMLDivElement;
  onMount(() => {
    selector.scrollable.prepend(actionsSection);
    selector.checkForTriggers();
  });
  onCleanup(() => selector.container.remove());

  return (
    <Section ref={actionsSection}>
      <Row
        clickable={createGroup}
        role="button"
        tabIndex={0}
        on:keydown={(event) => {
          if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        <Row.Icon icon="newgroup_filled" />
        <Row.Title>{i18n('NewGroup')}</Row.Title>
      </Row>
      <Row
        clickable={createChannel}
        role="button"
        tabIndex={0}
        on:keydown={(event) => {
          if(event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        <Row.Icon icon="newchannel_filled" />
        <Row.Title>{i18n('NewChannel')}</Row.Title>
      </Row>
    </Section>
  );
}
