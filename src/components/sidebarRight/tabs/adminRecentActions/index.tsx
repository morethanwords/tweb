import {batch, createComputed, createMemo, createResource, createSelector, createSignal, mapArray, onMount, Show} from 'solid-js';
import {Dynamic, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import lastItem from '../../../../helpers/array/lastItem';
import {keepMe} from '../../../../helpers/keepMe';
import asyncThrottle from '../../../../helpers/schedulers/asyncThrottle';
import pause from '../../../../helpers/schedulers/pause';
import {AdminLog} from '../../../../lib/appManagers/appChatsManager';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {ButtonIconTsx} from '../../../buttonIconTsx';
import {DynamicVirtualList} from '../../../dynamicVirtualList';
import ripple from '../../../ripple';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import {ExpandToggleButton} from './expandToggleButton';
import {CommittedFilters, Filters} from './filters';
import {groupToIconMap, resolveLogEntry} from './logEntriesResolver';
import {LogEntry} from './logEntry';
import {NoActionsPlaceholder} from './noActionsPlaceholder';
import styles from './styles.module.scss';
import {createSetSignal} from '../../../../helpers/solid/createSetSignal';

keepMe(ripple);


const fetchLimit = 30; // we don't care if it doesn't fill the viewport, it will refetch immediately anyway
const fetchThrottleTimeout = 200;
const maxBatchSize = 20;
const itemSizeEstimate = 70;
const itemSizeEstimateExpanded = 120;
const animateInDuration = 200;
const staggerDelay = 10;
const staggerDelayExpanded = 40;

const testEmpty = 0;

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  let shouldAnimateIn = true, isQueuedUnsettingShouldAnimate = false, reachedTheEnd = false;

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);
  const [committedFilters, setCommittedFilters] = createSignal<CommittedFilters | null>(null);
  const [cachedAreAllExpanded, setCachedAreAllExpanded] = createSignal(true);
  const [toggledLogs, setToggledLogs] = createSetSignal<AdminLog>();

  const [logs, setLogs] = createSignal<AdminLog[]>([]);

  const fetchLogs = (offsetId?: AdminLog['id']) => committedFilters() ?
    rootScope.managers.appChatsManager.fetchAdminLogs({
      channelId: tab.payload.channelId,
      limit: fetchLimit,
      admins: committedFilters()?.admins,
      flags: committedFilters()?.flags,
      offsetId
    }) :
    rootScope.managers.appChatsManager.getAdminLogs({
      channelId: tab.payload.channelId,
      limit: fetchLimit,
      offsetId
    });

  // for loading state, then we're fetching more as the user scrolls
  const [initialLogs, initialLogsActions] = createResource(() => committedFilters() || {}, () =>
    testEmpty ?
      pause(testEmpty).then(() => [] as AdminLog[]) :
      fetchLogs()
  );

  const itemStatesRaw = mapArray(() => logs() || [], log => {
    const [expanded, setExpanded] = createSignal(true);

    return {
      log,
      expanded,
      setExpanded
    }
  });

  const itemStates = createMemo(() => itemStatesRaw());

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
    tab.scrollable.container.scrollTop = 0;
  });

  const fetchMore = asyncThrottle(async() => {
    if(initialLogs.loading) return;

    const lastLog = lastItem(logs());
    if(!lastLog) return; // empty list

    const newLogs = await fetchLogs(lastLog.id)
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

  const onAllToggle = () => {
    const value = areAllExpanded();
    batch(() => {
      setCachedAreAllExpanded(!value);
      setToggledLogs(new Set<AdminLog>);
    });
  };

  return <>
    <Portal mount={tab.header}>
      <Transition name='fade' mode='outin'>
        <Show when={logs().length || committedFilters()}>
          <div class={styles.IconsFlex}>
            <Transition name='fade'>
              <Show when={logs().length}>
                <ExpandToggleButton expanded={areAllExpanded()} onClick={onAllToggle} />
              </Show>
            </Transition>
            <ButtonIconTsx icon='filter' onClick={() => setIsFiltersOpen(!isFiltersOpen())} />
          </div>
        </Show>
      </Transition>
    </Portal>
    <Portal mount={tab.content}>
      <Filters
        channelId={tab.payload.channelId}
        open={isFiltersOpen()}
        onClose={() => setIsFiltersOpen(false)}
        committedFilters={committedFilters()}
        onCommit={setCommittedFilters}
      />
    </Portal>

    <Transition name='fade-2'>
      <Show when={initialLogs.state === 'ready' && initialLogs()?.length === 0}>
        <NoActionsPlaceholder forFilters={!!committedFilters()} />
      </Show>
      <Show keyed when={itemStates().length ? initialLogs() : false}>
        <DynamicVirtualList
          list={itemStates()}
          measureElementHeight={(el: HTMLDivElement) => el.offsetHeight}
          estimateItemHeight={() => cachedAreAllExpanded() ? itemSizeEstimateExpanded : itemSizeEstimate}
          maxBatchSize={maxBatchSize}
          scrollable={tab.scrollable.container}
          onNearBottom={fetchMore}
          verticalPadding={8}
          Item={(props) => {
            let ref: HTMLDivElement;

            const item = createMemo(() => props.payload);
            const log = createMemo(() => item().log);

            const entry = createMemo(() => resolveLogEntry({event: log(), isBroadcast: tab.payload.isBroadcast, isForum}));

            const [forceHide, setForceHide] = createSignal(shouldAnimateIn);

            if(shouldAnimateIn) {
              onMount(() => {
                ref?.animate({
                  opacity: [0, 1],
                  transform: ['translateY(-4px)', 'translateY(0)']
                }, {
                  duration: animateInDuration,
                  delay: props.idx * (cachedAreAllExpanded() ? staggerDelayExpanded : staggerDelay)
                }).finished
                .then(() => {
                  setForceHide(false);
                });
              });

              if(!isQueuedUnsettingShouldAnimate) {
                isQueuedUnsettingShouldAnimate = true;
                queueMicrotask(() => {
                  shouldAnimateIn = false;
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
                    peerTitle={<PeerTitleTsx peerId={log().user_id.toPeerId()} />}
                    message={<Dynamic component={entry().Message} />}
                    date={new Date(log().date * 1000)}
                    icon={groupToIconMap[entry().group]}
                    expanded={isExpanded(log())}
                    onExpandedChange={() => setToggledLogs(prev => {
                      const set = new Set(prev);
                      set.has(log()) ? set.delete(log()) : set.add(log());
                      return set;
                    })}
                    expandableContent={entry().ExpandableContent && <Dynamic component={entry().ExpandableContent} />}
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
