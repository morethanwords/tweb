import {Show} from 'solid-js';
import {i18n} from '@lib/langPack';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppAddGroupToCommunityTab,
  AppCommunityChatSettingsTab,
  AppCreateCommunityTab
} from '@components/solidJsTabs/tabs';
import {
  useJoinedCommunities
} from '@stores/communities';
import {
  communitySharedStyles
} from '@components/communities/communityShared';
import apiManagerProxy from '@lib/apiManagerProxy';
import {
  CommunityDialogList
} from '@components/communities/communityPeerDialogList';
import MediaHeader from '@components/mediaHeader';
import CommunityAvatar from '@components/communities/communityAvatar';

export default function AddGroupToCommunity() {
  const [tab] = useSuperTab<typeof AppAddGroupToCommunityTab>();
  const promiseCollector = usePromiseCollector();
  const communities = useJoinedCommunities();
  const {peerId} = tab.payload;
  const peer = apiManagerProxy.getPeer(peerId);
  const titleKey = peer?._ === 'user' && peer.pFlags.bot ?
    'Community.AddBot' as const :
    (
      peer?._ === 'channel' && peer.pFlags.broadcast ?
        'Community.AddChannel' as const :
        'Community.AddGroup' as const
    );
  const descriptionKey = peer?._ === 'user' && peer.pFlags.bot ?
    'Community.BotDescription' as const :
    (
      peer?._ === 'channel' && peer.pFlags.broadcast ?
        'Community.ChannelDescription' as const :
        'Community.Description' as const
    );
  const communityTitle = i18n('Community.Title').textContent;
  tab.title.replaceChildren(i18n(titleKey));

  const loadPromise = tab.managers.appCommunitiesManager.getJoinedCommunities();
  promiseCollector.collect(loadPromise);
  loadPromise.then(() => {
    communities()?.forEach((community) => {
      Promise.resolve(tab.managers.appProfileManager
      .getChatFull(community.id.toChatId()))
      .catch((): undefined => undefined);
    });
  }, (): undefined => undefined);

  const openCreate = () => {
    tab.slider.createTab(AppCreateCommunityTab).open({peerId});
  };

  const openCommunity = (communityId: ChatId) => {
    tab.slider.createTab(AppCommunityChatSettingsTab).open({
      communityId,
      peerId,
      mode: 'add',
      initialVisibility: 'visible',
      returnToEditChat: true
    });
  };

  return (
    <div>
      <MediaHeader marginBottom>
        <MediaHeader.Sticker
          size={90}
          element={(
            <CommunityAvatar
              peerId={peerId}
              title={communityTitle}
              size={90}
            />
          )}
        />
        <MediaHeader.Title>{communityTitle}</MediaHeader.Title>
        <MediaHeader.Subtitle secondary>{i18n(descriptionKey)}</MediaHeader.Subtitle>
      </MediaHeader>

      <Section>
        <Row
          clickable={openCreate}
          role="button"
          tabIndex={0}
          on:keydown={(event) => {
            if(event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
        >
          <Row.Icon icon="newgroup" />
          <Row.Title>{i18n('Community.Create')}</Row.Title>
        </Row>
      </Section>

      <Section name="Community.AddExisting">
        <CommunityDialogList
          communities={communities() || []}
          middleware={tab.middlewareHelper.get()}
          onClick={(community) => {
            openCommunity(community.id.toChatId());
          }}
        />
        <Show when={communities() && !communities().length}>
          <div class={communitySharedStyles.empty}>{i18n('Community.NoCommunities')}</div>
        </Show>
      </Section>
    </div>
  );
}
