import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
import AppStorage from './storage';
import { State } from './appManagers/appStateManager';

const sessionStorage = new AppStorage<{
  dc: number,
  user_auth: number,
  dc1_auth_key: any,
  dc2_auth_key: any,
  dc3_auth_key: any,
  dc4_auth_key: any,
  dc5_auth_key: any,
  max_seen_msg: number,
  server_time_offset: number
} & State>({
  storeName: 'session'
});
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStorage = sessionStorage);
export default sessionStorage;
