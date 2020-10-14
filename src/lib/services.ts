console.log('Services included!');

import AppMediaViewer from '../components/appMediaViewer';
import AppSidebarLeft from '../components/sidebarLeft';
import AppSidebarRight from '../components/sidebarRight';
import ApiUpdatesManager from './appManagers/apiUpdatesManager';
import AppChatsManager from './appManagers/appChatsManager';
import AppDialogsManager from './appManagers/appDialogsManager';
import AppDocsManager from './appManagers/appDocsManager';
import AppImManager from './appManagers/appImManager';
import AppMessagesIDsManager from './appManagers/appMessagesIDsManager';
import AppMessagesManager from './appManagers/appMessagesManager';
import AppPeersManager from './appManagers/appPeersManager';
import AppPhotosManager from './appManagers/appPhotosManager';
import AppProfileManager from './appManagers/appProfileManager';
import AppStickersManager from './appManagers/appStickersManager';
import AppUsersManager from './appManagers/appUsersManager';
//import AppSharedMediaManager from './appManagers/appSharedMediaManager';

const appUsersManager = AppUsersManager;
const appChatsManager = AppChatsManager;
const appMessagesIDsManager = AppMessagesIDsManager;
const apiUpdatesManager = ApiUpdatesManager;
const appPhotosManager = AppPhotosManager;
const appMessagesManager = AppMessagesManager;
const appProfileManager = AppProfileManager;
const appImManager = AppImManager;
const appPeersManager = AppPeersManager;
const appStickersManager = AppStickersManager;
const appDocsManager = AppDocsManager;
//export const appSharedMediaManager = AppSharedMediaManager;
const appSidebarRight = AppSidebarRight;
const appSidebarLeft = AppSidebarLeft;
const appMediaViewer = AppMediaViewer;
const appDialogsManager = AppDialogsManager;

(window as any).Services = {
  appUsersManager,
  appChatsManager,
  apiUpdatesManager,
  appMessagesManager,
  appMessagesIDsManager,
  appPeersManager,
  appProfileManager,
  appPhotosManager,
  appDocsManager,

  appDialogsManager,
  appImManager,
  appStickersManager,
  appSidebarRight,
  appSidebarLeft,
  appMediaViewer
  //appSharedMediaManager
};
