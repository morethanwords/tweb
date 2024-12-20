import {createContext, useContext} from 'solid-js';
import type {RootScope} from '../../lib/rootScope';
import type {AppSidebarLeft} from '.';
import type AppChatFoldersTab from './tabs/chatFolders';

export type SolidJSHotReloadGuardContextValue = {
  rootScope: RootScope;
  appSidebarLeft: AppSidebarLeft;
  AppChatFoldersTab: typeof AppChatFoldersTab;
};

export const SolidJSHotReloadGuardContext = createContext<SolidJSHotReloadGuardContextValue>(null);

export function useHotReloadGuard() {
  const contextValue = useContext(SolidJSHotReloadGuardContext);
  if(!contextValue) throw new Error('useHotReloadGuard should not be used outside a <SolidJSHotReloadGuardProvider />');

  return contextValue;
}
