import {createEffect, createResource, For} from 'solid-js';
import {logger} from '../../../../lib/logger';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import {resolveLogEntry} from './logEntriesResolver';
import {LogEntry} from './logEntry';


const log = logger('AdminRecentActionsTab');

const AdminRecentActionsTab = () => {
  const {rootScope, PeerTitleTsx, apiManagerProxy} = useHotReloadGuard();
  const [tab] = useSuperTab<typeof AppAdminRecentActionsTab>();

  const [logs] = createResource(async() => {
    const startTime = performance.now();
    const result = await rootScope.managers.appChatsManager.getAdminLogs({channelId: tab.payload.channelId})
    const endTime = performance.now();

    log(`getAdminLogs took ${endTime - startTime}ms`);

    return result;
  });

  const isForum = apiManagerProxy.isForum(tab.payload.channelId.toPeerId(true));

  createEffect(() => {
    console.log('logs :>> ', logs());
  });

  return (
    <For each={logs() || []}>
      {(log) => {
        const entry = resolveLogEntry({event: log, isBroadcast: tab.payload.isBroadcast, isForum});
        const {Message, ExpandableContent} = entry;
        if(!entry) return null;

        return (
          <div style={{padding: '6px 12px'}}>
            <LogEntry
              peerTitle={<PeerTitleTsx peerId={log.user_id.toPeerId()} />}
              // peerTitle={'lsdfkj alsdfj alskdjf alskdjf alsdkfj alsdkfja lsdkjf asldfj'}
              // message={'Chnaged the title from This to That and edited some messages'}
              message={<Message />}
              date={new Date(log.date * 1000)}
              icon='clipboard'
              expandableContent={ExpandableContent && <ExpandableContent />}
            // expandableContent={<div>
            // lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            // </div>}
            />
          </div>
        )
      }}
    </For>
  );
};


export default AdminRecentActionsTab;
