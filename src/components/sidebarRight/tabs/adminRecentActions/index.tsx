import {createComputed, createMemo, createResource, createSignal, mapArray, onMount, Show} from 'solid-js';
import {Dynamic, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import lastItem from '../../../../helpers/array/lastItem';
import {keepMe} from '../../../../helpers/keepMe';
import asyncThrottle from '../../../../helpers/schedulers/asyncThrottle';
import pause from '../../../../helpers/schedulers/pause';
import {AdminLog} from '../../../../lib/appManagers/appChatsManager';
import {logger} from '../../../../lib/logger';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {ButtonIconTsx} from '../../../buttonIconTsx';
import {DynamicVirtualList} from '../../../dynamicVirtualList';
import ripple from '../../../ripple';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import {ExpandToggleButton} from './expandToggleButton';
import {CommittedFilters, Filters} from './filters';
import {resolveLogEntry} from './logEntriesResolver';
import {LogEntry} from './logEntry';
import {NoActionsPlaceholder} from './noActionsPlaceholder';
import styles from './styles.module.scss';

keepMe(ripple);


const fetchLimit = 20; // we don't care if it doesn't fill the viewport, it will rerun anyway
const fetchThrottleTimeout = 200;
const maxBatchSize = 20;
const itemSizeEstimate = 150;
const animateInDuration = 200;
const staggerDelay = 40;

const testEmpty = 0;

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  let shouldAnimateIn = true, isQueuedUnsettingShouldAnimate = false, reachedTheEnd = false;

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);
  const [committedFilters, setCommittedFilters] = createSignal<CommittedFilters | null>(null);

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

  const areAllExpanded = createMemo(() => itemStates().every(item => item.expanded()));

  createComputed(() => {
    shouldAnimateIn = true;
    isQueuedUnsettingShouldAnimate = false;
    reachedTheEnd = false;

    setLogs(initialLogs() || []);
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
    itemStates().forEach(item => void item.setExpanded(!value));
  };


  return <>
    <Portal mount={tab.header}>
      <Transition name='fade'>
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
          estimateItemHeight={() => itemSizeEstimate}
          maxBatchSize={maxBatchSize}
          scrollable={tab.scrollable.container}
          onNearBottom={fetchMore}
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
                }, {duration: animateInDuration, delay: props.idx * staggerDelay}).finished
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
                    icon='clipboard'
                    expanded={item().expanded()}
                    onExpandedChange={(value) => item().setExpanded(value)}
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
