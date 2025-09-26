import {createEffect, createRoot, createSignal} from 'solid-js';
import {ScreenSize, useMediaSizes} from '../helpers/mediaSizes';

const hasFoldersSidebarSignal = createRoot(() => {
  const [hasFoldersSidebar, setHasFoldersSidebar] = createSignal(false);

  createEffect(() => {
    document.body.classList.toggle('has-folders-sidebar', hasFoldersSidebar());
  });

  return [hasFoldersSidebar, setHasFoldersSidebar] as const;
});

export default function useHasFoldersSidebar() {
  return hasFoldersSidebarSignal;
};

const hasFoldersSignal = createRoot(() => {
  const [hasFolders, setHasFolders] = createSignal(false);
  return [hasFolders, setHasFolders] as const;
});

export function useHasFolders() {
  return hasFoldersSignal;
}

const isSidebarCollapsedSignal = createRoot(() => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = createSignal(false);
  return [isSidebarCollapsed, setIsSidebarCollapsed] as const;
});

export function useIsSidebarCollapsed() {
  return isSidebarCollapsedSignal;
}

createRoot(() => {
  const [hasFolders] = hasFoldersSignal;
  const [hasFoldersSidebar] = hasFoldersSidebarSignal;
  const [isSidebarCollapsed] = isSidebarCollapsedSignal;
  const mediaSizes = useMediaSizes();
  createEffect(() => {
    document.body.classList.toggle(
      'has-horizontal-folders',
      hasFolders() &&
        (!isSidebarCollapsed() || mediaSizes.activeScreen < ScreenSize.medium) &&
        (!hasFoldersSidebar() || mediaSizes.isLessThanFloatingLeftSidebar)
    );
  });
});
