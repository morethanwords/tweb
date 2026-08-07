import {
  Component,
  createEffect,
  createSignal,
  onCleanup,
  Show
} from 'solid-js';
import {Portal} from 'solid-js/web';
import type AppSelectPeers from '@components/appSelectPeers';
import Button from '@components/buttonTsx';
import useCommunityTabGuard
from '@components/communities/useCommunityTabGuard';
import Section from '@components/section';
import createMiddleware from '@helpers/solid/createMiddleware';
import {i18n} from '@lib/langPack';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppRemovedUsersTab} from '@components/solidJsTabs/tabs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import createChatRemovedUsersSource from './chatRemovedUsersSource';
import createCommunityRemovedUsersSource
from './communityRemovedUsersSource';
import {
  isRemovedParticipant,
  type RemovedUsersSource
} from './removedUsersSource';

const RemovedUsers: Component = () => {
  const [tab] = useSuperTab<typeof AppRemovedUsersTab>();
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
  const [source, setSource] = createSignal<RemovedUsersSource>();
  const [selector, setSelector] = createSignal<AppSelectPeers>();
  const [captionElement, setCaptionElement] =
    createSignal<HTMLDivElement>();
  onCleanup(() => {
    tab.container.classList.remove(
      'edit-peer-container',
      'removed-users-container'
    );
    selector()?.container?.remove();
  });

  createEffect(() => {
    const currentSelector = selector();
    const element = captionElement();
    if(currentSelector && element) {
      currentSelector.scrollable.container.insertBefore(
        element,
        currentSelector.heightContainer
      );
    }
  });

  promiseCollector.collect((async() => {
    const removedUsersSource = communityId === undefined ?
      await createChatRemovedUsersSource({tab, chatId, middleware}) :
      await createCommunityRemovedUsersSource({
        tab,
        communityId,
        middleware
      });
    if(!middleware()) {
      return;
    }

    tab.container.classList.add(
      'edit-peer-container',
      'removed-users-container'
    );
    const selectorResult = removedUsersSource.createSelector({
      appendTo: tab.content,
      managers: tab.managers,
      middleware,
      getSubtitleForElement: async(participantId: PeerId) => {
        const participant = selector()?.participants.get(participantId);
        if(!isRemovedParticipant(participant)) {
          return;
        }

        return i18n('UserRemovedBy', [
          await wrapPeerTitle({
            peerId: participant.kicked_by.toPeerId(false)
          })
        ]);
      }
    });
    setSelector(selectorResult.selector);
    selectorResult.selector.scrollable.container.querySelector(
      '.gradient-delimiter'
    )?.remove();
    removedUsersSource.attachSelectorBehavior(selectorResult.selector);
    setSource(removedUsersSource);

    await selectorResult.loadPromise;
  })());

  return (
    <>
      <Portal mount={tab.content}>
        <Show when={source()?.canChangePermissions}>
          <Button.Corner
            class="is-visible"
            icon="addmember_filled"
            aria-label={i18n('RemovedUsers').textContent}
            tabIndex={0}
            onClick={() => source()?.openAddParticipant()}
          />
        </Show>
      </Portal>

      <Show when={source()}>
        {(source) => (
          <Show when={selector()}>
            {(selector) => (
              <Portal mount={selector().scrollable.container}>
                <Section
                  ref={setCaptionElement}
                  noContent
                  caption={source().caption}
                />
              </Portal>
            )}
          </Show>
        )}
      </Show>
    </>
  );
};

export default RemovedUsers;
