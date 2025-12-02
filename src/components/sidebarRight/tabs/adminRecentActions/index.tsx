import {createComputed, createEffect, createMemo, createResource, createSignal, mapArray, Show} from 'solid-js';
import {Dynamic, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import lastItem from '../../../../helpers/array/lastItem';
import {keepMe} from '../../../../helpers/keepMe';
import asyncThrottle from '../../../../helpers/schedulers/asyncThrottle';
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

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);

  const [logs, setLogs] = createSignal<AdminLog[]>([]);

  // for loading state, then we're fetching more as the user scrolls
  const [initialLogs] = createResource(() => rootScope.managers.appChatsManager.getAdminLogs({
    channelId: tab.payload.channelId,
    limit: fetchLimit
  }));

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
      estimateItemHeight={() => 100}
      maxBatchSize={20}
      scrollable={tab.scrollable.container}
      onNearBottom={fetchMore}
      Item={(props) => {
        const item = createMemo(() => props.payload);
        const log = createMemo(() => item().log);

        const entry = createMemo(() => resolveLogEntry({event: log(), isBroadcast: tab.payload.isBroadcast, isForum}));

        return (
          <div
            ref={props.ref}
            class={styles.Item}
            classList={{[styles.hidden]: props.isMeasuring}}
            style={{
              '--top': `${props.offset}px`,
              '--translation': `${props.translation}px`
            }}
          >
            <Show when={entry()}>
              <LogEntry
                peerTitle={<PeerTitleTsx peerId={log().user_id.toPeerId()} />}
                // peerTitle={'lsdfkj alsdfj alskdjf alskdjf alsdkfj alsdkfja lsdkjf asldfj'}
                // message={'Chnaged the title from This to That and edited some messages'}
                message={<Dynamic component={entry().Message} />}
                date={new Date(log().date * 1000)}
                icon='clipboard'
                expanded={item().expanded()}
                onExpandedChange={(value) => item().setExpanded(value)}
                expandableContent={entry().ExpandableContent && <Dynamic component={entry().ExpandableContent} />}
              // expandableContent={<div>
              // lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              // </div>}
              />
            </Show>
          </div>
        )
      }}
    />
  </>;
};


export default AdminRecentActionsTab;
