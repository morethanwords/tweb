import {Component, createSignal, onCleanup, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import type AppSelectPeers from '@components/appSelectPeers';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import useCommunityTabGuard
from '@components/communities/useCommunityTabGuard';
import Row from '@components/rowTsx';
import Section from '@components/section';
import createMiddleware from '@helpers/solid/createMiddleware';
import getParticipantPeerId
from '@appManagers/utils/chats/getParticipantPeerId';
import {isParticipantAdmin} from '@lib/appManagers/utils/chats/isParticipantAdmin';
import {i18n} from '@lib/langPack';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppChatAdministratorsTab} from '@components/solidJsTabs/tabs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import type {
  AdministratorParticipant,
  AdministratorsSource
} from './administratorsSource';
import createChatAdministratorsSource from './chatAdministratorsSource';
import createCommunityAdministratorsSource
from './communityAdministratorsSource';

const ChatAdministrators: Component = () => {
  const [tab] = useSuperTab<typeof AppChatAdministratorsTab>();
  const promiseCollector = usePromiseCollector();
  const communityId = 'communityId' in tab.payload ?
    tab.payload.communityId :
    undefined;
  const chatId = 'chatId' in tab.payload ? tab.payload.chatId : undefined;
  if(communityId !== undefined) {
    useCommunityTabGuard(tab, communityId);
  }

  const middlewareHelper = createMiddleware();
  const middleware = middlewareHelper.get(tab.middlewareHelper.get());
  const [administratorSource, setAdministratorSource] =
    createSignal<AdministratorsSource>();
  const [selector, setSelector] = createSignal<AppSelectPeers>();
  const [antiSpamChecked, setAntiSpamChecked] = createSignal(false);
  let openPermissions: (
    participantOrPeerId: AdministratorParticipant | PeerId
  ) => void;
  onCleanup(() => {
    tab.container.classList.remove(
      'edit-peer-container',
      'chat-administrators-container'
    );
    selector()?.container?.remove();
  });

  promiseCollector.collect((async() => {
    const source: AdministratorsSource = communityId === undefined ?
      await createChatAdministratorsSource({
        tab,
        chatId,
        middleware
      }) :
      await createCommunityAdministratorsSource({tab, communityId});
    if(!middleware()) {
      return;
    }

    tab.container.classList.add(
      'edit-peer-container',
      'chat-administrators-container'
    );

    const syncParticipant = async(
      participantId: PeerId,
      updatedParticipant?: AdministratorParticipant
    ) => {
      if(!middleware()) {
        return;
      }
      const currentSelector = selector();
      if(!currentSelector) {
        return;
      }
      if(!updatedParticipant || !isParticipantAdmin(updatedParticipant)) {
        currentSelector.participants.delete(participantId);
        currentSelector.deletePeerId(participantId);
        return;
      }

      const updatedParticipantId = getParticipantPeerId(updatedParticipant);
      currentSelector.participants.set(
        updatedParticipantId,
        updatedParticipant
      );
      if(!currentSelector.getElementByKey(updatedParticipantId)) {
        await currentSelector.renderResultsFunc(
          [updatedParticipantId],
          false
        );
      }
    };

    openPermissions = (
      participantOrPeerId: AdministratorParticipant | PeerId
    ) => {
      const currentSelector = selector();
      const participant = typeof(participantOrPeerId) === 'object' ?
        participantOrPeerId :
        currentSelector?.participants.get(participantOrPeerId);
      const participantId = participant ?
        getParticipantPeerId(participant) :
        participantOrPeerId as PeerId;
      source.openPermissions({
        participantId,
        participant,
        onUpdated: (updatedParticipant) => {
          return syncParticipant(participantId, updatedParticipant);
        }
      });
    };

    const selectorResult = source.createSelector({
      appendTo: tab.content,
      managers: tab.managers,
      middleware,
      getSubtitleForElement: async(peerId: PeerId) => {
        const participant = selector()?.participants.get(peerId);
        if(!participant) {
          return;
        }
        if(
          participant._ === 'channelParticipantCreator' ||
          participant._ === 'chatParticipantCreator'
        ) {
          return i18n('ChannelCreator');
        }

        let promotedBy: UserId;
        if(participant._ === 'channelParticipantAdmin') {
          promotedBy = participant.promoted_by;
        } else if(participant._ === 'chatParticipantAdmin') {
          promotedBy = participant.inviter_id;
        } else {
          return;
        }
        return i18n('EditAdminPromotedBy', [
          await wrapPeerTitle({peerId: promotedBy.toPeerId(false)})
        ]);
      },
      onSelect: (participantId: PeerId) => {
        openPermissions(
          selector()?.participants.get(participantId) || participantId
        );
      }
    });
    setSelector(selectorResult.selector);
    source.attachSelectorBehavior?.(selectorResult.selector);
    setAntiSpamChecked(!!source.antiSpam?.checked);
    setAdministratorSource(source);

    await selectorResult.loadPromise;
  })());

  const toggleAntiSpam = async(checked: boolean) => {
    const antiSpam = administratorSource()?.antiSpam;
    if(!antiSpam || checked === antiSpamChecked()) {
      return;
    }

    const previousChecked = antiSpamChecked();
    setAntiSpamChecked(checked);
    try {
      await antiSpam.toggle(checked);
    } catch(error) {
      console.error('toggleAntiSpam error', error);
      setAntiSpamChecked(previousChecked);
    }
  };

  return (
    <>
      <Portal mount={tab.content}>
        <Show when={administratorSource()?.canAddAdmins}>
          <Button.Corner
            class="is-visible"
            icon="addmember_filled"
            aria-label={i18n('EditAdminAddAdmins').textContent}
            tabIndex={0}
            onClick={() => {
              administratorSource()?.openAddAdmin(openPermissions);
            }}
          />
        </Show>
      </Portal>

      <Show when={administratorSource()?.antiSpam}>
        {(antiSpam) => (
          <Show when={selector()}>
            {(selector) => (
              <Portal mount={selector().scrollable.container}>
                <Section
                  noDelimiter
                  caption="ChannelAntiSpamInfo"
                >
                  <Row>
                    <Row.CheckboxFieldToggle>
                      <CheckboxFieldTsx
                        toggle
                        checked={antiSpamChecked()}
                        disabled={antiSpam().disabled}
                        onChange={(checked) => void toggleAntiSpam(checked)}
                      />
                    </Row.CheckboxFieldToggle>
                    <Row.Title>{i18n('ChannelAntiSpam')}</Row.Title>
                  </Row>
                </Section>
              </Portal>
            )}
          </Show>
        )}
      </Show>
    </>
  );
};

export default ChatAdministrators;
