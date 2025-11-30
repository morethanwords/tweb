import {createEffect, createMemo, createResource, createSignal, mapArray, Show} from 'solid-js';
import {Dynamic, Portal} from 'solid-js/web';
import {logger} from '../../../../lib/logger';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {ButtonIconTsx} from '../../../buttonIconTsx';
import {DynamicVirtualList} from '../../../dynamicVirtualList';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import Space from '../../../space';
import {Filters} from './filters';
import {resolveLogEntry} from './logEntriesResolver';
import {LogEntry} from './logEntry';
import {savedLogs} from './savedLogs';
import styles from './styles.module.scss';


const log = logger('AdminRecentActionsTab');

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const [isFiltersOpen, setIsFiltersOpen] = createSignal(false);

  const [logs] = createResource(async() => {
    return [...Array.from({length: 10})].flatMap(() => savedLogs);
    // const startTime = performance.now();
    // const result = await rootScope.managers.appChatsManager.getAdminLogs({channelId: tab.payload.channelId})
    // const endTime = performance.now();

    // log(`getAdminLogs took ${endTime - startTime}ms`);

    // return result;
  });
  const itemsRaw = mapArray(() => logs() || [], log => {
    const [expanded, setExpanded] = createSignal(true);

    return {
      log,
      expanded,
      setExpanded
    }
  });

  const items = createMemo(() => itemsRaw());

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  createEffect(() => {
    console.log('logs :>> ', logs());
  });

  const onAllToggle = () => {
    const areAllExpanded = items().every(item => item.expanded());
    items().forEach(item => void item.setExpanded(!areAllExpanded));
  }

  return <>
    <Portal mount={tab.header}>
      <div class={styles.IconsFlex}>
        <ButtonIconTsx icon='down_up' onClick={onAllToggle} />
        <ButtonIconTsx icon='filter' onClick={() => setIsFiltersOpen(!isFiltersOpen())} />
      </div>
    </Portal>
    <Portal mount={tab.content}>
      <Filters channelId={tab.payload.channelId} open={isFiltersOpen()} />
    </Portal>
    <Space amount='6px' />
    <DynamicVirtualList
      list={items()}
      measureElementHeight={(el: HTMLDivElement) => el.offsetHeight}
      estimateItemHeight={() => 100}
      maxBatchSize={20}
      scrollable={tab.scrollable.container}
      Item={(props) => {
        const item = createMemo(() => props.payload);
        const log = createMemo(() => item().log);

        const entry = () => resolveLogEntry({event: log(), isBroadcast: tab.payload.isBroadcast, isForum});

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
