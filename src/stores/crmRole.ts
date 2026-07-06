import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';

// CRM session state for the signed-in agent, exposed as two default-false
// signals so every gate fails closed until the CRM confirms otherwise:
// - isCrmLoggedIn: the agent has a live CRM session (enabled + baseUrl + token).
//   Drives the chatlist gate — no conversations are shown without a session.
// - isCrmSuperAdmin: the session's user has the superadmin role. Gates the
//   sensitive extras (active sessions, phone numbers, usernames, contacts).
// Kept fresh by AppCrmManager.refreshMe() on app start + login; every persist()
// there fires crm_config_update, which re-reads both flags here. A 401 fires
// crm_auth_required, flipping both back to false.
const [isCrmLoggedIn, setIsCrmLoggedIn] = createRoot(() => createSignal(false));
const [isCrmSuperAdmin, setIsCrmSuperAdmin] = createRoot(() => createSignal(false));

const refresh = () => {
  rootScope.managers.appCrmManager.getConfig().then((config) => {
    const loggedIn = !!(config.enabled && config.baseUrl && config.token);
    setIsCrmLoggedIn(loggedIn);
    setIsCrmSuperAdmin(loggedIn && !!config.user?.is_super_admin);
  }, () => {
    setIsCrmLoggedIn(false);
    setIsCrmSuperAdmin(false);
  });
};

rootScope.addEventListener('crm_config_update', refresh);
rootScope.addEventListener('crm_auth_required', refresh);
if(rootScope.myId) {
  refresh();
} else {
  rootScope.addEventListener('user_auth', refresh);
}

export function useIsCrmLoggedIn() {
  return isCrmLoggedIn;
}

export default function useIsCrmSuperAdmin() {
  return isCrmSuperAdmin;
}
