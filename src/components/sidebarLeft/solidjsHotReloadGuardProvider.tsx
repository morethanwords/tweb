import {ParentProps} from 'solid-js';

import rootScope from '../../lib/rootScope';

import appSidebarLeft from '.';
import AppChatFoldersTab from './tabs/chatFolders';
import {SolidJSHotReloadGuardContext} from './solidjsHotReloadGuard';

export default function SolidJSHotReloadGuardProvider(props: ParentProps) {
  return (
    <SolidJSHotReloadGuardContext.Provider value={{
      rootScope,
      appSidebarLeft,
      AppChatFoldersTab
    }}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
