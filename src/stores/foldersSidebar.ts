import {createEffect, createRoot, createSignal} from 'solid-js';
import {ScreenSize, useMediaSizes} from '@helpers/mediaSizes';
import {setFoldersSidebarShown} from '@helpers/updateColumnWidths';

const hasFoldersSidebarSignal = createRoot(() => {
  const [hasFoldersSidebar, setHasFoldersSidebar] = createSignal(false);
  const mediaSizes = useMediaSizes();

  // Signal carries the user preference; the body class reflects ACTUAL
  // visibility (preference AND viewport wide enough — folders sidebar is
  // hidden by SCSS at <=925px regardless of preference). updateColumnWidths
  // also gets notified so it can account for the panel's reserved space.
  createEffect(() => {
    const visible = hasFoldersSidebar() && !mediaSizes.isLessThanFloatingLeftSidebar;
    document.body.classList.toggle('has-folders-sidebar', visible);
    setFoldersSidebarShown(visible);
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

// Whether something is open inside the left sidebar (a tab — settings,
// archive, etc., search input focused, or a forum). Mirrors the
// `has-open-tabs` class on `#column-left`; pushed in from
// AppSidebarLeft.onSomethingOpenInsideChange so reactive consumers (e.g.
// the collapsed-search-trigger button) can drive their visibility from a
// signal instead of CSS selectors that combine three sidebar classes.
const hasOpenLeftTabsSignal = createRoot(() => {
  const [hasOpenLeftTabs, setHasOpenLeftTabs] = createSignal(false);
  return [hasOpenLeftTabs, setHasOpenLeftTabs] as const;
});

export function useHasOpenLeftTabs() {
  return hasOpenLeftTabsSignal;
}

// Whether the left sidebar's search input is focused / search panel is open.
// Drives the burger element's "back-arrow vs menu icon" state via a Solid
// effect so the class wiring stays in one place — combined with
// useHasFoldersSidebar, which pins the back state on permanently when the
// folders panel provides the main menu trigger.
const isLeftSearchActiveSignal = createRoot(() => {
  const [isLeftSearchActive, setIsLeftSearchActive] = createSignal(false);
  return [isLeftSearchActive, setIsLeftSearchActive] as const;
});

export function useIsLeftSearchActive() {
  return isLeftSearchActiveSignal;
}

createRoot(() => {
  const [hasFolders] = hasFoldersSignal;
  const [hasFoldersSidebar] = hasFoldersSidebarSignal;
  const [isSidebarCollapsed] = isSidebarCollapsedSignal;
  const mediaSizes = useMediaSizes();
  createEffect(() => {
    const hasFolders$ = hasFolders();
    const hasHorizontal = (!isSidebarCollapsed() || mediaSizes.activeScreen < ScreenSize.medium) &&
      (!hasFoldersSidebar() || mediaSizes.isLessThanFloatingLeftSidebar);
    const hasVertical = !hasHorizontal;
    document.body.classList.toggle(
      'has-horizontal-folders',
      hasFolders$ && hasHorizontal
    );
    document.body.classList.toggle(
      'has-vertical-folders',
      hasFolders$ && hasVertical
    );
  });
});
