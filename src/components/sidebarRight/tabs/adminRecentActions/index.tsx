import {batch, createComputed, createMemo, createResource, createSelector, createSignal, ErrorBoundary, onMount, Show} from 'solid-js';
import {Dynamic, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import lastItem from '@helpers/array/lastItem';
import {keepMe} from '@helpers/keepMe';
import liteMode from '@helpers/liteMode';
import asyncThrottle from '@helpers/schedulers/asyncThrottle';
import debounce from '@helpers/schedulers/debounce';
import pause from '@helpers/schedulers/pause';
import {createSetSignal} from '@helpers/solid/createSetSignal';
import {AdminLog} from '@appManagers/appChatsManager';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {setAppSettings} from '@stores/appSettings';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {DynamicVirtualList} from '@components/dynamicVirtualList';
import ripple from '@components/ripple';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '@components/solidJsTabs/tabs';
import {limitPeerTitleSymbols} from '@components/sidebarRight/tabs/adminRecentActions/constants';
import {ExpandToggleButton} from '@components/sidebarRight/tabs/adminRecentActions/expandToggleButton';
import {CommittedFilters, Filters} from '@components/sidebarRight/tabs/adminRecentActions/filters';
import {groupToIconMap, resolveLogEntry} from '@components/sidebarRight/tabs/adminRecentActions/logEntriesResolver';
import {LogEntry} from '@components/sidebarRight/tabs/adminRecentActions/logEntry';
import {NoActionsPlaceholder} from '@components/sidebarRight/tabs/adminRecentActions/noActionsPlaceholder';
import styles from '@components/sidebarRight/tabs/adminRecentActions/styles.module.scss';
import {useParticipantClickHandler} from '@components/sidebarRight/tabs/adminRecentActions/utils';

keepMe(ripple);


const fetchLimit = 30; // we don't care if it doesn't fill the viewport, it will refetch immediately anyway
const fetchThrottleTimeout = 200;
const maxBatchSize = 20;
const itemSizeEstimate = 70;
const itemSizeEstimateExpanded = 120;
const animateInDuration = 200;
const staggerDelay = 20;
const staggerDelayExpanded = 50;
const reAnimateDelay = 120;
const thumbUpdateDebounceTimeout = 100;

const testEmpty = 0;

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy, appImManager, ChatType} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  let shouldAnimateIn = true,
    isQueuedUnsettingShouldAnimate = false,
    isFirstAnimation = true,
    reachedTheEnd = false,
    savedScrollTop = 0;

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);
  const [committedFilters, setCommittedFilters] = createSignal<CommittedFilters | null>(null);
  const [cachedAreAllExpanded, setCachedAreAllExpanded] = createSignal(true);
  const [toggledLogs, setToggledLogs] = createSetSignal<AdminLog>();

  const [logs, setLogs] = createSignal<AdminLog[]>([]);

  // const fetchLogs = async(offsetId?: AdminLog['id']) => offsetId ? [] : [...Array.from({length: 1}, () => [...savedLogs.slice(0, 12).map(o => ({...o}))])].flat()
  // const fetchLogs = async(offsetId?: AdminLog['id']) => offsetId ? [] : [...Array.from({length: 400}, () => [...savedLogs.map(o => ({...o}))])].flat()

  const fetchLogs = (offsetId?: AdminLog['id']) =>
    rootScope.managers.appChatsManager.getAdminLogs({
      channelId: tab.payload.channelId,
      search: committedFilters()?.search,
      admins: committedFilters()?.admins,
      flags: committedFilters()?.flags,
      limit: fetchLimit,
      offsetId
    }).then(({items}) => items);

  // for loading state, then we're fetching more as the user scrolls
  const [initialLogs] = createResource(() => committedFilters() || {}, () =>
    testEmpty ?
      pause(testEmpty).then(() => [] as AdminLog[]) :
      fetchLogs()
  );

  const areAllExpanded = createMemo(() => cachedAreAllExpanded() && !toggledLogs().size);

  const isExpanded = createSelector(
    () => [cachedAreAllExpanded(), toggledLogs()] as const,
    (log: AdminLog, [cachedAreAllExpanded, toggledLogs]) => {
      return cachedAreAllExpanded ? !toggledLogs.has(log) : toggledLogs.has(log)
    }
  );

  createComputed(() => {
    shouldAnimateIn = true;
    isQueuedUnsettingShouldAnimate = false;
    reachedTheEnd = false;

    batch(() => {
      setLogs(initialLogs() || []);
      setToggledLogs(new Set<AdminLog>);
    });
    savedScrollTop = tab.scrollable.container.scrollTop;
    tab.scrollable.container.scrollTop = 0;
  });

  const fetchMore = asyncThrottle(async() => {
    if(initialLogs.loading || reachedTheEnd) return;

    const lastLog = lastItem(logs());
    if(!lastLog) return; // empty list

    const newLogs = await fetchLogs(lastLog.id);
    if(!newLogs.length) {
      reachedTheEnd = true;
      return;
    }

    const newLogsIds = new Set(newLogs.map(log => String(log.id)));

    setLogs([
      ...logs().filter(log => !newLogsIds.has(String(log.id))), // just in case
      ...newLogs
    ]);
  }, fetchThrottleTimeout);

  const updateThumb = debounce(() => {
    tab.scrollable.updateThumb();
  }, thumbUpdateDebounceTimeout)

  const onAllToggle = () => {
    const value = areAllExpanded();
    batch(() => {
      setCachedAreAllExpanded(!value);
      setToggledLogs(new Set<AdminLog>);
    });
  };

  const onToggle = (log: AdminLog) => {
    batch(() => {
      setToggledLogs(prev => {
        const set = new Set(prev);
        set.has(log) ? set.delete(log) : set.add(log);
        return set;
      });
      if(toggledLogs().size === logs().length) {
        setCachedAreAllExpanded(!cachedAreAllExpanded());
        setToggledLogs(new Set<AdminLog>);
      }
    });
  };

  const onChatView = () => {
    setAppSettings('logsDiffView', false);
    tab.close();
    appImManager.setInnerPeer({
      peerId: tab.payload.channelId.toPeerId(true),
      type: ChatType.Logs
    });
  };

  const onNearBottom = () => {
    fetchMore();
    updateThumb();
  };

  return <>
    <Portal mount={tab.header}>
      <div class={styles.IconsFlex}>
        <Transition name='fade' mode='outin'>
          <Show when={logs().length}>
            <ExpandToggleButton expanded={areAllExpanded()} onClick={onAllToggle} />
          </Show>
        </Transition>
        <Transition name='fade' mode='outin'>
          <Show when={logs().length || committedFilters()}>
            <ButtonIconTsx icon='filter' onClick={() => setIsFiltersOpen(!isFiltersOpen())} />
          </Show>
        </Transition>
        <ButtonIconTsx icon='message' onClick={onChatView} />
      </div>
    </Portal>
    <Portal mount={tab.content}>
      <Filters
        channelId={tab.payload.channelId}
        isBroadcast={tab.payload.isBroadcast}
        open={isFiltersOpen()}
        onClose={() => setIsFiltersOpen(false)}
        committedFilters={committedFilters()}
        onCommit={setCommittedFilters}
      />
    </Portal>

    <Transition
      name='fade-2'
      onExit={(_el, done) => {
        const el = _el as HTMLElement;
        el.classList.add(styles.absolute);
        el.style.transform = `translateY(${-savedScrollTop}px)`;
        pause(200).then(done);
      }}
      onAfterExit={() => {
        tab.scrollable.updateThumb();
      }}
    >
      <Show when={initialLogs.state === 'ready' && initialLogs()?.length === 0}>
        <NoActionsPlaceholder forFilters={!!committedFilters()} />
      </Show>
      <Show keyed when={logs().length ? initialLogs() : false}>
        <DynamicVirtualList
          list={logs()}
          measureElementHeight={(el: HTMLDivElement) => el.offsetHeight}
          estimateItemHeight={() => cachedAreAllExpanded() ? itemSizeEstimateExpanded : itemSizeEstimate}
          maxBatchSize={maxBatchSize}
          scrollable={tab.scrollable.container}
          onNearBottom={onNearBottom}
          verticalPadding={8}
          renderAtLeastFromBottom={({clientHeight}) => Math.ceil((clientHeight / itemSizeEstimate))}
          Item={(props) => {
            let ref: HTMLDivElement;

            const log = createMemo(() => props.payload);

            const entry = createMemo(() => resolveLogEntry({
              channelId: tab.payload.channelId,
              event: log(),
              isBroadcast: tab.payload.isBroadcast,
              isForum
            }));

            const areAnimationsAvailable = liteMode.isAvailable('animations');

            const [forceHide, setForceHide] = createSignal(areAnimationsAvailable && shouldAnimateIn);

            if(shouldAnimateIn && areAnimationsAvailable) {
              onMount(() => {
                ref?.animate({
                  opacity: [0, 1],
                  transform: ['translateY(-4px)', 'translateY(0)']
                }, {
                  duration: animateInDuration,
                  delay: props.idx * (cachedAreAllExpanded() ? staggerDelayExpanded : staggerDelay) + (!isFirstAnimation ? reAnimateDelay : 0)
                }).finished
                .then(() => {
                  setForceHide(false);
                });
              });

              if(!isQueuedUnsettingShouldAnimate) {
                isQueuedUnsettingShouldAnimate = true;
                queueMicrotask(() => {
                  shouldAnimateIn = false;
                  isFirstAnimation = false;
                });
              }
            }

            return (
              <div
                ref={(el) => {
                  ref = el;
                  if(props.ref instanceof Function) props.ref(el);
                }}
                class={styles.Item}
                classList={{[styles.hidden]: forceHide() || props.isMeasuring}}
                style={{
                  '--top': `${props.offset}px`,
                  '--translation': `${props.translation}px`
                }}
              >
                <Show when={entry()}>
                  <LogEntry
                    peerTitle={<PeerTitleTsx peerId={log().user_id.toPeerId()} limitSymbols={limitPeerTitleSymbols} />}
                    message={<Dynamic component={entry().Message} />}
                    date={new Date(log().date * 1000)}
                    icon={groupToIconMap[entry().group]}
                    onExpandedChange={() => onToggle(log())}
                    expanded={isExpanded(log())}
                    expandableContent={entry().ExpandableContent && (
                      <ErrorBoundary fallback={<></>}>
                        <Dynamic component={entry().ExpandableContent} />
                      </ErrorBoundary>
                    )}
                    onPeerTitleClick={useParticipantClickHandler(log().user_id.toPeerId())}
                  />
                </Show>
              </div>
            )
          }}
        />
      </Show>
    </Transition>
  </>;
};


export default AdminRecentActionsTab;
