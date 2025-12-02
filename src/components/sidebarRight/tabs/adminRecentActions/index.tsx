import {createComputed, createEffect, createMemo, createResource, createSignal, mapArray, onMount, Show} from 'solid-js';
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
import {Filters} from './filters';
import {resolveLogEntry} from './logEntriesResolver';
import {LogEntry} from './logEntry';
import {NoActionsPlaceholder} from './noActionsPlaceholder';
import styles from './styles.module.scss';

keepMe(ripple);


const log = logger('AdminRecentActionsTab');

const fetchLimit = 20; // we don't care if it doesn't fill the viewport, it will rerun anyway
const fetchThrottleTimeout = 200;
const maxBatchSize = 20;
const itemSizeEstimate = 150;

const testEmpty = 0;

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);

  const [logs, setLogs] = createSignal<AdminLog[]>([]);

  // for loading state, then we're fetching more as the user scrolls
  const [initialLogs] = createResource(() =>
    testEmpty ?
    pause(testEmpty).then(() => [] as AdminLog[]) :
    rootScope.managers.appChatsManager.getAdminLogs({
      channelId: tab.payload.channelId,
      limit: fetchLimit
    })
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
    setLogs(initialLogs());
  });

  // TODO: remove console.log
  createEffect(() => {
    console.log('logs :>> ', logs());
  });

  const fetchMore = asyncThrottle(async() => {
    if(initialLogs.loading) return;

    const lastLog = lastItem(logs());
    if(!lastLog) return; // empty list

    const newLogs = await rootScope.managers.appChatsManager.getAdminLogs({channelId: tab.payload.channelId, limit: fetchLimit, offsetId: lastLog?.id});
    if(!newLogs.length) return;

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

  let isFirst = true, queuedUnsettingIsFirst = false;

  return <>
    <Portal mount={tab.header}>
      <Transition name='fade'>
        <Show when={logs()?.length}>
          <div class={styles.IconsFlex}>
            <ExpandToggleButton expanded={areAllExpanded()} onClick={onAllToggle} />
            <ButtonIconTsx icon='filter' onClick={() => setIsFiltersOpen(!isFiltersOpen())} />
          </div>
        </Show>
      </Transition>
    </Portal>
    <Portal mount={tab.content}>
      <Filters channelId={tab.payload.channelId} open={isFiltersOpen()} />
    </Portal>

    <Transition name='fade'>
      <Show when={initialLogs.state === 'ready' && initialLogs()?.length === 0}>
        <NoActionsPlaceholder />
      </Show>
    </Transition>


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

        const [forceHide, setForceHide] = createSignal(isFirst);

        if(isFirst) {
          onMount(() => {
            ref?.animate({
              opacity: [0, 1],
              transform: ['translateY(-4px)', 'translateY(0)']
            }, {duration: 160, delay: props.idx * 40}).finished
            .then(() => {
              setForceHide(false);
            });
          });

          if(!queuedUnsettingIsFirst) {
            queuedUnsettingIsFirst = true;
            queueMicrotask(() => {
              isFirst = false;
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
  </>;
};


export default AdminRecentActionsTab;
