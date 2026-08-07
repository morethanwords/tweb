import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show
} from 'solid-js';
import {Portal} from 'solid-js/web';
import Button from '@components/buttonTsx';
import {
  CommunityPendingRequestRow,
  showCommunityRequestError
} from '@components/communities/communityPendingRequest';
import createCommunityPendingRequestActions
from '@components/communities/communityPendingRequestActions';
import confirmationPopup from '@components/confirmationPopup';
import Section from '@components/section';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {toastNew} from '@components/toast';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n} from '@lib/langPack';
import {
  useCommunity,
  useCommunityPeerLinkRequests
} from '@stores/communities';
import {
  AppCommunityPendingRequestsTab,
  AppEditCommunityTab
} from '@components/solidJsTabs/tabs';
import styles from '@components/communities/communityManagement.module.scss';
import useCommunityTabGuard from '@components/communities/useCommunityTabGuard';

export default function CommunityPendingRequests() {
  const [tab] = useSuperTab<typeof AppCommunityPendingRequestsTab>();
  const promiseCollector = usePromiseCollector();
  const {communityId} = tab.payload;
  useCommunityTabGuard(tab, communityId);
  const community = useCommunity(() => communityId);
  const state = useCommunityPeerLinkRequests(() => communityId);
  const [bulkWorking, setBulkWorking] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);
  const actions = createCommunityPendingRequestActions({
    apply: (request, reject) => {
      return tab.managers.appCommunitiesManager
      .togglePeerLinkRequestApproval({
        communityId,
        peerId: getPeerId(request.peer),
        reject
      });
    },
    onError: (error, request) => {
      return showCommunityRequestError({
        error,
        managers: tab.managers,
        peerId: getPeerId(request.peer)
      });
    }
  });
  const visibleRequests = createMemo(() => {
    const staged = actions.stagedPeerIds();
    return (state()?.requests || []).filter((request) => {
      return !staged.has(getPeerId(request.peer));
    });
  });
  const totalCount = () => state()?.totalCount || visibleRequests().length;
  const onlyAdminsCanAdd = () => {
    const value = community();
    return value?._ === 'community' &&
      !!value.default_banned_rights?.pFlags.manage_linked_peers;
  };
  let loadMoreSentinel: HTMLDivElement;

  const loadInitial = async() => {
    setRetrying(true);
    try {
      await tab.managers.appCommunitiesManager
      .getPeerLinkRequests({communityId});
      setLoadFailed(false);
    } catch(error) {
      console.error('load community requests error', error);
      setLoadFailed(true);
      toastNew({langPackKey: 'Community.RequestsLoadFailed'});
    } finally {
      setRetrying(false);
    }
  };
  const initialLoad = loadInitial();
  promiseCollector.collect(initialLoad);
  let hadLoadedState = !!state()?.loaded;
  createEffect(() => {
    const loaded = !!state()?.loaded;
    if(hadLoadedState && !loaded && !retrying()) {
      void loadInitial();
    }
    hadLoadedState = loaded;
  });

  const applyAll = async(reject: boolean) => {
    if(bulkWorking()) {
      return;
    }

    const count = totalCount();
    try {
      await confirmationPopup({
        titleLangKey: reject ?
          'Community.DeclineAllRequests' :
          'Community.AddAllRequests',
        descriptionLangKey: reject ?
          'Community.DeclineAllRequestsConfirm' :
          'Community.AddAllRequestsConfirm',
        descriptionLangArgs: [count],
        button: {
          langKey: reject ? 'Decline' : 'Add',
          isDanger: reject
        }
      });
    } catch{
      return;
    }

    setBulkWorking(true);
    try {
      await actions.flush();
      await tab.managers.appCommunitiesManager
      .toggleAllPeerLinkRequestApproval(communityId, reject);
      tab.close();
      toastNew({
        langPackKey: reject ?
          'Community.RequestsDeclined' :
          'Community.RequestsAdded',
        langPackArguments: [count]
      });
    } catch(error) {
      await showCommunityRequestError({
        error: error as ApiError,
        managers: tab.managers
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const loadMore = async() => {
    const nextOffset = state()?.nextOffset;
    if(!nextOffset || loadingMore()) {
      return;
    }

    setLoadingMore(true);
    try {
      await tab.managers.appCommunitiesManager.getPeerLinkRequests({
        communityId,
        offset: nextOffset
      });
    } catch(error) {
      console.error('load more community requests error', error);
      toastNew({langPackKey: 'Community.RequestsLoadFailed'});
    } finally {
      setLoadingMore(false);
    }
  };

  createEffect(() => {
    const nextOffset = state()?.nextOffset;
    if(!nextOffset || !loadMoreSentinel || !window.IntersectionObserver) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, {
      root: tab.scrollable.container,
      rootMargin: '200px 0px'
    });
    observer.observe(loadMoreSentinel);
    onCleanup(() => observer.disconnect());
  });

  const openSettings = () => {
    const existingTab = tab.slider.getTab(AppEditCommunityTab);
    if(existingTab?.payload.communityId === communityId) {
      void tab.slider.closeTabsUntilTab(existingTab);
      return;
    }

    void tab.slider.createTab(AppEditCommunityTab).open({communityId});
  };
  const caption = (): HTMLElement => {
    if(!onlyAdminsCanAdd()) {
      return;
    }

    return (
      <span>
        {i18n('Community.PendingRequestsInfo')}
        {' '}
        <button
          type="button"
          class={styles.captionAction}
          onClick={openSettings}
        >
          {i18n('Community.ChangeSettings')}
        </button>
      </span>
    ) as HTMLElement;
  };

  createEffect(() => {
    tab.scrollable.container.classList.toggle(
      styles.bulkActionsScrollable,
      !!state()?.loaded && totalCount() > 0
    );
  });
  onCleanup(() => {
    tab.scrollable.container.classList.remove(styles.bulkActionsScrollable);
  });

  return (
    <>
      <div class={styles.root}>
        <Show when={loadFailed() && !state()?.loaded}>
          <Section>
            <div class={styles.empty}>
              {i18n('Community.RequestsLoadFailed')}
              <div class={styles.retryAction}>
                <Button
                  primaryTransparent
                  disabled={retrying()}
                  text="Community.Retry"
                  onClick={loadInitial}
                />
              </div>
            </div>
          </Section>
        </Show>

        <Show when={state()?.loaded}>
          <Section
            name={visibleRequests().length ?
              'Community.PendingRequestsCount' :
              undefined}
            nameArgs={[totalCount()]}
            caption={caption()}
            captionTop
          >
            <For each={visibleRequests()}>
              {(request) => (
                <CommunityPendingRequestRow
                  request={request}
                  disabled={bulkWorking()}
                  onApply={actions.stage}
                />
              )}
            </For>

            <Show when={!visibleRequests().length}>
              <div class={styles.empty}>
                {i18n('Community.NoPendingRequests')}
              </div>
            </Show>

            <div
              ref={loadMoreSentinel}
              class={styles.loadMoreSentinel}
              aria-hidden="true"
            />
          </Section>
        </Show>
      </div>

      <Show when={state()?.loaded && totalCount() > 0}>
        <Portal mount={tab.content}>
          <div class={styles.stickyBulkActions}>
            <Button
              class={`${styles.bulkAction} ${styles.bulkActionUppercase} ${styles.danger} text-bold`}
              primaryTransparent
              disabled={bulkWorking()}
              text="Community.DeclineAll"
              onClick={() => applyAll(true)}
            />
            <Button
              class={styles.bulkAction}
              primaryFilled
              disabled={bulkWorking()}
              text="Community.AddAll"
              onClick={() => applyAll(false)}
            />
          </div>
        </Portal>
      </Show>
    </>
  );
}
