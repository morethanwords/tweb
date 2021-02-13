import { MOUNT_CLASS_TO } from '../config/debug';
import type { State } from './appManagers/appStateManager';
import AppStorage from './storage';

const sessionStorage = new AppStorage<{
  dc: number,
  user_auth: number,
  dc1_auth_key: any,
  dc2_auth_key: any,
  dc3_auth_key: any,
  dc4_auth_key: any,
  dc5_auth_key: any,
  max_seen_msg: number,
  server_time_offset: number,

  chatPositions: {
    [peerId_threadId: string]: {
      mid: number, 
      top: number
    }
  },
} & State>({
  storeName: 'session'
});
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStorage = sessionStorage);
export default sessionStorage;
