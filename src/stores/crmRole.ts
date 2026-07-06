import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';

// Whether the signed-in CRM agent has the superadmin role. Defaults to false,
// so role-gated UI (active sessions, phone numbers, contacts) stays hidden for
// everyone — including agents without a CRM session — until the CRM confirms
// the role. Kept fresh by AppCrmManager.refreshMe() on app start + login; every
// persist() there fires crm_config_update, which re-reads the flag here.
const [isCrmSuperAdmin, setIsCrmSuperAdmin] = createRoot(() => createSignal(false));

const refresh = () => {
  rootScope.managers.appCrmManager.getConfig().then((config) => {
    setIsCrmSuperAdmin(!!(config.enabled && config.token && config.user?.is_super_admin));
  }, () => setIsCrmSuperAdmin(false));
};

rootScope.addEventListener('crm_config_update', refresh);
rootScope.addEventListener('crm_auth_required', refresh);
if(rootScope.myId) {
  refresh();
} else {
  rootScope.addEventListener('user_auth', refresh);
}

export default function useIsCrmSuperAdmin() {
  return isCrmSuperAdmin;
}
