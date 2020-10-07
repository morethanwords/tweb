console.log('Services included!');

import AppUsersManager from './appManagers/appUsersManager';
import AppChatsManager from './appManagers/appChatsManager';
import AppMessagesIDsManager from './appManagers/appMessagesIDsManager';
import ApiUpdatesManager from './appManagers/apiUpdatesManager';
import AppPhotosManager from './appManagers/appPhotosManager';
import AppDialogsManager from './appManagers/appDialogsManager';
import AppMessagesManager from './appManagers/appMessagesManager';
import AppProfileManager from './appManagers/appProfileManager';
import AppImManager from './appManagers/appImManager';
import AppPeersManager from './appManagers/appPeersManager';
import AppStickersManager from './appManagers/appStickersManager';
import AppDocsManager from './appManagers/appDocsManager';
import AppSidebarRight from '../components/sidebarRight';
import AppSidebarLeft from '../components/sidebarLeft';
import AppMediaViewer from './appManagers/appMediaViewer';
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
